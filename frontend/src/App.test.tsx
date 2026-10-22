import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import App from "./App";
import * as api from "./api/auth";
import * as localDb from "./sync/localDb";
import { memoryEnv } from "./test-utils/sync";

afterEach(() => vi.restoreAllMocks());

/** Sesión válida; la réplica local es una base en memoria nueva en cada prueba. */
function signedIn(mustChangePassword = false) {
  vi.spyOn(api, "getMe").mockResolvedValue({ user_id: "1", role: "guest", must_change_password: mustChangePassword });
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

test("RF-023: las rutas privadas muestran la navegación de cuenta", async () => {
  const { env } = signedIn();
  renderAt("/", env);
  expect(await screen.findByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Cambiar contraseña" })).toBeInTheDocument();
});

test("la pantalla de login no muestra la navegación de cuenta", () => {
  renderAt("/login");
  expect(screen.queryByRole("button", { name: "Cerrar sesión" })).not.toBeInTheDocument();
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

test("RF-017: «Cerrar sesión» sin cambios pendientes cierra la sesión y lleva a /login", async () => {
  const { env } = signedIn();
  const logout = vi.spyOn(api, "logout").mockResolvedValue();
  const user = renderAt("/vaults", env);
  await user.click(await screen.findByRole("button", { name: "Cerrar sesión" }));
  expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
  expect(logout).toHaveBeenCalledOnce();
});

test("RF-017: si la réplica no se borra al salir, el login avisa de la copia conservada (VE-1)", async () => {
  const { env } = signedIn();
  vi.spyOn(api, "logout").mockResolvedValue();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(localDb, "destroyLocalDb").mockRejectedValue(new Error("IndexedDB no disponible"));
  const user = renderAt("/vaults", env);
  await user.click(await screen.findByRole("button", { name: "Cerrar sesión" }));
  expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("No se pudo borrar la copia local de este dispositivo.");
});
