import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import LoginPage from "./LoginPage";
import * as api from "../api/auth";

afterEach(() => vi.restoreAllMocks());

async function submit(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Correo"), email);
  await user.type(screen.getByLabelText("Contraseña"), password);
  await user.click(screen.getByRole("button", { name: "Entrar" }));
}

test("RF-005: credenciales inválidas muestran un mensaje genérico", async () => {
  vi.spyOn(api, "login").mockRejectedValue(new api.ApiError(401, { type: "urn:synapse:problem:invalid-credentials", title: "Invalid credentials" }));
  render(<MemoryRouter><LoginPage onLoggedIn={vi.fn()} /></MemoryRouter>);
  await submit("a@b.com", "mala");
  expect(await screen.findByRole("alert")).toHaveTextContent("Correo o contraseña incorrectos");
});

test("RF-004: login correcto avisa al llamante", async () => {
  const spy = vi.spyOn(api, "login").mockResolvedValue();
  const onLoggedIn = vi.fn();
  render(<MemoryRouter><LoginPage onLoggedIn={onLoggedIn} /></MemoryRouter>);
  await submit("a@b.com", "buena-clave-larga");
  await waitFor(() => expect(onLoggedIn).toHaveBeenCalled());
  expect(spy).toHaveBeenCalledWith("a@b.com", "buena-clave-larga");
});
