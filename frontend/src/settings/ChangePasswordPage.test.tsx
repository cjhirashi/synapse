import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import ChangePasswordPage from "./ChangePasswordPage";
import * as api from "../api/auth";

function setup(onChanged = vi.fn()) {
  render(
    <MemoryRouter>
      <ChangePasswordPage onChanged={onChanged} />
    </MemoryRouter>,
  );
  return { onChanged, user: userEvent.setup() };
}

async function fill(user: ReturnType<typeof userEvent.setup>, cur: string, next: string, conf = next) {
  await user.type(screen.getByLabelText("Contraseña actual"), cur);
  await user.type(screen.getByLabelText("Nueva contraseña"), next);
  await user.type(screen.getByLabelText("Confirmar nueva contraseña"), conf);
  await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
}

afterEach(() => vi.restoreAllMocks());

test("RF-020: rechaza en cliente una nueva contraseña de menos de 10 caracteres", async () => {
  const spy = vi.spyOn(api, "changePassword");
  const { user } = setup();
  await fill(user, "admin1234", "corta");
  expect(await screen.findByRole("alert")).toHaveTextContent("al menos 10 caracteres");
  expect(spy).not.toHaveBeenCalled();
});

test("RF-020: rechaza si la confirmación no coincide o es igual a la actual", async () => {
  const spy = vi.spyOn(api, "changePassword");
  const { user } = setup();
  await fill(user, "admin1234", "una-clave-larga", "otra-distinta");
  expect(await screen.findByRole("alert")).toHaveTextContent("no coinciden");
  expect(spy).not.toHaveBeenCalled();
});

test("RF-020: rechaza si la nueva es igual a la actual", async () => {
  const spy = vi.spyOn(api, "changePassword");
  const { user } = setup();
  await fill(user, "misma-clave-larga", "misma-clave-larga");
  expect(await screen.findByRole("alert")).toHaveTextContent("distinta de la actual");
  expect(spy).not.toHaveBeenCalled();
});

test("RF-018: muestra el error cuando el servidor responde 400 (actual incorrecta)", async () => {
  vi.spyOn(api, "changePassword").mockRejectedValue(new api.ApiError(400, "Current password is incorrect"));
  const { user, onChanged } = setup();
  await fill(user, "equivocada", "una-clave-larga");
  expect(await screen.findByRole("alert")).toHaveTextContent("contraseña actual es incorrecta");
  expect(onChanged).not.toHaveBeenCalled();
});

test("RF-018: muestra el error cuando el servidor responde 422 (política)", async () => {
  vi.spyOn(api, "changePassword").mockRejectedValue(new api.ApiError(422, "policy"));
  const { user } = setup();
  await fill(user, "admin1234", "una-clave-larga");
  expect(await screen.findByRole("alert")).toHaveTextContent("no cumple la política");
});

test("RF-017/020: con datos válidos llama a la API y avisa del éxito", async () => {
  const spy = vi.spyOn(api, "changePassword").mockResolvedValue();
  const { user, onChanged } = setup();
  await fill(user, "admin1234", "una-clave-larga");
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  expect(spy).toHaveBeenCalledWith("admin1234", "una-clave-larga");
});

test("RF-023: si la sesión caducó y no se pudo renovar (401), lleva a /login", async () => {
  vi.spyOn(api, "changePassword").mockRejectedValue(new api.ApiError(401, "Invalid token"));
  render(
    <MemoryRouter initialEntries={["/settings/password"]}>
      <Routes>
        <Route path="/settings/password" element={<ChangePasswordPage onChanged={vi.fn()} />} />
        <Route path="/login" element={<p>Pantalla de login</p>} />
      </Routes>
    </MemoryRouter>,
  );
  await fill(userEvent.setup(), "admin1234", "una-clave-larga");
  expect(await screen.findByText("Pantalla de login")).toBeInTheDocument();
});
