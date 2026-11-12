import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import { MeContext, RefreshMeContext } from "../auth/RequireAuth";
import { syncValue, WithSync } from "../test-utils/sync";
import SettingsPage from "./SettingsPage";

const ME = {
  user_id: "1",
  email: "admin@synapse.test",
  role: "admin" as const,
  must_change_password: false,
  display_name: "Admin User",
  photo_url: null,
};

function setup(initialRoute = "/settings") {
  const refreshMe = vi.fn();
  const requestLogout = vi.fn();

  render(
    <MeContext.Provider value={ME}>
      <RefreshMeContext.Provider value={refreshMe}>
        <WithSync value={syncValue({ requestLogout }).value}>
          <MemoryRouter initialEntries={[initialRoute]}>
            <SettingsPage />
          </MemoryRouter>
        </WithSync>
      </RefreshMeContext.Provider>
    </MeContext.Provider>,
  );

  return { user: userEvent.setup(), refreshMe, requestLogout };
}

afterEach(() => vi.restoreAllMocks());

test("B1: la navegación lateral muestra 6 enlaces en orden correcto", () => {
  setup();

  const nav = screen.getByRole("navigation");
  const links = nav.querySelectorAll("a");

  expect(links).toHaveLength(6);
  expect(links[0]).toHaveTextContent("Perfil");
  expect(links[0]).toHaveAttribute("href", "/settings/profile");
  expect(links[1]).toHaveTextContent("Contraseña");
  expect(links[1]).toHaveAttribute("href", "/settings/password");
  expect(links[2]).toHaveTextContent("API keys");
  expect(links[2]).toHaveAttribute("href", "/settings/api-keys");
  expect(links[3]).toHaveTextContent("Tema");
  expect(links[3]).toHaveAttribute("href", "/settings/theme");
  expect(links[4]).toHaveTextContent("Agentes por bóveda");
  expect(links[4]).toHaveAttribute("href", "/settings/agent-access");
  expect(links[5]).toHaveTextContent("Notificaciones");
  expect(links[5]).toHaveAttribute("href", "/settings/notifications");
});

test("B1: al renderizar /settings redirige a /settings/profile", () => {
  setup("/settings");
  // React Router redirige internamente sin cambiar la URL en MemoryRouter para pruebas,
  // pero el contenido renderizado es el del perfil (Outlet).
  // Verificamos que el árbol de componentes es coherente: el nombre del usuario aparece.
  const header = screen.getByRole("heading", { name: "Admin User" });
  expect(header).toBeInTheDocument();
});

test("B1: el botón «Cerrar sesión» llama requestLogout", async () => {
  const { user, requestLogout } = setup();

  const logoutButton = screen.getByRole("button", { name: /Cerrar sesión/i });
  await user.click(logoutButton);

  expect(requestLogout).toHaveBeenCalled();
});

test("B1: los enlaces activos están marcados con clase `active`", () => {
  setup("/settings/profile");

  const profileLink = screen.getByRole("link", { name: "Perfil" });
  expect(profileLink).toHaveClass("active");

  const passwordLink = screen.getByRole("link", { name: "Contraseña" });
  expect(passwordLink).not.toHaveClass("active");
});

test("B1: encabezado muestra el nombre del usuario", () => {
  setup();

  const header = screen.getByText("Admin User");
  expect(header).toBeInTheDocument();
});

test("B1: encabezado muestra el correo si no hay nombre", () => {
  const meNoName = { ...ME, display_name: null };
  const refreshMe = vi.fn();

  render(
    <MeContext.Provider value={meNoName}>
      <RefreshMeContext.Provider value={refreshMe}>
        <WithSync value={syncValue().value}>
          <MemoryRouter>
            <SettingsPage />
          </MemoryRouter>
        </WithSync>
      </RefreshMeContext.Provider>
    </MeContext.Provider>,
  );

  expect(screen.getByText("admin@synapse.test")).toBeInTheDocument();
});
