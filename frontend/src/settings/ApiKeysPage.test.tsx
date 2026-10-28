import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import ApiKeysPage from "./ApiKeysPage";
import * as api from "./apiKeys";
import { ApiError, PROBLEM } from "../api/problems";

const ACTIVE = { id: "k1", label: "CI", created_at: "2026-10-01T10:00:00Z", last_used_at: null, revoked_at: null };
const REVOKED = {
  id: "k2",
  label: "viejo",
  created_at: "2026-09-01T10:00:00Z",
  last_used_at: "2026-09-02T10:00:00Z",
  revoked_at: "2026-10-01T10:00:00Z",
};

function setup() {
  render(
    <MemoryRouter initialEntries={["/settings/api-keys"]}>
      <Routes>
        <Route path="/settings/api-keys" element={<ApiKeysPage />} />
        <Route path="/login" element={<p>Pantalla de login</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("C-1: muestra la lista de keys del usuario, activas y revocadas", async () => {
  vi.spyOn(api, "listAgentKeys").mockResolvedValue([ACTIVE, REVOKED]);
  setup();

  expect(await screen.findByRole("heading", { name: "CI" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "viejo" })).toBeInTheDocument();
  expect(screen.getByText("Activa")).toBeInTheDocument();
  expect(screen.getByText("Revocada")).toBeInTheDocument();
  // Sólo la key activa se puede revocar.
  expect(screen.getByRole("button", { name: "Revocar CI" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Revocar viejo" })).not.toBeInTheDocument();
});

test("C-1: con lista vacía, mensaje claro y botón de crear visible", async () => {
  vi.spyOn(api, "listAgentKeys").mockResolvedValue([]);
  setup();

  expect(await screen.findByText(/aún no tienes api keys/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Crear API key" })).toBeInTheDocument();
});

test("caso límite: si la carga falla, muestra el error y permite reintentar", async () => {
  const spy = vi.spyOn(api, "listAgentKeys").mockRejectedValueOnce(new ApiError(503, { title: "down" }));
  const user = setup();

  expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudieron cargar/i);
  spy.mockResolvedValueOnce([ACTIVE]);
  await user.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(await screen.findByRole("heading", { name: "CI" })).toBeInTheDocument();
});

test("C-2: crea una key y muestra el secreto una sola vez, con copiar y aviso", async () => {
  vi.spyOn(api, "listAgentKeys")
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ ...ACTIVE, id: "k9", label: "nueva" }]);
  vi.spyOn(api, "createAgentKey").mockResolvedValue({
    id: "k9",
    label: "nueva",
    key: "sk_secreto_123",
    created_at: "2026-10-28T10:00:00Z",
  });
  const user = setup();

  await user.click(await screen.findByRole("button", { name: "Crear API key" }));
  await user.type(screen.getByLabelText("Nombre de la key"), "nueva");
  await user.click(screen.getByRole("button", { name: "Crear" }));

  // El secreto en claro y el aviso explícito de que no se repetirá.
  expect(await screen.findByText("sk_secreto_123")).toBeInTheDocument();
  expect(screen.getByText(/no se volverá a mostrar/i)).toBeInTheDocument();
  expect(api.createAgentKey).toHaveBeenCalledWith("nueva");

  // Copiar pone el secreto en el portapapeles.
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  await user.click(screen.getByRole("button", { name: "Copiar" }));
  expect(writeText).toHaveBeenCalledWith("sk_secreto_123");

  // Una sola vez: al cerrar el aviso, el secreto ya no está en el DOM.
  await user.click(screen.getByRole("button", { name: "Entendido" }));
  expect(screen.queryByText("sk_secreto_123")).not.toBeInTheDocument();
});

test("C-3: un label duplicado (409) muestra el error sin cerrar el formulario ni perder lo escrito", async () => {
  vi.spyOn(api, "listAgentKeys").mockResolvedValue([]);
  vi.spyOn(api, "createAgentKey").mockRejectedValue(
    new ApiError(409, { type: PROBLEM.agentKeyLabelTaken, title: "Agent key label already in use" }),
  );
  const user = setup();

  await user.click(await screen.findByRole("button", { name: "Crear API key" }));
  await user.type(screen.getByLabelText("Nombre de la key"), "CI");
  await user.click(screen.getByRole("button", { name: "Crear" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(/ya tienes una api key.*ese nombre/i);
  // El formulario sigue abierto y conserva lo escrito.
  expect(screen.getByLabelText("Nombre de la key")).toHaveValue("CI");
  expect(screen.getByRole("button", { name: "Crear" })).toBeInTheDocument();
});

test("C-4: revocar pide confirmación y refleja el nuevo estado sin recargar la página", async () => {
  vi.spyOn(api, "listAgentKeys")
    .mockResolvedValueOnce([ACTIVE])
    .mockResolvedValueOnce([{ ...ACTIVE, revoked_at: "2026-10-28T00:00:00Z" }]);
  const revoke = vi.spyOn(api, "revokeAgentKey").mockResolvedValue(undefined);
  const user = setup();

  await user.click(await screen.findByRole("button", { name: "Revocar CI" }));
  const dialog = screen.getByRole("alertdialog");
  expect(dialog).toHaveTextContent(/revocar/i);
  await user.click(within(dialog).getByRole("button", { name: "Revocar" }));

  expect(revoke).toHaveBeenCalledWith("k1");
  expect(await screen.findByText("Revocada")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Revocar CI" })).not.toBeInTheDocument();
});

test("C-4: cancelar la confirmación no revoca nada", async () => {
  vi.spyOn(api, "listAgentKeys").mockResolvedValue([ACTIVE]);
  const revoke = vi.spyOn(api, "revokeAgentKey");
  const user = setup();

  await user.click(await screen.findByRole("button", { name: "Revocar CI" }));
  await user.click(screen.getByRole("button", { name: "Cancelar" }));

  expect(revoke).not.toHaveBeenCalled();
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});

test("C-6: el campo recibe el foco al abrir y la confirmación se cierra con Escape", async () => {
  vi.spyOn(api, "listAgentKeys").mockResolvedValue([ACTIVE]);
  const user = setup();

  await user.click(await screen.findByRole("button", { name: "Crear API key" }));
  expect(screen.getByLabelText("Nombre de la key")).toHaveFocus();

  await user.click(screen.getByRole("button", { name: "Revocar CI" }));
  expect(screen.getByRole("alertdialog", { name: /revocar/i })).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});
