import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import { ApiError } from "../api/problems";
import * as api from "../api/vaults";
import type { Vault } from "../api/vaults";
import TrashPage from "./TrashPage";

const DELETED_AT = "2026-10-12T09:30:00.000000Z";

function trashed(n: number, fields: Partial<Vault> = {}): Vault {
  return {
    id: `id-${n}`,
    name: `Bóveda ${n}`,
    description: null,
    tags: [],
    owner_id: "u1",
    created_at: "2026-10-12T09:00:00.000000Z",
    updated_at: DELETED_AT,
    deleted_at: DELETED_AT,
    etag: `"${n}-b"`,
    ...fields,
  };
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/vaults/trash"]}>
      <Routes>
        <Route path="/vaults/trash" element={<TrashPage />} />
        <Route path="/login" element={<div>pantalla login</div>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

async function restoreButton(name: string) {
  return within(await screen.findByRole("listitem", { name })).getByRole("button", { name: "Restaurar" });
}

afterEach(() => vi.restoreAllMocks());

test("RF-028: lista las borradas con su `deleted_at`", async () => {
  const list = vi.spyOn(api, "listVaults").mockResolvedValue({ items: [trashed(1)], next_cursor: null });
  renderPage();
  const item = await screen.findByRole("listitem", { name: "Bóveda 1" });
  const time = within(item).getByText(/Borrada el/).querySelector("time");
  expect(time).toHaveAttribute("dateTime", DELETED_AT);
  // Fecha legible en español (p. ej. «12 oct 2026, 11:30»), no el texto ISO.
  const visible = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date(DELETED_AT));
  expect(time).toHaveTextContent(visible);
  expect(time).toHaveTextContent(/2026/);
  expect(time).not.toHaveTextContent(DELETED_AT);
  expect(list).toHaveBeenCalledWith({ deleted: true });
});

test("RF-028: con la papelera vacía lo dice", async () => {
  vi.spyOn(api, "listVaults").mockResolvedValue({ items: [], next_cursor: null });
  renderPage();
  expect(await screen.findByText("La papelera está vacía.")).toBeInTheDocument();
});

test("RF-028: «Cargar más» pide la página siguiente de la papelera", async () => {
  const list = vi
    .spyOn(api, "listVaults")
    .mockResolvedValueOnce({ items: [trashed(1)], next_cursor: "c1" })
    .mockResolvedValueOnce({ items: [trashed(2)], next_cursor: null });
  const user = renderPage();
  await user.click(await screen.findByRole("button", { name: "Cargar más" }));
  expect(await screen.findByRole("listitem", { name: "Bóveda 2" })).toBeInTheDocument();
  expect(list).toHaveBeenLastCalledWith({ deleted: true, cursor: "c1" });
});

test("RF-028: si «Cargar más» falla, conserva la papelera y avisa", async () => {
  vi.spyOn(api, "listVaults")
    .mockResolvedValueOnce({ items: [trashed(1)], next_cursor: "c1" })
    .mockRejectedValueOnce(new ApiError(503, { type: "urn:synapse:problem:storage-unavailable" }));
  const user = renderPage();
  await user.click(await screen.findByRole("button", { name: "Cargar más" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar más bóvedas.");
  expect(screen.getByRole("listitem", { name: "Bóveda 1" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cargar más" })).toBeInTheDocument();
});

test("RF-028: «Restaurar» llama con su etag y la quita de la papelera", async () => {
  vi.spyOn(api, "listVaults").mockResolvedValue({ items: [trashed(1), trashed(2)], next_cursor: null });
  const restore = vi.spyOn(api, "restoreVault").mockResolvedValue(trashed(1, { deleted_at: null, etag: '"1-c"' }));
  const user = renderPage();
  await user.click(await restoreButton("Bóveda 1"));
  expect(restore).toHaveBeenCalledWith("id-1", '"1-b"');
  expect(await screen.findByRole("status")).toHaveTextContent("«Bóveda 1» se restauró.");
  expect(screen.queryByRole("listitem", { name: "Bóveda 1" })).not.toBeInTheDocument();
  expect(screen.getByRole("listitem", { name: "Bóveda 2" })).toBeInTheDocument();
});

test("RF-028: un 409 al restaurar avisa que el nombre está ocupado y la deja en la papelera", async () => {
  vi.spyOn(api, "listVaults").mockResolvedValue({ items: [trashed(1)], next_cursor: null });
  vi.spyOn(api, "restoreVault").mockRejectedValue(new ApiError(409, { type: api.VAULT_PROBLEM.nameTaken }));
  const user = renderPage();
  await user.click(await restoreButton("Bóveda 1"));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No se puede restaurar «Bóveda 1»: ya tienes otra bóveda con ese nombre.",
  );
  expect(screen.getByRole("listitem", { name: "Bóveda 1" })).toBeInTheDocument();
});

test.each([
  [412, api.VAULT_PROBLEM.preconditionFailed],
  [404, api.VAULT_PROBLEM.notFound],
])("RF-028: si la papelera está desfasada (%i) avisa y la recarga", async (status, type) => {
  const list = vi
    .spyOn(api, "listVaults")
    .mockResolvedValueOnce({ items: [trashed(1)], next_cursor: null })
    .mockResolvedValueOnce({ items: [], next_cursor: null });
  vi.spyOn(api, "restoreVault").mockRejectedValue(new ApiError(status, { type }));
  const user = renderPage();
  await user.click(await restoreButton("Bóveda 1"));
  expect(await screen.findByRole("alert")).toHaveTextContent("cambió");
  expect(await screen.findByText("La papelera está vacía.")).toBeInTheDocument();
  expect(list).toHaveBeenCalledTimes(2);
});

test("RF-028: otro error al restaurar da un aviso genérico", async () => {
  vi.spyOn(api, "listVaults").mockResolvedValue({ items: [trashed(1)], next_cursor: null });
  vi.spyOn(api, "restoreVault").mockRejectedValue(new ApiError(503, { type: "urn:synapse:problem:storage-unavailable" }));
  const user = renderPage();
  await user.click(await restoreButton("Bóveda 1"));
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo restaurar «Bóveda 1». Inténtalo de nuevo.");
});

test("RF-028: una sesión cerrada (401) al restaurar lleva a /login", async () => {
  vi.spyOn(api, "listVaults").mockResolvedValue({ items: [trashed(1)], next_cursor: null });
  vi.spyOn(api, "restoreVault").mockRejectedValue(new ApiError(401, { type: "urn:synapse:problem:invalid-token" }));
  const user = renderPage();
  await user.click(await restoreButton("Bóveda 1"));
  expect(await screen.findByText("pantalla login")).toBeInTheDocument();
});
