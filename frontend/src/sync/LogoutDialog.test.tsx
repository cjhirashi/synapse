// Aviso al cerrar sesión con cambios sin confirmar (SPEC-0005 RF-017; PLAN-0005 §2.5, §12).
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import * as api from "../api/auth";
import { memoryDb, memoryEnv } from "../test-utils/sync";
import LocalCopyNotice from "./LocalCopyNotice";
import LogoutDialog from "./LogoutDialog";
import * as localDb from "./localDb";
import { OWNER_DOC_ID } from "./localDb";
import type { SyncEnv } from "./resources";
import SyncProvider from "./SyncProvider";
import { useSync } from "./useSync";

afterEach(() => vi.restoreAllMocks());

const NEW_VAULT = { name: "Notas", description: null, tags: [] };

/** Botones de la página privada: crear una bóveda y cerrar sesión. */
function Controls() {
  const { vaults, requestLogout, rejections, status } = useSync();
  return (
    <>
      <p>rechazos {rejections.length}</p>
      <p>pendientes {status.pending ? "sí" : "no"}</p>
      <button type="button" onClick={() => void vaults.create(NEW_VAULT)}>
        crear
      </button>
      {/* Escribe y pide salir enseguida, con el `requestLogout` de este render (VC-4). */}
      <button
        type="button"
        onClick={async () => {
          await vaults.create(NEW_VAULT);
          await requestLogout();
        }}
      >
        crear y salir
      </button>
      <button type="button" onClick={() => void requestLogout()}>
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
        {/* Como en `App.tsx`: el aviso de la copia que no se pudo borrar va en el login (VE-1). */}
        <Route
          path="/login"
          element={
            <>
              <LocalCopyNotice />
              <p>pantalla login</p>
            </>
          }
        />
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

const COPY_KEPT = "No se pudo borrar la copia local de este dispositivo.";

/** La réplica se borró: al reabrir con ese nombre ya no tiene el documento de dueño. */
async function expectDestroyed(localName: string) {
  await expect(memoryDb(localName).get(OWNER_DOC_ID)).rejects.toMatchObject({ status: 404 });
}

/**
 * Crea una bóveda (cambio sin confirmar) y abre el aviso. Espera a ver el pendiente antes de
 * pulsar, y pulsa una sola vez: dentro de `waitFor` el clic se repetiría (VC-4).
 */
async function openWithPending(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "crear" }));
  expect(await screen.findByText("pendientes sí")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
  return screen.findByRole("dialog", { name: "Hay cambios sin sincronizar" });
}

test("RF-017: sin cambios pendientes sale directo y borra la réplica", async () => {
  const logout = vi.spyOn(api, "logout").mockResolvedValue();
  const { env, fake, localName } = memoryEnv();
  const user = renderApp(env);
  await user.click(await screen.findByRole("button", { name: "Cerrar sesión" }));
  expect(await screen.findByText("pantalla login")).toBeInTheDocument();
  expect(logout).toHaveBeenCalledOnce();
  expect(fake.replicator.stop).toHaveBeenCalled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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

test("RF-017: decide con el estado actual aunque la pantalla aún no muestre el cambio (VC-4)", async () => {
  const logout = vi.spyOn(api, "logout").mockResolvedValue();
  const { env, localName } = memoryEnv();
  const user = renderApp(env);
  await user.click(await screen.findByRole("button", { name: "crear y salir" }));
  expect(await screen.findByRole("dialog", { name: "Hay cambios sin sincronizar" })).toBeInTheDocument();
  expect(logout).not.toHaveBeenCalled();
  expect((await memoryDb(localName).get(OWNER_DOC_ID))._id).toBe(OWNER_DOC_ID);
  // La pantalla termina por mostrar el cambio: se espera para no dejar el render en el aire.
  expect(await screen.findByText("pendientes sí")).toBeInTheDocument();
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

/**
 * Réplica en error (IndexedDB): guarda la que abre el proveedor y, al llamar a la función
 * devuelta, hace que leerla falle desde ese momento. `info()` es propio de cada instancia de
 * PouchDB, así que el espía va sobre la réplica abierta, no sobre un prototipo.
 */
function replicaThatBreaks() {
  const open = localDb.openLocalDb;
  let replica: PouchDB.Database | null = null;
  vi.spyOn(localDb, "openLocalDb").mockImplementation(async (...args) => (replica = await open(...args)));
  return () => {
    if (!replica) throw new Error("el proveedor aún no abrió la réplica");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(replica, "info").mockRejectedValue(new Error("IndexedDB no disponible"));
  };
}

test("RF-017: si la réplica no puede leerse, lo dice y no ofrece sincronizar (VE-2)", async () => {
  const logout = vi.spyOn(api, "logout").mockResolvedValue();
  const breakReads = replicaThatBreaks();
  const { env } = memoryEnv();
  const user = renderApp(env);
  await screen.findByRole("button", { name: "crear" });
  breakReads();
  await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
  const dialog = await screen.findByRole("dialog", { name: "No se pudo comprobar si hay cambios sin sincronizar" });
  expect(dialog).toHaveTextContent("No se pudo leer la copia de tus bóvedas en este dispositivo.");
  expect(within(dialog).getAllByRole("button").map((button) => button.textContent)).toEqual(["Salir y descartar", "Cancelar"]);
  expect(logout).not.toHaveBeenCalled();
});

test("RF-017: si la réplica no se borra tras cerrar la sesión, va al login y lo avisa (VE-1)", async () => {
  const logout = vi.spyOn(api, "logout").mockResolvedValue();
  const destroy = vi.spyOn(localDb, "destroyLocalDb").mockRejectedValue(new Error("IndexedDB no disponible"));
  const breakReads = replicaThatBreaks();
  const { env, localName } = memoryEnv();
  const user = renderApp(env);
  await screen.findByRole("button", { name: "crear" });
  breakReads();
  await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Salir y descartar" }));
  expect(await screen.findByText("pantalla login")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(COPY_KEPT);
  expect(logout).toHaveBeenCalledOnce();
  expect(destroy).toHaveBeenCalledOnce();
  // La copia sigue en el dispositivo: la borra RF-018 si entra otro usuario.
  expect((await memoryDb(localName).get(OWNER_DOC_ID))._id).toBe(OWNER_DOC_ID);
});

test("RF-017: la salida directa también llega al login con el aviso si el borrado falla (VE-1)", async () => {
  vi.spyOn(api, "logout").mockResolvedValue();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(localDb, "destroyLocalDb").mockRejectedValue(new Error("IndexedDB no disponible"));
  const { env } = memoryEnv();
  const user = renderApp(env);
  await user.click(await screen.findByRole("button", { name: "Cerrar sesión" }));
  expect(await screen.findByText("pantalla login")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(COPY_KEPT);
  expect(console.error).toHaveBeenCalled();
});

test("RF-017: si cerrar la réplica falla al salir, llega al login con el aviso y sin rechazos sueltos (VE-1)", async () => {
  vi.spyOn(api, "logout").mockResolvedValue();
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const { env, fake, localName } = memoryEnv();
  // `close()` falla en la salida y otra vez (la misma promesa) al desmontar el proveedor.
  vi.mocked(fake.replicator.stop).mockRejectedValue(new Error("IndexedDB no disponible"));
  const user = renderApp(env);
  await user.click(await screen.findByRole("button", { name: "Cerrar sesión" }));
  expect(await screen.findByText("pantalla login")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(COPY_KEPT);
  await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(2));
  expect((await memoryDb(localName).get(OWNER_DOC_ID))._id).toBe(OWNER_DOC_ID);
});
