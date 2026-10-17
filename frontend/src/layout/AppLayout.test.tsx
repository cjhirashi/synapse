import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import type { SyncContextValue } from "../sync/useSync";
import { syncValue, WithSync } from "../test-utils/sync";
import AppLayout from "./AppLayout";

function renderAt(value: SyncContextValue, path = "/") {
  render(
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
    </WithSync>,
  );
  return userEvent.setup();
}

afterEach(() => vi.restoreAllMocks());

test("RF-023: muestra el enlace a Cambiar contraseña y lleva a la sección", async () => {
  const user = renderAt(syncValue().value);
  expect(screen.getByText("inicio privado")).toBeInTheDocument();
  await user.click(screen.getByRole("link", { name: "Cambiar contraseña" }));
  expect(screen.getByText("cambio de clave")).toBeInTheDocument();
});

test("RF-017: «Cerrar sesión» pide el cierre a la sincronización (que decide si avisar)", async () => {
  const { value } = syncValue();
  const user = renderAt(value);
  await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
  expect(value.requestLogout).toHaveBeenCalledOnce();
});

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

test("RF-018 / RF-028: los enlaces «Bóvedas» y «Papelera» llevan a sus secciones", async () => {
  const user = renderAt(syncValue().value);
  const nav = screen.getByRole("navigation", { name: "Principal" });
  await user.click(within(nav).getByRole("link", { name: "Papelera" }));
  expect(screen.getByText("sección papelera")).toBeInTheDocument();
  await user.click(within(nav).getByRole("link", { name: "Bóvedas" }));
  expect(screen.getByText("sección bóvedas")).toBeInTheDocument();
});
