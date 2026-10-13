// Aviso al cerrar sesión con cambios sin confirmar (SPEC-0005 RF-017; PLAN-0005 §2.5).
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import * as api from "../api/auth";
import { memoryDb, memoryEnv } from "../test-utils/sync";
import LogoutDialog from "./LogoutDialog";
import { OWNER_DOC_ID } from "./localDb";
import type { SyncEnv } from "./resources";
import SyncProvider from "./SyncProvider";
import { useSync } from "./useSync";

afterEach(() => vi.restoreAllMocks());

/** Botones de la página privada: crear una bóveda y cerrar sesión. */
function Controls() {
  const { vaults, requestLogout, rejections } = useSync();
  return (
    <>
      <p>rechazos {rejections.length}</p>
      <button type="button" onClick={() => void vaults.create({ name: "Notas", description: null, tags: [] })}>
        crear
      </button>
      <button type="button" onClick={requestLogout}>
        Cerrar sesión
      </button>
      <LogoutDialog />
    </>
  );
}

function renderApp(env: SyncEnv) {
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/login" element={<p>pantalla login</p>} />
        <Route
          path="*"
          element={
            <SyncProvider sub="u1" paused={false} env={env}>
              <Controls />
            </SyncProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

/** La réplica se borró: al reabrir con ese nombre ya no tiene el documento de dueño. */
async function expectDestroyed(localName: string) {
  await expect(memoryDb(localName).get(OWNER_DOC_ID)).rejects.toMatchObject({ status: 404 });
}

/** Crea una bóveda (cambio sin confirmar) y abre el aviso. */
async function openWithPending(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "crear" }));
  await waitFor(async () => {
    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(screen.getByRole("dialog", { name: "Hay cambios sin sincronizar" })).toBeInTheDocument();
  });
  return screen.getByRole("dialog");
}

test("RF-017: sin cambios pendientes sale directo y borra la réplica", async () => {
  const logout = vi.spyOn(api, "logout").mockResolvedValue();
  const { env, fake, localName } = memoryEnv();
  const user = renderApp(env);
  await user.click(await screen.findByRole("button", { name: "Cerrar sesión" }));
  expect(await screen.findByText("pantalla login")).toBeInTheDocument();
  expect(logout).toHaveBeenCalledOnce();
  expect(fake.replicator.stop).toHaveBeenCalled();
  await expectDestroyed(localName);
});

test("RF-017: con cambios pendientes y conexión ofrece las tres opciones", async () => {
  const { env } = memoryEnv();
  const user = renderApp(env);
  const dialog = await openWithPending(user);
  expect(within(dialog).getAllByRole("button").map((button) => button.textContent)).toEqual([
    "Sincronizar y salir",
    "Salir y descartar",
    "Cancelar",
  ]);
});

test("RF-017: sin conexión sólo ofrece salir y descartar o cancelar", async () => {
  const { env, fake } = memoryEnv();
  const user = renderApp(env);
  await screen.findByRole("button", { name: "crear" });
  fake.emit({ type: "paused", direction: "push", offline: true });
  const dialog = await openWithPending(user);
  expect(within(dialog).getAllByRole("button").map((button) => button.textContent)).toEqual(["Salir y descartar", "Cancelar"]);
});

test("un cambio rechazado también cuenta como no confirmado", async () => {
  const { env, fake } = memoryEnv();
  const user = renderApp(env);
  await screen.findByRole("button", { name: "crear" });
  fake.emit({ type: "denied", id: "vault:11111111-1111-4111-8111-111111111111", rev: "1-a", reason: "vault-name-taken" });
  await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
});

test("«Cancelar» cierra el aviso sin salir", async () => {
  const logout = vi.spyOn(api, "logout").mockResolvedValue();
  const { env } = memoryEnv();
  const user = renderApp(env);
  const dialog = await openWithPending(user);
  await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(logout).not.toHaveBeenCalled();
});

test("«Salir y descartar» cierra la sesión y borra la réplica con sus cambios", async () => {
  const logout = vi.spyOn(api, "logout").mockResolvedValue();
  const { env, remote, localName } = memoryEnv();
  const user = renderApp(env);
  const dialog = await openWithPending(user);
  await user.click(within(dialog).getByRole("button", { name: "Salir y descartar" }));
  expect(await screen.findByText("pantalla login")).toBeInTheDocument();
  expect(logout).toHaveBeenCalledOnce();
  await expectDestroyed(localName);
  expect((await remote.info()).doc_count).toBe(0);
});

test("RF-017: «Sincronizar y salir» sube los cambios y sale cuando el servidor los confirma", async () => {
  vi.spyOn(api, "logout").mockResolvedValue();
  const { env, remote, localName } = memoryEnv();
  const user = renderApp(env);
  const dialog = await openWithPending(user);
  await user.click(within(dialog).getByRole("button", { name: "Sincronizar y salir" }));
  expect(await screen.findByText("pantalla login")).toBeInTheDocument();
  const { rows } = await remote.allDocs({ include_docs: true, startkey: "vault:", endkey: "vault:￰" });
  expect(rows.map((row) => row.doc)).toEqual([expect.objectContaining({ name: "Notas", owner_id: "u1" })]);
  await expectDestroyed(localName);
});

test("RF-017: si el servidor rechaza un cambio, «Sincronizar y salir» vuelve al aviso", async () => {
  const logout = vi.spyOn(api, "logout").mockResolvedValue();
  const { env, remote, localName } = memoryEnv();
  // El servidor rechaza cada revisión del lote como lo hace el push validado (RF-006), con la
  // forma que entrega el adaptador http de PouchDB (`name` es lo que lo marca como `denied`).
  vi.spyOn(remote, "bulkDocs").mockImplementation((async (request: { docs: { _id: string; _rev: string }[] }) =>
    request.docs.map((doc) => ({ id: doc._id, rev: doc._rev, error: "forbidden", name: "forbidden", status: 403, reason: "vault-name-taken" }))) as never);
  const user = renderApp(env);
  const dialog = await openWithPending(user);
  await user.click(within(dialog).getByRole("button", { name: "Sincronizar y salir" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "No se pudieron sincronizar todos los cambios. Revisa los cambios rechazados o inténtalo de nuevo.",
  );
  // El rechazo llegó por el evento `denied` del push de una vez y quedó en la lista (RF-006).
  expect(screen.getByText("rechazos 1")).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "Salir y descartar" })).toBeEnabled();
  expect(logout).not.toHaveBeenCalled();
  expect((await memoryDb(localName).get(OWNER_DOC_ID))._id).toBe(OWNER_DOC_ID);
});

test("RF-017: si el push falla, «Sincronizar y salir» vuelve al aviso", async () => {
  const logout = vi.spyOn(api, "logout").mockResolvedValue();
  const { env, remote } = memoryEnv();
  vi.spyOn(remote, "bulkDocs").mockRejectedValue(Object.assign(new Error("Service Unavailable"), { status: 503 }));
  const user = renderApp(env);
  const dialog = await openWithPending(user);
  await user.click(within(dialog).getByRole("button", { name: "Sincronizar y salir" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("No se pudieron sincronizar todos los cambios.");
  expect(logout).not.toHaveBeenCalled();
});

test("si el servidor no cierra la sesión no borra nada y lo avisa", async () => {
  vi.spyOn(api, "logout").mockRejectedValue(new Error("sin red"));
  const { env, localName } = memoryEnv();
  const user = renderApp(env);
  await user.click(await screen.findByRole("button", { name: "Cerrar sesión" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cerrar la sesión. Inténtalo de nuevo.");
  expect(screen.queryByText("pantalla login")).not.toBeInTheDocument();
  expect((await memoryDb(localName).get(OWNER_DOC_ID))._id).toBe(OWNER_DOC_ID);
});
