import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import { ApiError, PROBLEM } from "../api/problems";
import { MeContext } from "../auth/RequireAuth";
import UsersPage from "./UsersPage";
import * as api from "./adminUsers";

const ME = { user_id: "me", email: "carlos@synapse.test", role: "super_admin" as const, must_change_password: false, display_name: null, photo_url: null };
const LIMITS = { max_vaults: 2, max_notes_per_vault: 100, max_storage_bytes_per_vault: 500 * api.MB };

const user = (over: Partial<api.AdminUser> = {}): api.AdminUser => ({
  id: "u1", email: "ana@synapse.test", role: "guest", display_name: null, must_change_password: true,
  created_at: "2026-11-18T10:00:00Z", deleted_at: null, purge_at: null, limits: LIMITS, vaults_used: 1, storage_bytes: 3 * api.MB, grace: [], ...over,
});

function setup(role: "super_admin" | "admin" = "super_admin") {
  render(
    <MeContext.Provider value={{ ...ME, role }}>
      <MemoryRouter initialEntries={["/settings/users"]}>
        <Routes>
          <Route path="/settings/users" element={<UsersPage />} />
          <Route path="/login" element={<p>Pantalla de login</p>} />
        </Routes>
      </MemoryRouter>
    </MeContext.Provider>,
  );
  return userEvent.setup();
}

afterEach(() => vi.restoreAllMocks());

test("lista las cuentas con su rol, uso y límites en formato mexicano", async () => {
  vi.spyOn(api, "listUsers").mockResolvedValue([user({ limits: { ...LIMITS, max_notes_per_vault: 1000 } })]);
  setup();
  expect(await screen.findByRole("heading", { name: "ana@synapse.test" })).toBeInTheDocument();
  expect(screen.getByText("Usuario")).toBeInTheDocument();
  expect(screen.getByText("Bóvedas: 1 de 2")).toBeInTheDocument();
  expect(screen.getByText("Documentos por bóveda: 1,000")).toBeInTheDocument();
  expect(screen.getByText("Almacenamiento por bóveda: 500 MB")).toBeInTheDocument();
  expect(screen.getByText(/aún no cambia la contraseña inicial/i)).toBeInTheDocument();
});

test("crear: el formulario trae 2 bóvedas, 100 documentos y 500 MB y envía los límites en bytes", async () => {
  vi.spyOn(api, "listUsers").mockResolvedValue([]);
  const create = vi.spyOn(api, "createUser").mockResolvedValue(user());
  const u = setup("admin");
  await u.click(await screen.findByRole("button", { name: "Crear usuario" }));
  expect(screen.getByLabelText("Bóvedas", { exact: true })).toHaveValue("2");
  expect(screen.getByLabelText("Documentos por bóveda")).toHaveValue("100");
  expect(screen.getByLabelText("Almacenamiento por bóveda")).toHaveValue("500");
  expect(screen.queryByLabelText("Rol")).not.toBeInTheDocument(); // solo el super admin elige rol
  await u.type(screen.getByLabelText("Correo"), "nuevo@synapse.test");
  await u.click(screen.getByRole("button", { name: "Crear cuenta" }));
  expect(create).toHaveBeenCalledWith("nuevo@synapse.test", "guest", { max_vaults: 2, max_notes_per_vault: 100, max_storage_bytes_per_vault: 500 * api.MB });
  expect(await screen.findByRole("status")).toHaveTextContent(/admin1234/);
});

test("crear: un campo vacío es «sin límite» y uno no numérico se rechaza antes de enviar", async () => {
  vi.spyOn(api, "listUsers").mockResolvedValue([]);
  const create = vi.spyOn(api, "createUser").mockResolvedValue(user());
  const u = setup();
  await u.click(await screen.findByRole("button", { name: "Crear usuario" }));
  await u.type(screen.getByLabelText("Correo"), "a@b.com");
  await u.clear(screen.getByLabelText("Bóvedas", { exact: true }));
  await u.clear(screen.getByLabelText("Documentos por bóveda"));
  await u.type(screen.getByLabelText("Documentos por bóveda"), "12x");
  await u.click(screen.getByRole("button", { name: "Crear cuenta" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/números enteros/i);
  expect(create).not.toHaveBeenCalled();
  await u.clear(screen.getByLabelText("Documentos por bóveda"));
  await u.click(screen.getByRole("button", { name: "Crear cuenta" }));
  expect(create).toHaveBeenCalledWith("a@b.com", "guest", { max_vaults: null, max_notes_per_vault: null, max_storage_bytes_per_vault: 500 * api.MB });
});

test("crear: un correo repetido se explica con el motivo del servidor", async () => {
  vi.spyOn(api, "listUsers").mockResolvedValue([]);
  vi.spyOn(api, "createUser").mockRejectedValue(new ApiError(409, { type: PROBLEM.emailTaken }));
  const u = setup();
  await u.click(await screen.findByRole("button", { name: "Crear usuario" }));
  await u.type(screen.getByLabelText("Correo"), "ana@synapse.test");
  await u.click(screen.getByRole("button", { name: "Crear cuenta" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/ya existe una cuenta/i);
});

test("límites: se editan y avisan si la persona quedó por encima", async () => {
  vi.spyOn(api, "listUsers").mockResolvedValue([user()]);
  const save = vi.spyOn(api, "updateLimits").mockResolvedValue(user({ grace: [{ kind: "documents", vault_id: "v", deadline_at: "2026-12-18T00:00:00Z" }] }));
  const u = setup();
  await u.click(await screen.findByRole("button", { name: "Límites de ana@synapse.test" }));
  const field = screen.getByLabelText("Documentos por bóveda");
  await u.clear(field);
  await u.type(field, "10");
  await u.click(screen.getByRole("button", { name: "Guardar límites" }));
  expect(save).toHaveBeenCalledWith("u1", { max_vaults: 2, max_notes_per_vault: 10, max_storage_bytes_per_vault: 500 * api.MB });
  expect(await screen.findByRole("status")).toHaveTextContent(/30 días para reducirlo/);
});

test("eliminar exige escribir el correo y avisa de los 30 días", async () => {
  vi.spyOn(api, "listUsers").mockResolvedValue([user()]);
  const del = vi.spyOn(api, "deleteUser").mockResolvedValue(user({ deleted_at: "2026-11-18T12:00:00Z" }));
  const u = setup();
  await u.click(await screen.findByRole("button", { name: "Eliminar ana@synapse.test" }));
  const dialog = screen.getByRole("alertdialog");
  const confirm = within(dialog).getByRole("button", { name: "Eliminar cuenta" });
  expect(confirm).toBeDisabled();
  await u.type(within(dialog).getByLabelText(/escribe su correo/i), "ana@synapse.test");
  expect(confirm).toBeEnabled();
  await u.click(confirm);
  expect(del).toHaveBeenCalledWith("u1");
  expect(await screen.findByRole("status")).toHaveTextContent(/recuperarla durante 30 días/i);
});

test("una cuenta eliminada se puede recuperar y muestra su fecha de borrado definitivo", async () => {
  vi.spyOn(api, "listUsers").mockResolvedValue([user({ deleted_at: "2026-11-18T12:00:00Z", purge_at: "2026-12-18T12:00:00Z" })]);
  const restore = vi.spyOn(api, "restoreUser").mockResolvedValue(user());
  const u = setup();
  expect(await screen.findByText(/se borra para siempre el/i)).toBeInTheDocument();
  await u.click(screen.getByRole("button", { name: "Recuperar ana@synapse.test" }));
  expect(restore).toHaveBeenCalledWith("u1");
});

test("no se puede eliminar la propia cuenta; el cambio de rol es solo del super admin", async () => {
  vi.spyOn(api, "listUsers").mockResolvedValue([user({ id: "me", email: ME.email, role: "super_admin" }), user({ id: "a", email: "admin@synapse.test", role: "admin" })]);
  setup();
  await screen.findByRole("heading", { name: ME.email });
  expect(screen.queryByRole("button", { name: `Eliminar ${ME.email}` })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cambiar el rol de admin@synapse.test" })).toHaveTextContent("Hacer usuario");
});

test("un admin no ve el cambio de rol", async () => {
  vi.spyOn(api, "listUsers").mockResolvedValue([user()]);
  setup("admin");
  await screen.findByRole("heading", { name: "ana@synapse.test" });
  expect(screen.queryByRole("button", { name: /cambiar el rol/i })).not.toBeInTheDocument();
});

test("si la carga falla, avisa y permite reintentar", async () => {
  const spy = vi.spyOn(api, "listUsers").mockRejectedValueOnce(new ApiError(503, { title: "down" }));
  const u = setup();
  expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudieron cargar/i);
  spy.mockResolvedValueOnce([user()]);
  await u.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(await screen.findByRole("heading", { name: "ana@synapse.test" })).toBeInTheDocument();
});

test("«Ver uso» muestra el uso por bóveda contra el límite y los totales", async () => {
  vi.spyOn(api, "listUsers").mockResolvedValue([user({ limits: { ...LIMITS, max_notes_per_vault: 100 } })]);
  const usage = vi.spyOn(api, "getUsage").mockResolvedValue({
    vaults: [
      { vault_id: "v1", name: "Investigación", documents: 85, storage_bytes: 120 * api.MB },
      { vault_id: "v2", name: "Diario", documents: 3, storage_bytes: 0 },
    ],
    documents_total: 88,
    storage_bytes_total: 120 * api.MB,
  });
  const u = setup("admin");
  expect(await screen.findByText("Archivos en total: 3 MB")).toBeInTheDocument();
  await u.click(await screen.findByRole("button", { name: "Ver el uso de ana@synapse.test" }));
  expect(usage).toHaveBeenCalledWith("u1");
  const panel = await screen.findByLabelText("Uso de ana@synapse.test");
  expect(within(panel).getByText("Investigación")).toBeInTheDocument();
  expect(within(panel).getByText("85 de 100")).toBeInTheDocument();
  expect(within(panel).getByText("120 MB de 500 MB")).toBeInTheDocument();
  expect(within(panel).getByText("Documentos en total").nextSibling).toHaveTextContent("88");
  expect(within(panel).getByText("2 de 2")).toBeInTheDocument(); // bóvedas: 2 de las 2 permitidas
  await u.click(screen.getByRole("button", { name: "Ver el uso de ana@synapse.test" }));
  expect(screen.queryByLabelText("Uso de ana@synapse.test")).not.toBeInTheDocument();
});

test("el uso de un administrador no muestra límites", async () => {
  vi.spyOn(api, "listUsers").mockResolvedValue([user({ role: "admin", id: "a", email: "admin@synapse.test" })]);
  vi.spyOn(api, "getUsage").mockResolvedValue({ vaults: [{ vault_id: "v1", name: "Una", documents: 4, storage_bytes: 2 * api.MB }], documents_total: 4, storage_bytes_total: 2 * api.MB });
  const u = setup();
  await u.click(await screen.findByRole("button", { name: "Ver el uso de admin@synapse.test" }));
  const panel = await screen.findByLabelText("Uso de admin@synapse.test");
  expect(within(panel).queryByText(/ de /)).not.toBeInTheDocument();
  expect(within(panel).queryByRole("progressbar")).not.toBeInTheDocument();
});

test("si el cálculo del uso falla, lo avisa sin romper la lista", async () => {
  vi.spyOn(api, "listUsers").mockResolvedValue([user()]);
  vi.spyOn(api, "getUsage").mockRejectedValue(new ApiError(503, { title: "down" }));
  const u = setup();
  await u.click(await screen.findByRole("button", { name: "Ver el uso de ana@synapse.test" }));
  expect(await screen.findByText(/no se pudo calcular el uso/i)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "ana@synapse.test" })).toBeInTheDocument();
});
