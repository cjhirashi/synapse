import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import App from "./App";
import * as api from "./api/auth";

afterEach(() => vi.restoreAllMocks());

test("RF-023: las rutas privadas muestran la navegación de cuenta", async () => {
  vi.spyOn(api, "getMe").mockResolvedValue({ user_id: "1", role: "guest", must_change_password: false });
  render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>,
  );
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
