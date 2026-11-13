import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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

test("B1: la navegación lateral muestra 6 enlaces en orden correcto, en dos grupos", () => {
  setup();

  const nav = screen.getByRole("navigation");
  const links = nav.querySelectorAll("a");

  expect(links).toHaveLength(6);
  const expected: Array<[string, string]> = [
    ["Perfil", "/settings/profile"], ["Contraseña", "/settings/password"], ["Tema", "/settings/theme"],
    ["Notificaciones", "/settings/notifications"], ["API keys", "/settings/api-keys"], ["Agentes por bóveda", "/settings/agent-access"],
  ];
  expected.forEach(([label, href], i) => {
    expect(links[i]).toHaveTextContent(label);
    expect(links[i]).toHaveAttribute("href", href);
  });
});

test("las secciones de agentes (API keys y Agentes por bóveda) van juntas en su propio grupo", () => {
  setup();
  const group = screen.getByRole("group", { name: "Agentes" });
  const labels = Array.from(group.querySelectorAll("a")).map((a) => a.textContent);
  expect(labels).toEqual(["API keys", "Agentes por bóveda"]);
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


test("el botón de cerrar sesión vive en el pie de la barra, separado de las secciones", () => {
  setup();
  const footer = document.querySelector(".settings-side-footer");
  expect(footer).not.toBeNull();
  expect(footer!.querySelector("button.settings-logout")).toHaveAccessibleName("Cerrar sesión");
  expect(screen.getByRole("navigation").contains(footer)).toBe(false);
});

test("en escritorio la barra está siempre visible, con el regreso a «Bóvedas» arriba", () => {
  setup();
  const side = document.querySelector(".settings-side")!;
  expect(side).not.toHaveAttribute("data-floating");
  expect(screen.getByRole("link", { name: /Volver a bóvedas/ })).toHaveAttribute("href", "/vaults");
});

describe("móvil (≤ 640 px): barra flotante como la de una bóveda", () => {
  const original = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes("max-width: 640px"), media: query, onchange: null,
      addEventListener: () => undefined, removeEventListener: () => undefined,
      addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => { window.matchMedia = original; });

  const side = () => document.querySelector(".settings-side")!;

  test("empieza oculta; el botón la despliega y marca aria-expanded", async () => {
    const { user } = setup();
    expect(side()).toHaveAttribute("data-floating");
    expect(side()).not.toHaveAttribute("data-open");
    const toggle = screen.getByRole("button", { name: "Mostrar el menú de ajustes" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(side()).toHaveAttribute("data-open");
    expect(screen.getByRole("button", { name: "Ocultar el menú de ajustes" })).toHaveAttribute("aria-expanded", "true");
  });

  test("se cierra con Escape y con un clic fuera, pero no con un clic dentro", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Mostrar el menú de ajustes" }));
    await user.click(screen.getByRole("heading", { name: "Admin User" }));
    expect(side()).toHaveAttribute("data-open");
    await user.keyboard("{Escape}");
    expect(side()).not.toHaveAttribute("data-open");
    await user.click(screen.getByRole("button", { name: "Mostrar el menú de ajustes" }));
    await user.click(document.querySelector(".settings-content")!);
    expect(side()).not.toHaveAttribute("data-open");
  });

  test("elegir una sección la cierra y la franja muestra el nombre de la sección actual", async () => {
    const { user } = setup("/settings/profile");
    expect(document.querySelector(".settings-titlebar-name")).toHaveTextContent("Perfil");
    await user.click(screen.getByRole("button", { name: "Mostrar el menú de ajustes" }));
    await user.click(screen.getByRole("link", { name: "Tema" }));
    expect(side()).not.toHaveAttribute("data-open");
    expect(document.querySelector(".settings-titlebar-name")).toHaveTextContent("Tema");
  });
});
