import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import { ApiError, PROBLEM } from "../api/problems";
import * as api from "../api/vaults";
import type { Vault } from "../api/vaults";
import VaultForm from "./VaultForm";

const VAULT: Vault = {
  id: "id-1",
  name: "Notas",
  description: "Apuntes",
  tags: ["work", "ideas"],
  owner_id: "u1",
  created_at: "2026-10-12T09:00:00.000000Z",
  updated_at: "2026-10-12T09:00:00.000000Z",
  deleted_at: null,
  etag: '"1-a"',
};

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/vaults" element={<div>lista de bóvedas</div>} />
        <Route path="/vaults/new" element={<VaultForm />} />
        <Route path="/vaults/:id/edit" element={<VaultForm />} />
        <Route path="/login" element={<div>pantalla login</div>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

function validation(...pointers: string[]) {
  return new ApiError(422, {
    type: PROBLEM.validationError,
    errors: pointers.map((pointer) => ({ pointer, detail: "English detail" })),
  });
}

afterEach(() => vi.restoreAllMocks());

test("RF-019: crear envía nombre, descripción y tags y vuelve a la lista", async () => {
  const create = vi.spyOn(api, "createVault").mockResolvedValue(VAULT);
  const user = renderAt("/vaults/new");
  expect(screen.getByRole("heading", { name: "Nueva bóveda" })).toBeInTheDocument();
  await user.type(screen.getByLabelText("Nombre"), "Notas");
  await user.type(screen.getByLabelText("Descripción"), "Apuntes");
  await user.type(screen.getByLabelText("Etiquetas"), "work, ideas ,, ");
  await user.click(screen.getByRole("button", { name: "Crear bóveda" }));
  expect(create).toHaveBeenCalledWith({ name: "Notas", description: "Apuntes", tags: ["work", "ideas"] });
  expect(await screen.findByText("lista de bóvedas")).toBeInTheDocument();
});

test("RF-019: una descripción vacía se envía como null", async () => {
  const create = vi.spyOn(api, "createVault").mockResolvedValue(VAULT);
  const user = renderAt("/vaults/new");
  await user.type(screen.getByLabelText("Nombre"), "Notas");
  await user.click(screen.getByRole("button", { name: "Crear bóveda" }));
  expect(create).toHaveBeenCalledWith({ name: "Notas", description: null, tags: [] });
});

test("RF-019: editar carga la bóveda y envía sólo lo que cambió con su etag", async () => {
  vi.spyOn(api, "getVault").mockResolvedValue(VAULT);
  const update = vi.spyOn(api, "updateVault").mockResolvedValue({ ...VAULT, name: "Otra" });
  const user = renderAt("/vaults/id-1/edit");
  const name = await screen.findByDisplayValue("Notas");
  expect(screen.getByLabelText("Descripción")).toHaveValue("Apuntes");
  expect(screen.getByLabelText("Etiquetas")).toHaveValue("work, ideas");
  await user.clear(name);
  await user.type(name, "Otra");
  await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
  expect(update).toHaveBeenCalledWith("id-1", { name: "Otra" }, '"1-a"');
  expect(await screen.findByText("lista de bóvedas")).toBeInTheDocument();
});

test("RF-019: editar sin cambios no envía nada y vuelve a la lista", async () => {
  vi.spyOn(api, "getVault").mockResolvedValue(VAULT);
  const update = vi.spyOn(api, "updateVault");
  const user = renderAt("/vaults/id-1/edit");
  await screen.findByDisplayValue("Notas");
  await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
  expect(update).not.toHaveBeenCalled();
  expect(await screen.findByText("lista de bóvedas")).toBeInTheDocument();
});

test.each([
  ["#/name", "Nombre", "El nombre debe tener entre 1 y 100 caracteres, sin caracteres de control."],
  ["#/description", "Descripción", "La descripción admite hasta 2000 caracteres."],
  ["#/tags/2", "Etiquetas", "Hasta 20 etiquetas de 1 a 32 caracteres cada una."],
])("RF-019: un 422 en %s se muestra junto a su campo", async (pointer, label, message) => {
  vi.spyOn(api, "createVault").mockRejectedValue(validation(pointer));
  const user = renderAt("/vaults/new");
  await user.type(screen.getByLabelText("Nombre"), "x");
  await user.click(screen.getByRole("button", { name: "Crear bóveda" }));
  const field = await screen.findByLabelText(label);
  expect(field).toHaveAttribute("aria-invalid", "true");
  expect(field).toHaveAccessibleDescription(message);
  expect(screen.getByRole("alert")).toHaveTextContent(message);  // se anuncia al aparecer
});

test("RF-019: una descripción de sólo espacios que no se tocó no se envía", async () => {
  vi.spyOn(api, "getVault").mockResolvedValue({ ...VAULT, description: "   " });
  const update = vi.spyOn(api, "updateVault").mockResolvedValue({ ...VAULT, name: "Otro" });
  const user = renderAt("/vaults/id-1/edit");
  await user.clear(await screen.findByLabelText("Nombre"));
  await user.type(screen.getByLabelText("Nombre"), "Otro");
  await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
  expect(update).toHaveBeenCalledWith("id-1", { name: "Otro" }, '"1-a"');
});

test("RF-019: un 422 sin campo conocido se muestra como aviso general", async () => {
  vi.spyOn(api, "createVault").mockRejectedValue(validation("#"));
  const user = renderAt("/vaults/new");
  await user.type(screen.getByLabelText("Nombre"), "x");
  await user.click(screen.getByRole("button", { name: "Crear bóveda" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Revisa los datos del formulario.");
});

test("RF-019: un 409 avisa del nombre repetido junto al nombre", async () => {
  vi.spyOn(api, "createVault").mockRejectedValue(new ApiError(409, { type: api.VAULT_PROBLEM.nameTaken }));
  const user = renderAt("/vaults/new");
  await user.type(screen.getByLabelText("Nombre"), "Notas");
  await user.click(screen.getByRole("button", { name: "Crear bóveda" }));
  const name = await screen.findByLabelText("Nombre");
  expect(name).toHaveAccessibleDescription("Ya tienes una bóveda con ese nombre.");
  expect(name).toHaveAttribute("aria-invalid", "true");
});

test("RF-019: corregir un campo quita su error", async () => {
  vi.spyOn(api, "createVault").mockRejectedValue(new ApiError(409, { type: api.VAULT_PROBLEM.nameTaken }));
  const user = renderAt("/vaults/new");
  await user.type(screen.getByLabelText("Nombre"), "Notas");
  await user.click(screen.getByRole("button", { name: "Crear bóveda" }));
  const name = await screen.findByLabelText("Nombre");
  await screen.findByText("Ya tienes una bóveda con ese nombre.");
  await user.type(name, "2");
  expect(name).not.toHaveAttribute("aria-invalid");
  expect(screen.queryByText("Ya tienes una bóveda con ese nombre.")).not.toBeInTheDocument();
});

test("RF-019: un 412 avisa que la bóveda cambió y recarga sus datos y su etag", async () => {
  const get = vi
    .spyOn(api, "getVault")
    .mockResolvedValueOnce(VAULT)
    .mockResolvedValueOnce({ ...VAULT, name: "Cambiada fuera", etag: '"2-b"' });
  const update = vi
    .spyOn(api, "updateVault")
    .mockRejectedValueOnce(new ApiError(412, { type: api.VAULT_PROBLEM.preconditionFailed }))
    .mockResolvedValueOnce(VAULT);
  const user = renderAt("/vaults/id-1/edit");
  const description = await screen.findByDisplayValue("Apuntes");
  await user.clear(description);
  await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("La bóveda cambió mientras la editabas");
  expect(await screen.findByDisplayValue("Cambiada fuera")).toBeInTheDocument();
  expect(get).toHaveBeenCalledTimes(2);
  // Lo escrito se descarta (guardarlo con el etag nuevo pisaría el cambio ajeno) y lo
  // siguiente que se guarde va con la versión recargada.
  expect(screen.getByLabelText("Descripción")).toHaveValue("Apuntes");
  await user.clear(screen.getByLabelText("Descripción"));
  await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
  expect(update).toHaveBeenLastCalledWith("id-1", { description: null }, '"2-b"');
});

test("RF-019: editar una bóveda que ya no existe (404) lo dice sin mostrar el formulario", async () => {
  vi.spyOn(api, "getVault").mockRejectedValue(new ApiError(404, { type: api.VAULT_PROBLEM.notFound }));
  renderAt("/vaults/id-1/edit");
  expect(await screen.findByRole("alert")).toHaveTextContent("Esta bóveda no existe o está en la papelera.");
  expect(screen.queryByRole("button", { name: "Guardar cambios" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Volver a las bóvedas" })).toBeInTheDocument();
});

test("RF-019: una sesión cerrada (401) al guardar lleva a /login", async () => {
  vi.spyOn(api, "createVault").mockRejectedValue(new ApiError(401, { type: "urn:synapse:problem:invalid-token" }));
  const user = renderAt("/vaults/new");
  await user.type(screen.getByLabelText("Nombre"), "Notas");
  await user.click(screen.getByRole("button", { name: "Crear bóveda" }));
  expect(await screen.findByText("pantalla login")).toBeInTheDocument();
});

test("RF-019: otro error al guardar da un aviso genérico y conserva lo escrito", async () => {
  vi.spyOn(api, "createVault").mockRejectedValue(new ApiError(503, { type: "urn:synapse:problem:storage-unavailable" }));
  const user = renderAt("/vaults/new");
  await user.type(screen.getByLabelText("Nombre"), "Notas");
  await user.click(screen.getByRole("button", { name: "Crear bóveda" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo guardar la bóveda. Inténtalo de nuevo.");
  expect(screen.getByLabelText("Nombre")).toHaveValue("Notas");
});

test("RF-019: «Cancelar» vuelve a la lista sin guardar", async () => {
  const create = vi.spyOn(api, "createVault");
  const user = renderAt("/vaults/new");
  await user.click(screen.getByRole("link", { name: "Cancelar" }));
  expect(screen.getByText("lista de bóvedas")).toBeInTheDocument();
  expect(create).not.toHaveBeenCalled();
});
