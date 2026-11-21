// Mantener al día una bóveda compartida abierta (H-064 F7e): revocación, cambio de concesiones y copias que ya no se pueden leer.
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PouchDB from "pouchdb-browser";
import memory from "pouchdb-adapter-memory";
import { useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MeContext } from "../auth/RequireAuth";
import type { Me } from "../api/auth";
import { memoryDb, memoryEnv, syncValue, uniqueName, WithSync } from "../test-utils/sync";
import * as resourcesModule from "../sync/resources";
import { rememberSharedReplica } from "../sync/sharedReplicas";
import { useSync } from "../sync/useSync";
import SharedVaultPage from "./SharedVaultPage";
import * as api from "./sharingApi";

PouchDB.plugin(memory);
const probe = vi.hoisted(() => ({ Component: null as null | (() => JSX.Element | null) }));
vi.mock("../notes/VaultWorkspacePage", () => ({ default: () => (probe.Component ? probe.Component() : null) }));

const VAULT = "11111111-1111-4111-8111-111111111111";
const NOTE = `note:${VAULT}:00000001-0000-4000-8000-000000000000`;
const ME: Me = { user_id: "u1", email: "u1@example.com", role: "guest", must_change_password: false, display_name: null, photo_url: null };
const READ: api.Grant[] = [{ folder: "Pub", level: "lectura" }];
const WRITE: api.Grant[] = [{ folder: "Pub", level: "lectura" }, { folder: "Docs", level: "escritura" }];

const invitation = (grants: api.Grant[] = READ, over: Partial<api.Invitation> = {}): api.Invitation => ({
  id: "m1", vault_id: VAULT, status: "activo", created_at: "2026-11-20T10:00:00Z", responded_at: null,
  owner: { id: "o1", email: "ana@example.com", display_name: "Ana" }, vault_name: "Plan", grants, ...over,
});

function Workspace() {
  const sync = useSync();
  const [writes, setWrites] = useState("nada");
  return (
    <div>
      <p>permisos {sync.shared?.grants.map((g) => `${g.folder}:${g.level}`).join(",")}</p>
      <p>solo lectura {String(sync.shared?.readOnly)}</p>
      <button type="button" onClick={() => sync.notes.create(VAULT, "Docs/Nueva").then(() => setWrites("escribió"), () => setWrites("denegado"))}>escribir</button>
      <p>resultado {writes}</p>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  probe.Component = Workspace;
  vi.spyOn(api, "listInvitations").mockResolvedValue({ items: [invitation()] });
});
afterEach(() => vi.restoreAllMocks());

function renderPage(env = memoryEnv(), watchMs = 25) {
  const { value } = syncValue();
  render(
    <MeContext.Provider value={ME}>
      <WithSync value={value}>
        <MemoryRouter initialEntries={[`/compartidas/${VAULT}`]}>
          <Routes>
            <Route path="/compartidas/:id" element={<SharedVaultPage env={env.env} watchMs={watchMs} />} />
          </Routes>
        </MemoryRouter>
      </WithSync>
    </MeContext.Provider>,
  );
  return env;
}

const replicaName = (env: ReturnType<typeof memoryEnv>) => `${env.localName}-shared-${VAULT}`;
const docCount = async (name: string) => (await new PouchDB(name, { adapter: "memory" }).info()).doc_count;

test("si le quitan el acceso, lo detecta en el sondeo, lo dice y destruye la réplica local", async () => {
  const env = renderPage();
  await screen.findByText(/^permisos /);
  await new PouchDB(replicaName(env), { adapter: "memory" }).put({ _id: NOTE, dato: "de otra persona" });
  expect(await docCount(replicaName(env))).toBe(1);
  vi.mocked(api.listInvitations).mockResolvedValue({ items: [] });
  expect(await screen.findByText(/Esta bóveda ya no está disponible/)).toBeInTheDocument();
  await waitFor(async () => expect(await docCount(replicaName(env))).toBe(0), { timeout: 6000 });
  expect(JSON.parse(localStorage.getItem("synapse-shared-replicas") ?? "[]")).toEqual([]);
});

test("una invitación que sigue activa pero ya no lo es para esta bóveda (revocada) también cuenta como acceso perdido", async () => {
  renderPage();
  await screen.findByText(/^permisos /);
  vi.mocked(api.listInvitations).mockResolvedValue({ items: [invitation(READ, { status: "pendiente" })] });
  expect(await screen.findByText(/Esta bóveda ya no está disponible/)).toBeInTheDocument();
});

test("un fallo de red en el sondeo no cambia nada ni cierra la bóveda", async () => {
  const env = renderPage();
  await screen.findByText(/^permisos /);
  vi.mocked(api.listInvitations).mockRejectedValue(new Error("sin red"));
  await act(() => new Promise((resolve) => setTimeout(resolve, 120)));
  expect(screen.getByText(/^permisos /)).toBeInTheDocument();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(env.fake.create).toHaveBeenCalledTimes(1);
});

test("con las mismas concesiones el sondeo no reabre la réplica, aunque se repita", async () => {
  const env = renderPage();
  await screen.findByText(/^permisos /);
  await act(() => new Promise((resolve) => setTimeout(resolve, 150)));
  expect(vi.mocked(api.listInvitations).mock.calls.length).toBeGreaterThan(2);
  expect(env.fake.create).toHaveBeenCalledTimes(1);
});

test("si cambian las concesiones reabre con las nuevas (y deja de ser de solo lectura si ahora puede escribir)", async () => {
  const env = renderPage();
  await screen.findByText("permisos Pub:lectura");
  expect(screen.getByText("solo lectura true")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "escribir" }));
  expect(await screen.findByText("resultado denegado")).toBeInTheDocument();

  vi.mocked(api.listInvitations).mockResolvedValue({ items: [invitation(WRITE)] });
  expect(await screen.findByText("permisos Pub:lectura,Docs:escritura", {}, { timeout: 6000 })).toBeInTheDocument();
  expect(screen.getByText("solo lectura false")).toBeInTheDocument();
  expect(env.fake.create).toHaveBeenCalledTimes(2);
  await userEvent.click(screen.getByRole("button", { name: "escribir" }));
  expect(await screen.findByText("resultado escribió")).toBeInTheDocument();
});

test("al volver a la ventana comprueba el acceso sin esperar al sondeo", async () => {
  renderPage(memoryEnv(), 60_000);
  await screen.findByText(/^permisos /);
  vi.mocked(api.listInvitations).mockResolvedValue({ items: [] });
  act(() => void window.dispatchEvent(new Event("focus")));
  expect(await screen.findByText(/Esta bóveda ya no está disponible/)).toBeInTheDocument();
});

test("se pone al día y quedan copias que el servidor ya no deja leer: reconstruye la réplica", async () => {
  // El servidor no lista la nota a esta persona, pero conoce su revisión (la movieron o le redujeron las concesiones).
  const ghost = memoryDb(uniqueName("remote"));
  vi.spyOn(ghost, "allDocs").mockResolvedValue({ total_rows: 0, offset: 0, rows: [] });
  vi.spyOn(ghost, "revsDiff").mockResolvedValue({});
  const env = renderPage(memoryEnv({ createRemote: () => ghost }), 60_000);
  await screen.findByText(/^permisos /);
  await new PouchDB(replicaName(env), { adapter: "memory" }).put({ _id: NOTE, type: "note", content: "ya no legible" });
  env.fake.emit({ type: "paused", direction: "pull", offline: false });
  await waitFor(() => expect(env.fake.create).toHaveBeenCalledTimes(2), { timeout: 6000 });
  await waitFor(async () => expect(await new PouchDB(replicaName(env), { adapter: "memory" }).get(NOTE).then(() => true, () => false)).toBe(false), { timeout: 6000 });
});

test("se pone al día y todo es legible: no reconstruye", async () => {
  const readable = memoryDb(uniqueName("remote"));
  vi.spyOn(readable, "allDocs").mockResolvedValue({ total_rows: 1, offset: 0, rows: [{ id: NOTE, key: NOTE, value: { rev: "1-x" } }] });
  const env = renderPage(memoryEnv({ createRemote: () => readable }), 60_000);
  await screen.findByText(/^permisos /);
  await new PouchDB(replicaName(env), { adapter: "memory" }).put({ _id: NOTE, type: "note", content: "legible" });
  env.fake.emit({ type: "paused", direction: "pull", offline: false });
  await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
  expect(env.fake.create).toHaveBeenCalledTimes(1);
});

test("avisa de los cambios descartados al reconstruir y el aviso se puede cerrar", async () => {
  const real = resourcesModule.openSyncResources;
  vi.spyOn(resourcesModule, "openSyncResources").mockImplementation(async (...args) => Object.assign(await real(...args), { discarded: 2 }));
  renderPage();
  expect(await screen.findByRole("status")).toHaveTextContent("Se descartaron 2 cambios tuyos en carpetas donde ya no tienes escritura.");
  await userEvent.click(screen.getByRole("button", { name: "Entendido" }));
  expect(screen.queryByRole("status")).toBeNull();
});

test("sin cambios descartados no hay aviso", async () => {
  renderPage();
  await screen.findByText(/^permisos /);
  expect(screen.queryByRole("status")).toBeNull();
});

test("al abrir, destruye las réplicas de otras bóvedas de las que ya no es miembro", async () => {
  const stale = `${memoryEnv().localName}-shared-22222222-2222-4222-8222-222222222222`;
  await new PouchDB(stale, { adapter: "memory" }).put({ _id: "x" });
  rememberSharedReplica(stale, "u1");
  vi.mocked(api.listInvitations).mockResolvedValue({ items: [] });
  renderPage();
  await screen.findByText(/Esta bóveda ya no está disponible/);
  await waitFor(() => expect(JSON.parse(localStorage.getItem("synapse-shared-replicas") ?? "[]")).toEqual([]));
});

test("al cambiar las concesiones nunca se publican los permisos nuevos con los almacenes viejos", async () => {
  const seen = new Map<boolean, Set<unknown>>([[true, new Set()], [false, new Set()]]);
  probe.Component = () => {
    const sync = useSync();
    seen.get(sync.shared!.readOnly)!.add(sync.notes);
    return <p>permisos {sync.shared?.grants.map((g) => `${g.folder}:${g.level}`).join(",")}</p>;
  };
  renderPage();
  await screen.findByText("permisos Pub:lectura");
  vi.mocked(api.listInvitations).mockResolvedValue({ items: [invitation(WRITE)] });
  await screen.findByText("permisos Pub:lectura,Docs:escritura", {}, { timeout: 6000 });
  expect(seen.get(true)!.size).toBe(1);
  expect(seen.get(false)!.size).toBe(1);
  const [readOnlyStore] = [...seen.get(true)!];
  expect(seen.get(false)!.has(readOnlyStore)).toBe(false);
});

test("al volver a la ventana comprueba si quedan copias ilegibles (mover una nota fuera de lo legible no emite ningún cambio)", async () => {
  const ghost = memoryDb(uniqueName("remote"));
  vi.spyOn(ghost, "allDocs").mockResolvedValue({ total_rows: 0, offset: 0, rows: [] });
  vi.spyOn(ghost, "revsDiff").mockResolvedValue({});
  const env = renderPage(memoryEnv({ createRemote: () => ghost }), 60_000);
  await screen.findByText(/^permisos /);
  await new PouchDB(replicaName(env), { adapter: "memory" }).put({ _id: NOTE, type: "note", content: "movida fuera" });
  act(() => void window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(env.fake.create).toHaveBeenCalledTimes(2), { timeout: 6000 });
});

test("no reconstruye más de una vez cada 30 s aunque la copia ilegible persista", async () => {
  const ghost = memoryDb(uniqueName("remote"));
  vi.spyOn(ghost, "allDocs").mockResolvedValue({ total_rows: 0, offset: 0, rows: [] });
  vi.spyOn(ghost, "revsDiff").mockResolvedValue({});
  const env = renderPage(memoryEnv({ createRemote: () => ghost }), 60_000);
  await screen.findByText(/^permisos /);
  const put = () => new PouchDB(replicaName(env), { adapter: "memory" }).put({ _id: NOTE, type: "note", content: "persistente" }).catch(() => undefined);
  await put();
  act(() => void window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(env.fake.create).toHaveBeenCalledTimes(2), { timeout: 6000 });
  await screen.findByText(/^permisos /);
  await put();
  for (let i = 0; i < 3; i++) act(() => void window.dispatchEvent(new Event("focus")));
  await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
  expect(env.fake.create).toHaveBeenCalledTimes(2);
});
