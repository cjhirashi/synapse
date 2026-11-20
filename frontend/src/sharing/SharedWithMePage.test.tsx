import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import SharedWithMePage from "./SharedWithMePage";
import * as api from "./sharingApi";

beforeEach(() => {
  vi.spyOn(api, "listInvitations").mockClear();
  vi.spyOn(api, "acceptInvitation").mockClear();
  vi.spyOn(api, "rejectInvitation").mockClear();
  vi.spyOn(api, "leaveInvitation").mockClear();
});
afterEach(() => vi.restoreAllMocks());

const invitation = (over: Partial<api.Invitation> = {}): api.Invitation => ({
  id: "inv-1",
  vault_id: "v-1",
  status: "pendiente",
  created_at: "2026-11-20T10:00:00Z",
  responded_at: null,
  owner: { id: "u-1", email: "owner@example.com", display_name: "Owner Name" },
  vault_name: "Test Vault",
  grants: [{ folder: "*", level: "lectura" }],
  ...over,
});

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname}</p>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/compartidas"]}>
      <Routes>
        <Route path="/compartidas" element={<SharedWithMePage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

test("estado vacío con mensaje de apoyo", async () => {
  vi.spyOn(api, "listInvitations").mockResolvedValue({ items: [] });
  renderPage();
  expect(await screen.findByText("Nadie ha compartido bóvedas contigo todavía.")).toBeInTheDocument();
  expect(await screen.findByText(/Cuando alguien te invite/)).toBeInTheDocument();
});

test("lista con 1 pendiente y 1 activa", async () => {
  vi.spyOn(api, "listInvitations").mockResolvedValue({
    items: [
      invitation({ id: "inv-pend", status: "pendiente" }),
      invitation({ id: "inv-act", status: "activo", owner: { id: "u-2", email: "alice@example.com", display_name: null } }),
    ],
  });
  renderPage();
  expect(await screen.findByText(/Te invitó Owner Name/)).toBeInTheDocument();
  expect(await screen.findByText(/alice@example.com/)).toBeInTheDocument();
  expect(screen.getAllByText("Lectura en toda la bóveda")).toHaveLength(2);
});

test("nombre del propietario o correo", async () => {
  vi.spyOn(api, "listInvitations").mockResolvedValue({
    items: [
      invitation({ owner: { id: "u-1", email: "test@example.com", display_name: "Display" } }),
      invitation({ id: "inv-2", owner: { id: "u-2", email: "nodisplay@example.com", display_name: null } }),
    ],
  });
  renderPage();
  expect(await screen.findByText(/Te invitó Display/)).toBeInTheDocument();
  expect(screen.getByText(/Te invitó nodisplay@example\.com/)).toBeInTheDocument();
});

test("aceptar llama a acceptInvitation y recarga", async () => {
  const accept = vi.spyOn(api, "acceptInvitation").mockResolvedValue();
  const list = vi.spyOn(api, "listInvitations").mockResolvedValueOnce({ items: [invitation()] }).mockResolvedValueOnce({ items: [] });
  renderPage();
  await screen.findByRole("button", { name: /Aceptar/ });
  await userEvent.click(screen.getByRole("button", { name: /Aceptar/ }));
  expect(accept).toHaveBeenCalledWith("inv-1");
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole("status")).toHaveTextContent(/Aceptaste la invitación/);
});

test("rechazar llama a rejectInvitation y recarga", async () => {
  const reject = vi.spyOn(api, "rejectInvitation").mockResolvedValue();
  const list = vi.spyOn(api, "listInvitations").mockResolvedValueOnce({ items: [invitation()] }).mockResolvedValueOnce({ items: [] });
  renderPage();
  await screen.findByRole("button", { name: /Rechazar/ });
  await userEvent.click(screen.getByRole("button", { name: /Rechazar/ }));
  expect(reject).toHaveBeenCalledWith("inv-1");
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole("status")).toHaveTextContent(/Rechazaste la invitación/);
});

test("«Salir» abre el diálogo, cancelar no llama a la API", async () => {
  const leave = vi.spyOn(api, "leaveInvitation").mockResolvedValue();
  vi.spyOn(api, "listInvitations").mockResolvedValue({
    items: [invitation({ id: "inv-act", status: "activo" })],
  });
  renderPage();
  const btn = await screen.findByRole("button", { name: "Salir de «Test Vault»" });
  await userEvent.click(btn);
  await screen.findByRole("alertdialog");
  const cancelBtn = screen.getByRole("button", { name: "Cancelar" });
  await userEvent.click(cancelBtn);
  expect(leave).not.toHaveBeenCalled();
});

test("«Salir» confirmar llama a leaveInvitation", async () => {
  const leave = vi.spyOn(api, "leaveInvitation").mockResolvedValue();
  const list = vi.spyOn(api, "listInvitations").mockResolvedValueOnce({
    items: [invitation({ id: "inv-act", status: "activo" })],
  }).mockResolvedValueOnce({ items: [] });
  renderPage();
  const btn = await screen.findByRole("button", { name: "Salir de «Test Vault»" });
  await userEvent.click(btn);
  const confirmBtn = screen.getByRole("alertdialog").querySelector(".btn-danger");
  if (!confirmBtn) throw new Error("confirmBtn not found");
  await userEvent.click(confirmBtn);
  expect(leave).toHaveBeenCalledWith("inv-act");
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole("status")).toHaveTextContent(/Saliste de/);
});

test("error 409 muestra «Esa invitación ya no está disponible»", async () => {
  const accept = vi.spyOn(api, "acceptInvitation").mockRejectedValue(new (class ApiError {
    status = 409;
  })());
  vi.spyOn(api, "listInvitations").mockResolvedValueOnce({ items: [invitation()] }).mockResolvedValueOnce({ items: [] });
  renderPage();
  await screen.findByRole("button", { name: /Aceptar/ });
  await userEvent.click(screen.getByRole("button", { name: /Aceptar/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Esa invitación ya no está disponible.");
});

test("error de carga muestra «Reintentar»", async () => {
  const list = vi.spyOn(api, "listInvitations").mockRejectedValueOnce(new Error("fail")).mockResolvedValueOnce({ items: [] });
  renderPage();
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar");
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(await screen.findByText("Nadie ha compartido bóvedas contigo todavía.")).toBeInTheDocument();
  expect(list).toHaveBeenCalledTimes(2);
});

test("no existe ningún enlace «Abrir»", async () => {
  vi.spyOn(api, "listInvitations").mockResolvedValue({
    items: [invitation()],
  });
  renderPage();
  await screen.findByText(/Te invitó Owner Name/);
  expect(screen.queryByRole("link", { name: /Abrir/ })).toBeNull();
});
