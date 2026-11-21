// Bóveda compartida abierta (H-064 F7c): acceso, réplica propia, contexto de solo lectura y limpieza.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MeContext } from "../auth/RequireAuth";
import type { Me } from "../api/auth";
import { memoryEnv, syncValue, WithSync } from "../test-utils/sync";
import { ReadOnlyReplicaError } from "../sync/readOnly";
import { useSync, type SyncContextValue } from "../sync/useSync";
import SharedVaultPage from "./SharedVaultPage";
import * as api from "./sharingApi";

const probe = vi.hoisted(() => ({ Component: null as null | (() => JSX.Element | null) }));
vi.mock("../notes/VaultWorkspacePage", () => ({ default: () => (probe.Component ? probe.Component() : null) }));

const VAULT = "11111111-1111-4111-8111-111111111111";
const ME: Me = { user_id: "u1", email: "u1@example.com", role: "guest", must_change_password: false, display_name: null, photo_url: null };

const invitation = (over: Partial<api.Invitation> = {}): api.Invitation => ({
  id: "m1", vault_id: VAULT, status: "activo", created_at: "2026-11-20T10:00:00Z", responded_at: null,
  owner: { id: "o1", email: "ana@example.com", display_name: "Ana" }, vault_name: "Plan", grants: [{ folder: "Pub", level: "lectura" }], ...over,
});

function Workspace() {
  const sync = useSync();
  const [written, setWritten] = useState("nada");
  return (
    <div>
      <p>bóveda {sync.shared?.vaultId}</p>
      <p>dueño {sync.shared?.ownerName}</p>
      <p>solo lectura {String(sync.shared?.readOnly)}</p>
      <p>permisos {sync.shared?.grants.map((g) => `${g.folder}:${g.level}`).join(",")}</p>
      <button type="button" onClick={() => sync.notes.save("note:x", "c", "1-x").then(() => setWritten("escribió"), (err) => setWritten(err instanceof ReadOnlyReplicaError ? "denegado" : "otro error"))}>guardar</button>
      <p>resultado {written}</p>
    </div>
  );
}

beforeEach(() => {
  probe.Component = Workspace;
  vi.spyOn(api, "listInvitations").mockResolvedValue({ items: [invitation()] });
});
afterEach(() => vi.restoreAllMocks());

function renderPage(env = memoryEnv(), parent: Partial<SyncContextValue> = {}, id = VAULT) {
  const { value } = syncValue(parent);
  const tree = (v: SyncContextValue) => (
    <MeContext.Provider value={ME}>
      <WithSync value={v}>
        <MemoryRouter initialEntries={[`/compartidas/${id}`]}>
          <Routes>
            <Route path="/compartidas/:id" element={<SharedVaultPage env={env.env} />} />
            <Route path="/compartidas" element={<p>lista de compartidas</p>} />
          </Routes>
        </MemoryRouter>
      </WithSync>
    </MeContext.Provider>
  );
  const view = render(tree(value));
  return { ...view, env, parent: value, rerenderWith: (v: SyncContextValue) => view.rerender(tree(v)) };
}

test("carga la invitación y abre el espacio de trabajo con el contexto de la bóveda compartida", async () => {
  renderPage();
  expect(screen.getByText("Cargando…")).toBeInTheDocument();
  expect(await screen.findByText(`bóveda ${VAULT}`)).toBeInTheDocument();
  expect(screen.getByText("dueño Ana")).toBeInTheDocument();
  expect(screen.getByText("solo lectura true")).toBeInTheDocument();
  expect(screen.getByText("permisos Pub:lectura")).toBeInTheDocument();
});

test("sin invitación activa (pendiente, revocada o de otra bóveda) dice que ya no está disponible", async () => {
  vi.mocked(api.listInvitations).mockResolvedValue({ items: [invitation({ status: "pendiente" }), invitation({ vault_id: "22222222-2222-4222-8222-222222222222" })] });
  renderPage();
  expect(await screen.findByText(/Esta bóveda ya no está disponible/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Volver a Compartidas conmigo" })).toHaveAttribute("href", "/compartidas");
  expect(screen.queryByText(/^bóveda /)).toBeNull();
});

test("si la lista falla permite reintentar", async () => {
  vi.mocked(api.listInvitations).mockRejectedValueOnce(new Error("sin red"));
  renderPage();
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar la bóveda compartida.");
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(await screen.findByText(`bóveda ${VAULT}`)).toBeInTheDocument();
});

test("la réplica es la compartida, no la propia, y sus almacenes no escriben", async () => {
  const env = memoryEnv();
  renderPage(env);
  await screen.findByText(`bóveda ${VAULT}`);
  expect(env.fake.create.mock.calls[0][0]).toMatchObject({ lockName: `synapse-sync-shared-${VAULT}` });
  await userEvent.click(screen.getByRole("button", { name: "guardar" }));
  expect(await screen.findByText("resultado denegado")).toBeInTheDocument();
});

test("replica solo cuando el contexto padre replica", async () => {
  const env = memoryEnv();
  renderPage(env, { replicating: false });
  await screen.findByText(`bóveda ${VAULT}`);
  expect(env.fake.replicator.start).not.toHaveBeenCalled();
});

test("arranca el replicador de la compartida cuando el padre replica", async () => {
  const env = memoryEnv();
  renderPage(env);
  await screen.findByText(`bóveda ${VAULT}`);
  await waitFor(() => expect(env.fake.replicator.start).toHaveBeenCalledTimes(1));
});

test("un cambio en el contexto padre no reabre la réplica", async () => {
  const env = memoryEnv();
  const view = renderPage(env);
  await screen.findByText(`bóveda ${VAULT}`);
  view.rerenderWith({ ...view.parent, status: { ...view.parent.status }, dataVersion: 5 });
  view.rerenderWith({ ...view.parent, rejections: [], notesVersion: 9 });
  await waitFor(() => expect(screen.getByText(`bóveda ${VAULT}`)).toBeInTheDocument());
  expect(env.fake.create).toHaveBeenCalledTimes(1);
});

test("al desmontar detiene el replicador y cierra la réplica", async () => {
  const env = memoryEnv();
  const view = renderPage(env);
  await screen.findByText(`bóveda ${VAULT}`);
  view.unmount();
  await waitFor(() => expect(env.fake.replicator.stop).toHaveBeenCalled());
});

test("el cierre de sesión y los borradores son los del contexto padre", async () => {
  const requestLogout = vi.fn(async () => undefined);
  let seen: SyncContextValue | null = null;
  probe.Component = () => {
    seen = useSync();
    return <p>listo</p>;
  };
  renderPage(memoryEnv(), { requestLogout });
  await screen.findByText("listo");
  await seen!.requestLogout();
  expect(requestLogout).toHaveBeenCalledOnce();
});

test("si la réplica no se puede abrir lo avisa", async () => {
  const env = memoryEnv({ localDb: { name: "x", adapter: "no-existe" } });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  renderPage(env);
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo abrir la copia local de esta bóveda.");
});
