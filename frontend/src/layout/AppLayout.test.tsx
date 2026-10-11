import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import AppLayout from "./AppLayout";
import * as api from "../api/auth";

function renderAt(path = "/") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<div>inicio privado</div>} />
          <Route path="/settings/password" element={<div>cambio de clave</div>} />
        </Route>
        <Route path="/login" element={<div>pantalla login</div>} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

afterEach(() => vi.restoreAllMocks());

test("RF-023: muestra el enlace a Cambiar contraseña y lleva a la sección", async () => {
  const user = renderAt();
  expect(screen.getByText("inicio privado")).toBeInTheDocument();
  await user.click(screen.getByRole("link", { name: "Cambiar contraseña" }));
  expect(screen.getByText("cambio de clave")).toBeInTheDocument();
});

test("RF-023: Cerrar sesión llama a logout y lleva a /login", async () => {
  const spy = vi.spyOn(api, "logout").mockResolvedValue();
  const user = renderAt();
  await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
  expect(spy).toHaveBeenCalledOnce();
  expect(await screen.findByText("pantalla login")).toBeInTheDocument();
});

test("RF-023: si el logout falla, avisa y no finge haber cerrado la sesión", async () => {
  vi.spyOn(api, "logout").mockRejectedValue(new api.ApiError(500, { title: "Internal Server Error" }));
  const user = renderAt();
  await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cerrar la sesión");
  expect(screen.getByText("inicio privado")).toBeInTheDocument();
});
