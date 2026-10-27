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

// SPEC-0011 RF-017: el login lleva el logo oficial seguido de «Synapse», con las reglas de RF-012.
test("RF-017: el login muestra el logo oficial antes de «Synapse», decorativo y sin enlace; sin el cuadrado genérico", () => {
  render(<MemoryRouter><LoginPage onLoggedIn={vi.fn()} /></MemoryRouter>);

  const brand = document.querySelector(".auth-logo")!;
  expect(brand.firstElementChild).toHaveClass("brand-logo");
  expect(brand.firstElementChild).toHaveAttribute("aria-hidden", "true");
  expect(brand.lastElementChild).toHaveTextContent(/^Synapse$/);
  expect(brand).toHaveTextContent(/^Synapse$/);
  expect(brand.querySelector("a, button, [tabindex]")).toBeNull();
  expect(document.querySelector(".auth-logo-mark")).toBeNull();
  expect(document.querySelectorAll(".brand-logo")).toHaveLength(1);
});
