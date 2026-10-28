import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import App from "./App";
import * as api from "./api/auth";
import * as apiKeys from "./settings/apiKeys";
import * as localDb from "./sync/localDb";
import { memoryDb, memoryEnv } from "./test-utils/sync";
import { createVaultStore } from "./sync/vaultStore";

afterEach(() => vi.restoreAllMocks());

/** Sesión válida; la réplica local es una base en memoria nueva en cada prueba. */
function signedIn(mustChangePassword = false) {
  vi.spyOn(api, "getMe").mockResolvedValue({ user_id: "1", email: "test@synapse.local", role: "guest", must_change_password: mustChangePassword });
  return memoryEnv();
}

function renderAt(path: string, env = memoryEnv().env) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App syncEnv={env} />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

/** «Cambiar contraseña»/«Cerrar sesión» viven dentro del menú de cuenta: hay que abrirlo. */
async function openAccountMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /^Menú de cuenta/ }));
}

test("RF-023: las rutas privadas muestran la navegación de cuenta", async () => {
  const { env } = signedIn();
  const user = renderAt("/", env);
  await openAccountMenu(user);
  expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Cambiar contraseña" })).toBeInTheDocument();
});

test("la pantalla de login no muestra la navegación de cuenta", () => {
  renderAt("/login");
  expect(screen.queryByRole("button", { name: /^Menú de cuenta/ })).not.toBeInTheDocument();
});

test("RF-018: `/` redirige a la lista de bóvedas de la réplica", async () => {
  const { env } = signedIn();
  renderAt("/", env);
  expect(await screen.findByRole("heading", { name: "Bóvedas" })).toBeInTheDocument();
  expect(await screen.findByText("Aún no tienes bóvedas.")).toBeInTheDocument();
});

test.each([
  ["/vaults", "Bóvedas"],
  ["/vaults/new", "Nueva bóveda"],
  ["/vaults/trash", "Papelera"],
  ["/rejections", "Cambios rechazados"],
  ["/conflicts", "Conflictos"],
])("RF-009: %s muestra su pantalla", async (path, heading) => {
  const { env } = signedIn();
  renderAt(path, env);
  expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
});

test("RF-009: con la sesión verificada abre la réplica del usuario, replica y muestra la barra", async () => {
  const { env, fake } = signedIn();
  renderAt("/vaults", env);
  const bar = await screen.findByRole("region", { name: "Sincronización" });
  expect(within(bar).getByRole("status")).toBeInTheDocument();
  // `start()` va en un efecto posterior al commit que muestra la barra (backlog 8).
  await waitFor(() => expect(fake.replicator.start).toHaveBeenCalled());
});

test("RF-002: mientras deba cambiar la contraseña no replica (el canal respondería 403)", async () => {
  const { env, fake } = signedIn(true);
  renderAt("/vaults", env);
  expect(await screen.findByRole("heading", { name: "Cambiar contraseña" })).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Sincronización" })).not.toBeInTheDocument();
  expect(fake.replicator.start).not.toHaveBeenCalled();
});

// SPEC-0002 RF-020 (VU-5): al cambiar la contraseña `must_change_password` pasa a false; la app debe
// entrar a las bóvedas en vez de volver al formulario (el estado de sesión en caché estaba obsoleto).
test("SPEC-0002 RF-020: tras el cambio forzado de contraseña se entra a la app, no al formulario vacío", async () => {
  const { env } = signedIn(true);
  const me = { user_id: "1", email: "test@synapse.local", role: "guest" as const };
  // El servidor refleja el cambio: antes del POST exige cambiarla; después ya no.
  let changed = false;
  vi.spyOn(api, "getMe").mockImplementation(async () => ({ ...me, must_change_password: !changed }));
  vi.spyOn(api, "changePassword").mockImplementation(async () => {
    changed = true;
  });
  const user = renderAt("/vaults", env);
  await user.type(await screen.findByLabelText("Contraseña actual"), "semilla-12345");
  await user.type(screen.getByLabelText("Nueva contraseña"), "otra-clave-larga");
  await user.type(screen.getByLabelText("Confirmar nueva contraseña"), "otra-clave-larga");
  await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
  expect(await screen.findByRole("heading", { name: "Bóvedas" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Cambiar contraseña" })).not.toBeInTheDocument();
});

test("RF-019: una bóveda creada en el formulario se lista y se edita desde la réplica", async () => {
  const { env } = signedIn();
  const user = renderAt("/vaults/new", env);
  await user.type(await screen.findByLabelText("Nombre"), "Notas");
  await user.click(screen.getByRole("button", { name: "Crear bóveda" }));
  const item = await screen.findByRole("listitem", { name: "Notas" });
  await user.click(within(item).getByRole("link", { name: "Editar" }));
  expect(await screen.findByRole("heading", { name: "Editar bóveda" })).toBeInTheDocument();
  expect(screen.getByLabelText("Nombre")).toHaveValue("Notas");
});

test("H-002.5: /settings/api-keys monta la gestión de API keys de agente", async () => {
  const { env } = signedIn();
  vi.spyOn(apiKeys, "listAgentKeys").mockResolvedValue([]);
  renderAt("/settings/api-keys", env);
  expect(await screen.findByRole("heading", { name: "API keys" })).toBeInTheDocument();
  expect(await screen.findByText("Aún no tienes API keys.")).toBeInTheDocument();
});

test("RF-017: «Cerrar sesión» sin cambios pendientes cierra la sesión y lleva a /login", async () => {
  const { env } = signedIn();
  const logout = vi.spyOn(api, "logout").mockResolvedValue();
  const user = renderAt("/vaults", env);
  await openAccountMenu(user);
  await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
  expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
  expect(logout).toHaveBeenCalledOnce();
});

test("RF-017: si la réplica no se borra al salir, el login avisa de la copia conservada (VE-1)", async () => {
  const { env } = signedIn();
  vi.spyOn(api, "logout").mockResolvedValue();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(localDb, "destroyLocalDb").mockRejectedValue(new Error("IndexedDB no disponible"));
  const user = renderAt("/vaults", env);
  await openAccountMenu(user);
  await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
  expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("No se pudo borrar la copia local de este dispositivo.");
});

test("RF-001: /vaults/{id} monta la bóveda abierta (riel, árbol y editor vacío)", async () => {
  const { env, localName } = signedIn();
  // La réplica del usuario es la base en memoria con ese nombre: se siembra antes de abrir la app.
  // Con su marca de dueño (`sub` de la sesión): si no, `openLocalDb` la tomaría por ajena y la vaciaría.
  const seed = memoryDb(localName);
  await seed.put({ _id: localDb.OWNER_DOC_ID, sub: "1" });
  const vault = await createVaultStore(seed, "1").create({ name: "Trabajo", description: null, tags: [] });
  renderAt(`/vaults/${vault.id}`, env);
  expect(await screen.findByRole("heading", { level: 1, name: "Trabajo" })).toBeInTheDocument();
  expect(screen.getByText("Abre o crea una nota para empezar.")).toBeInTheDocument();
  expect(await screen.findByRole("link", { name: / Trabajo$/ })).toHaveAttribute("aria-current", "page");
});

test("RF-001: /vaults/{id} de una bóveda inexistente muestra el 404 de la bóveda", async () => {
  const { env } = signedIn();
  renderAt("/vaults/11111111-1111-4111-8111-111111111111", env);
  expect(await screen.findByText("Esta bóveda no existe o está en la papelera.")).toBeInTheDocument();
});

test("RF-001: /vaults/new y /vaults/trash siguen en sus páginas, no en la bóveda «new»/«trash»", async () => {
  const { env } = signedIn();
  renderAt("/vaults/new", env);
  expect(await screen.findByRole("heading", { name: "Nueva bóveda" })).toBeInTheDocument();
  expect(screen.queryByText("Esta bóveda no existe o está en la papelera.")).toBeNull();
});

test("RF-001: el riel de bóvedas no aparece en /login", () => {
  renderAt("/login");
  expect(screen.queryByRole("navigation", { name: "Bóvedas abiertas" })).not.toBeInTheDocument();
});
