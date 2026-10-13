import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import { ApiError } from "../api/problems";
import * as api from "../api/vaults";
import type { Vault } from "../api/vaults";
import VaultListPage from "./VaultListPage";

function vault(n: number, fields: Partial<Vault> = {}): Vault {
  return {
    id: `id-${n}`,
    name: `Bóveda ${n}`,
    description: `Descripción ${n}`,
    tags: [`tag${n}`, "común"],
    owner_id: "u1",
    created_at: "2026-10-12T09:00:00.000000Z",
    updated_at: "2026-10-12T09:00:00.000000Z",
    deleted_at: null,
    etag: `"${n}-a"`,
    ...fields,
  };
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/vaults"]}>
      <Routes>
        <Route path="/vaults" element={<VaultListPage />} />
        <Route path="/vaults/new" element={<div>formulario nuevo</div>} />
        <Route path="/vaults/:id/edit" element={<div>formulario edición</div>} />
        <Route path="/login" element={<div>pantalla login</div>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

function item(name: string) {
  return screen.getByRole("listitem", { name });
}

afterEach(() => vi.restoreAllMocks());

test("RF-018: muestra nombre, descripción y tags de cada bóveda", async () => {
  vi.spyOn(api, "listVaults").mockResolvedValue({ items: [vault(1), vault(2, { description: null })], next_cursor: null });
  renderPage();
  const first = await screen.findByRole("listitem", { name: "Bóveda 1" });
  expect(within(first).getByText("Descripción 1")).toBeInTheDocument();
  expect(within(first).getByText("tag1")).toBeInTheDocument();
  expect(within(first).getByText("común")).toBeInTheDocument();
  expect(item("Bóveda 2")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Cargar más" })).not.toBeInTheDocument();
});

test("RF-018: sin bóvedas lo dice y ofrece crear una", async () => {
  vi.spyOn(api, "listVaults").mockResolvedValue({ items: [], next_cursor: null });
  const user = renderPage();
  expect(await screen.findByText("Aún no tienes bóvedas.")).toBeInTheDocument();
  await user.click(screen.getByRole("link", { name: "Nueva bóveda" }));
  expect(screen.getByText("formulario nuevo")).toBeInTheDocument();
});

test("RF-018: «Cargar más» pide con `cursor`, añade la página y se oculta sin `next_cursor`", async () => {
  const spy = vi
    .spyOn(api, "listVaults")
    .mockResolvedValueOnce({ items: [vault(1)], next_cursor: "c1" })
    .mockResolvedValueOnce({ items: [vault(2)], next_cursor: null });
  const user = renderPage();
  await user.click(await screen.findByRole("button", { name: "Cargar más" }));
  expect(await screen.findByRole("listitem", { name: "Bóveda 2" })).toBeInTheDocument();
  expect(item("Bóveda 1")).toBeInTheDocument();
  expect(spy.mock.calls).toEqual([[{ deleted: false }], [{ deleted: false, cursor: "c1" }]]);
  expect(screen.queryByRole("button", { name: "Cargar más" })).not.toBeInTheDocument();
});

test("RF-018: si «Cargar más» falla, conserva la lista, avisa y permite reintentar", async () => {
  vi.spyOn(api, "listVaults")
    .mockResolvedValueOnce({ items: [vault(1)], next_cursor: "c1" })
    .mockRejectedValueOnce(new ApiError(503, { type: "urn:synapse:problem:storage-unavailable" }))
    .mockResolvedValueOnce({ items: [vault(2)], next_cursor: null });
  const user = renderPage();
  await user.click(await screen.findByRole("button", { name: "Cargar más" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar más bóvedas.");
  expect(item("Bóveda 1")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Cargar más" }));
  expect(await screen.findByRole("listitem", { name: "Bóveda 2" })).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("RF-018: «Editar» lleva al formulario de esa bóveda", async () => {
  vi.spyOn(api, "listVaults").mockResolvedValue({ items: [vault(1)], next_cursor: null });
  const user = renderPage();
  await user.click(within(await screen.findByRole("listitem", { name: "Bóveda 1" })).getByRole("link", { name: "Editar" }));
  expect(screen.getByText("formulario edición")).toBeInTheDocument();
});

test("RF-020: borrar pide confirmación y cancelar no envía el DELETE", async () => {
  vi.spyOn(api, "listVaults").mockResolvedValue({ items: [vault(1)], next_cursor: null });
  const del = vi.spyOn(api, "deleteVault").mockResolvedValue();
  const user = renderPage();
  await user.click(within(await screen.findByRole("listitem", { name: "Bóveda 1" })).getByRole("button", { name: "Borrar" }));
  const dialog = screen.getByRole("alertdialog", { name: "¿Mover «Bóveda 1» a la papelera?" });
  await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
  expect(del).not.toHaveBeenCalled();
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(item("Bóveda 1")).toBeInTheDocument();
});

test("RF-020: confirmar envía el DELETE con su etag y la quita de la lista", async () => {
  vi.spyOn(api, "listVaults").mockResolvedValue({ items: [vault(1), vault(2)], next_cursor: null });
  const del = vi.spyOn(api, "deleteVault").mockResolvedValue();
  const user = renderPage();
  await user.click(within(await screen.findByRole("listitem", { name: "Bóveda 1" })).getByRole("button", { name: "Borrar" }));
  await user.click(screen.getByRole("button", { name: "Mover a la papelera" }));
  expect(del).toHaveBeenCalledWith("id-1", '"1-a"');
  expect(await screen.findByRole("status")).toHaveTextContent("«Bóveda 1» se movió a la papelera.");
  expect(screen.queryByRole("listitem", { name: "Bóveda 1" })).not.toBeInTheDocument();
  expect(item("Bóveda 2")).toBeInTheDocument();
});

test("RF-020: si la bóveda cambió (412) avisa y recarga la lista", async () => {
  const list = vi
    .spyOn(api, "listVaults")
    .mockResolvedValueOnce({ items: [vault(1)], next_cursor: null })
    .mockResolvedValueOnce({ items: [vault(1, { name: "Renombrada", etag: '"2-b"' })], next_cursor: null });
  vi.spyOn(api, "deleteVault").mockRejectedValue(new ApiError(412, { type: api.VAULT_PROBLEM.preconditionFailed }));
  const user = renderPage();
  await user.click(within(await screen.findByRole("listitem", { name: "Bóveda 1" })).getByRole("button", { name: "Borrar" }));
  await user.click(screen.getByRole("button", { name: "Mover a la papelera" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("cambió");
  expect(await screen.findByRole("listitem", { name: "Renombrada" })).toBeInTheDocument();
  expect(list).toHaveBeenCalledTimes(2);
});

test("RF-018: una sesión cerrada (401) lleva a /login", async () => {
  vi.spyOn(api, "listVaults").mockRejectedValue(new ApiError(401, { type: "urn:synapse:problem:invalid-token" }));
  renderPage();
  expect(await screen.findByText("pantalla login")).toBeInTheDocument();
});

test("RF-018: si la lista no carga, avisa y permite reintentar", async () => {
  vi.spyOn(api, "listVaults")
    .mockRejectedValueOnce(new ApiError(503, { type: "urn:synapse:problem:storage-unavailable" }))
    .mockResolvedValueOnce({ items: [vault(1)], next_cursor: null });
  const user = renderPage();
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar las bóvedas.");
  await user.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(await screen.findByRole("listitem", { name: "Bóveda 1" })).toBeInTheDocument();
});
