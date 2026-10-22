import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import RequireAuth, { useMe } from "./RequireAuth";
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
  vi.spyOn(api, "getMe").mockResolvedValue({ user_id: "1", email: "test@synapse.local", role: "admin", must_change_password: true });
  renderAt("/");
  expect(await screen.findByText("cambio de clave")).toBeInTheDocument();
});

test("RF-020: la propia página de cambio es accesible con el indicador activo (sin bucle)", async () => {
  vi.spyOn(api, "getMe").mockResolvedValue({ user_id: "1", email: "test@synapse.local", role: "admin", must_change_password: true });
  renderAt("/settings/password");
  expect(await screen.findByText("cambio de clave")).toBeInTheDocument();
});

test("RF-006: sin sesión (401) redirige a /login", async () => {
  vi.spyOn(api, "getMe").mockRejectedValue(new api.ApiError(401, { type: "urn:synapse:problem:not-authenticated", title: "Not authenticated" }));
  renderAt("/");
  expect(await screen.findByText("pantalla login")).toBeInTheDocument();
});

test("usuario con clave ya cambiada ve la ruta privada", async () => {
  vi.spyOn(api, "getMe").mockResolvedValue({ user_id: "1", email: "test@synapse.local", role: "guest", must_change_password: false });
  renderAt("/");
  expect(await screen.findByText("inicio privado")).toBeInTheDocument();
});

test("la página de cambio es accesible también con el indicador desactivado (todo usuario autenticado)", async () => {
  vi.spyOn(api, "getMe").mockResolvedValue({ user_id: "1", email: "test@synapse.local", role: "guest", must_change_password: false });
  renderAt("/settings/password");
  expect(await screen.findByText("cambio de clave")).toBeInTheDocument();
});

function ShowMe() {
  const me = useMe();
  return <div>usuario {me.user_id}</div>;
}

test("SPEC-0005: `useMe()` da el usuario verificado a las rutas privadas", async () => {
  vi.spyOn(api, "getMe").mockResolvedValue({ user_id: "u-7", email: "test@synapse.local", role: "guest", must_change_password: false });
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<RequireAuth><ShowMe /></RequireAuth>} />
      </Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByText("usuario u-7")).toBeInTheDocument();
});

test("SPEC-0005 RF-009: si al navegar la comprobación falla sin red, la sesión verificada sigue", async () => {
  vi.spyOn(api, "getMe")
    .mockResolvedValueOnce({ user_id: "1", email: "test@synapse.local", role: "guest", must_change_password: false })
    .mockRejectedValueOnce(new TypeError("Failed to fetch"));
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<RequireAuth><Link to="/otra">ir</Link></RequireAuth>} />
        <Route path="/otra" element={<RequireAuth><div>otra privada</div></RequireAuth>} />
      </Routes>
    </MemoryRouter>,
  );
  await userEvent.click(await screen.findByRole("link", { name: "ir" }));
  expect(await screen.findByText("otra privada")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("sin una sesión verificada antes, un fallo de red lo avisa", async () => {
  vi.spyOn(api, "getMe").mockRejectedValue(new TypeError("Failed to fetch"));
  renderAt("/");
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo verificar la sesión.");
});
