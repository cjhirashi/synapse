import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import RequireAuth from "./RequireAuth";
import * as api from "../api/auth";

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>pantalla login</div>} />
        <Route path="/settings/password" element={<RequireAuth><div>cambio de clave</div></RequireAuth>} />
        <Route path="/" element={<RequireAuth><div>inicio privado</div></RequireAuth>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => vi.restoreAllMocks());

test("RF-020: redirige a /settings/password mientras must_change_password sea true", async () => {
  vi.spyOn(api, "getMe").mockResolvedValue({ user_id: "1", role: "admin", must_change_password: true });
  renderAt("/");
  expect(await screen.findByText("cambio de clave")).toBeInTheDocument();
});

test("RF-020: la propia página de cambio es accesible con el indicador activo (sin bucle)", async () => {
  vi.spyOn(api, "getMe").mockResolvedValue({ user_id: "1", role: "admin", must_change_password: true });
  renderAt("/settings/password");
  expect(await screen.findByText("cambio de clave")).toBeInTheDocument();
});

test("RF-006: sin sesión (401) redirige a /login", async () => {
  vi.spyOn(api, "getMe").mockRejectedValue(new api.ApiError(401, { type: "urn:synapse:problem:not-authenticated", title: "Not authenticated" }));
  renderAt("/");
  expect(await screen.findByText("pantalla login")).toBeInTheDocument();
});

test("usuario con clave ya cambiada ve la ruta privada", async () => {
  vi.spyOn(api, "getMe").mockResolvedValue({ user_id: "1", role: "guest", must_change_password: false });
  renderAt("/");
  expect(await screen.findByText("inicio privado")).toBeInTheDocument();
});

test("la página de cambio es accesible también con el indicador desactivado (todo usuario autenticado)", async () => {
  vi.spyOn(api, "getMe").mockResolvedValue({ user_id: "1", role: "guest", must_change_password: false });
  renderAt("/settings/password");
  expect(await screen.findByText("cambio de clave")).toBeInTheDocument();
});
