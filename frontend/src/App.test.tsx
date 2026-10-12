import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import App from "./App";
import * as api from "./api/auth";
import * as vaultsApi from "./api/vaults";

afterEach(() => vi.restoreAllMocks());

/** Sesión válida y bóvedas vacías: basta para montar cualquier ruta privada. */
function signedIn() {
  vi.spyOn(api, "getMe").mockResolvedValue({ user_id: "1", role: "guest", must_change_password: false });
  vi.spyOn(vaultsApi, "listVaults").mockResolvedValue({ items: [], next_cursor: null });
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

test("RF-023: las rutas privadas muestran la navegación de cuenta", async () => {
  signedIn();
  renderAt("/");
  expect(await screen.findByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Cambiar contraseña" })).toBeInTheDocument();
});

test("la pantalla de login no muestra la navegación de cuenta", () => {
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <App />
    </MemoryRouter>,
  );
  expect(screen.queryByRole("button", { name: "Cerrar sesión" })).not.toBeInTheDocument();
});

test("RF-018: `/` redirige a la lista de bóvedas", async () => {
  signedIn();
  renderAt("/");
  expect(await screen.findByRole("heading", { name: "Bóvedas" })).toBeInTheDocument();
  expect(vaultsApi.listVaults).toHaveBeenCalledWith({ deleted: false });
});

test.each([
  ["/vaults", "Bóvedas"],
  ["/vaults/new", "Nueva bóveda"],
  ["/vaults/trash", "Papelera"],
])("RF-018 / RF-028: %s muestra su pantalla", async (path, heading) => {
  signedIn();
  renderAt(path);
  expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
});

test("RF-019: `/vaults/:id/edit` carga esa bóveda en el formulario", async () => {
  signedIn();
  const get = vi.spyOn(vaultsApi, "getVault").mockResolvedValue({
    id: "id-1", name: "Notas", description: null, tags: [], owner_id: "1",
    created_at: "2026-10-12T09:00:00.000000Z", updated_at: "2026-10-12T09:00:00.000000Z",
    deleted_at: null, etag: '"1-a"',
  });
  renderAt("/vaults/id-1/edit");
  expect(await screen.findByRole("heading", { name: "Editar bóveda" })).toBeInTheDocument();
  expect(get).toHaveBeenCalledWith("id-1");
});
