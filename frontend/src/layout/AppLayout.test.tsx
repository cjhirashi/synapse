import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import { MeContext } from "../auth/RequireAuth";
import type { SyncContextValue } from "../sync/useSync";
import { seedStore, syncValue, WithSync } from "../test-utils/sync";
import AppLayout from "./AppLayout";

const ME = { user_id: "1", email: "admin@synapse.test", role: "admin" as const, must_change_password: false, display_name: null, photo_url: null };

function renderAt(value: SyncContextValue, path = "/") {
  render(
    <MeContext.Provider value={ME}>
      <WithSync value={value}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<div>inicio privado</div>} />
              <Route path="/settings/password" element={<div>cambio de clave</div>} />
              <Route path="/vaults" element={<div>sección bóvedas</div>} />
              <Route path="/vaults/trash" element={<div>sección papelera</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </WithSync>
    </MeContext.Provider>,
  );
  return userEvent.setup();
}

afterEach(() => vi.restoreAllMocks());

// H-028 A7: el menú de cuenta sale de la navbar; «Cambiar contraseña» y «Cerrar sesión» viven ahora
// en la pantalla de usuario (/settings), cubiertos por SettingsPage.test. Aquí sólo queda que el
// `LogoutDialog` siga montado en el marco (el aviso de cambios sin sincronizar, RF-017).

test("RF-017: con el aviso abierto muestra el diálogo de cambios sin sincronizar", () => {
  const { value } = syncValue();
  renderAt({ ...value, logout: { ...value.logout, phase: "asking" } });
  expect(screen.getByRole("dialog", { name: "Hay cambios sin sincronizar" })).toBeInTheDocument();
});

test("RF-023: si el logout falla, avisa y no finge haber cerrado la sesión", () => {
  const { value } = syncValue();
  renderAt({ ...value, logout: { ...value.logout, failure: "logout" } });
  expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cerrar la sesión");
  expect(screen.getByText("inicio privado")).toBeInTheDocument();
});

test("RF-009: muestra la barra de sincronización", () => {
  const { value } = syncValue();
  renderAt(value);
  const bar = screen.getByRole("region", { name: "Sincronización" });
  expect(within(bar).getByRole("status")).toHaveTextContent("Sincronizado");
});

test("RF-018 / RF-028: el logo (enlace a Bóvedas) y «Papelera» (riel) llevan a sus secciones; ya no hay botón «Bóvedas» en la navbar", async () => {
  const user = renderAt(syncValue().value);
  // H-028 A7: «Papelera» salió de la navbar al riel; el botón «Bóvedas» también salió: su enlace es ahora el logo.
  expect(screen.queryByRole("navigation", { name: "Principal" })).toBeNull();
  const rail = screen.getByRole("navigation", { name: "Bóvedas abiertas" });
  await user.click(within(rail).getByRole("link", { name: "Papelera" }));
  expect(screen.getByText("sección papelera")).toBeInTheDocument();
  await user.click(screen.getByRole("link", { name: "Synapse, ir a Bóvedas" }));
  expect(screen.getByText("sección bóvedas")).toBeInTheDocument();
});

test("RF-001: las rutas privadas muestran el riel de bóvedas con una entrada por bóveda activa", async () => {
  const { value, db } = syncValue();
  await seedStore(db).create({ name: "Notas", description: null, tags: [] });
  renderAt(value);
  const rail = screen.getByRole("navigation", { name: "Bóvedas abiertas" });
  expect(await within(rail).findByRole("link", { name: / Notas$/ })).toHaveAttribute("href", expect.stringMatching(/^\/vaults\/[0-9a-f-]{36}$/));
});

// --- Bloque de marca (SPEC-0011 RF-008, RF-012, RF-018) ---------------------------------------

test("RF-008: la marca de la cabecera es primero el logo y después el texto «Synapse»; sin el cuadrado genérico", () => {
  renderAt(syncValue().value);

  const brand = document.querySelector(".app-header > .app-brand")!;
  expect(brand).not.toBeNull();
  // Orden de izquierda a derecha en el DOM: el primer hijo es el logo y el texto viene después.
  expect(brand.firstElementChild).toHaveClass("brand-logo");
  expect(brand.lastChild!.nodeType).toBe(Node.TEXT_NODE);
  expect(document.querySelector(".app-brand-mark")).toBeNull();
});

test("RF-012 (actualizado): el bloque de marca muestra exactamente «Synapse», es el enlace a /vaults y su logo es decorativo", () => {
  renderAt(syncValue().value);

  const brand = document.querySelector(".app-brand")!;
  expect(brand).toHaveTextContent(/^Synapse$/);
  expect(brand.tagName).toBe("A");
  expect(brand).toHaveAttribute("href", "/vaults");
  expect(brand).toHaveAccessibleName("Synapse, ir a Bóvedas");
  // El logo es decorativo: el nombre accesible sale de la etiqueta del enlace, no del dibujo.
  const logo = brand.querySelector(".brand-logo")!;
  expect(logo).toHaveAttribute("aria-hidden", "true");
  for (const attr of ["aria-label", "aria-labelledby", "title", "role", "alt"]) expect(logo, `${attr} en el logo`).not.toHaveAttribute(attr);
  expect(brand.querySelectorAll("a, button, input, [tabindex]")).toHaveLength(0);
  expect(screen.getAllByText("Synapse")).toHaveLength(1);
});

test("RF-018: hay un solo logo por pantalla privada, dentro de la cabecera", () => {
  renderAt(syncValue().value);

  expect(document.querySelectorAll(".brand-logo")).toHaveLength(1);
  expect(document.querySelectorAll(".app-header .brand-logo")).toHaveLength(1);
});
