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
  id: "u1", email: "ana@synapse.test", role: "guest", display_name: null, must_change_password: false,
  created_at: "2026-11-18T10:00:00Z", deleted_at: null, purge_at: null, limits: LIMITS, vaults_used: 1, storage_bytes: 3 * api.MB, grace: [], ...over,
});

function mobile(matches: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches, media: query, addEventListener: () => undefined, removeEventListener: () => undefined,
    addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false,
  }));
}

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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("la tabla lista cada cuenta con rol, bóvedas, documentos, archivos y estado", async () => {
  vi.spyOn(api, "listUsers").mockResolvedValue([user({ limits: { ...LIMITS, max_notes_per_vault: 1000 } })]);
  setup();
  const table = await screen.findByRole("table", { name: "Cuentas" });
  const row = within(within(table).getByText("ana@synapse.test").closest("tr")!);
  expect(row.getByText("Usuario")).toBeInTheDocument(); // el rol va en la línea de apoyo de la cuenta
  expect(row.getByText("1 de 2")).toBeInTheDocument();
  expect(row.getByText("1,000 documentos por bóveda")).toBeInTheDocument();
  expect(row.getByText("3 MB")).toBeInTheDocument();
  expect(row.getByText("máx. 500 MB por bóveda")).toBeInTheDocument();
  expect(row.getByText("Activa")).toBeInTheDocument();
});

test("el estado prioriza: invitación pendiente, debe reducir y eliminada", async () => {
  vi.spyOn(api, "listUsers").mockResolvedValue([
    user({ id: "a", email: "a@s.test", must_change_password: true }),
    user({ id: "b", email: "b@s.test", grace: [{ kind: "documents", vault_id: "v", deadline_at: "2026-12-18T00:00:00Z" }] }),
  ]);
  setup();
  expect(await screen.findByText("Invitación pendiente")).toBeInTheDocument();
  expect(screen.getByText("Debe reducir")).toBeInTheDocument();
  expect(screen.getByText(/documentos antes del/i)).toBeInTheDocument();
});

test("el resumen suma cuentas activas, bóvedas, archivos y las que deben reducir", async () => {
  vi.spyOn(api, "listUsers").mockResolvedValue([
    user({ id: "a", email: "a@s.test", vaults_used: 2, storage_bytes: 10 * api.MB }),
    user({ id: "b", email: "b@s.test", vaults_used: 1, storage_bytes: 5 * api.MB, grace: [{ kind: "vaults", vault_id: null, deadline_at: "2026-12-18T00:00:00Z" }] }),
    user({ id: "c", email: "c@s.test", deleted_at: "2026-11-18T12:00:00Z", purge_at: "2026-12-18T12:00:00Z", vaults_used: 9, storage_bytes: 900 * api.MB }),
  ]);
  setup();
  const stats = await screen.findByRole("group", { name: "Resumen" }).catch(() => screen.findByLabelText("Resumen"));
  const value = (label: string) => within(stats).getByText(label).closest("div")!.querySelector("dd")!.textContent;
  expect(value("Cuentas")).toBe("2");
  expect(value("Bóvedas")).toBe("3");
  expect(value("Archivos")).toBe("15 MB");
  expect(value("Por reducir")).toBe("1");
});

test("filtros y búsqueda reducen la tabla; las eliminadas van aparte", async () => {
  vi.spyOn(api, "listUsers").mockResolvedValue([
    user({ id: "a", email: "ana@s.test" }),
    user({ id: "b", email: "boss@s.test", role: "admin" }),
    user({ id: "c", email: "cori@s.test", deleted_at: "2026-11-18T12:00:00Z", purge_at: "2026-12-18T12:00:00Z" }),
  ]);
  const u = setup();
  await screen.findByText("ana@s.test");
  expect(screen.queryByText("cori@s.test")).not.toBeInTheDocument();
  await u.click(screen.getByRole("button", { name: /^Administradores/ }));
  expect(screen.queryByText("ana@s.test")).not.toBeInTheDocument();
  expect(screen.getByText("boss@s.test")).toBeInTheDocument();
  await u.click(screen.getByRole("button", { name: /^Eliminadas/ }));
  expect(screen.getByText("cori@s.test")).toBeInTheDocument();
  expect(screen.getByText("Se borra el", { exact: false })).toBeInTheDocument();
  await u.click(screen.getByRole("button", { name: /^Todas/ }));
  await u.type(screen.getByLabelText("Buscar cuenta"), "zzz");
  expect(screen.getByText("Ninguna cuenta coincide con la búsqueda.")).toBeInTheDocument();
});

test("crear: la ventana trae 2 bóvedas, 100 documentos y 500 MB y envía los límites en bytes", async () => {
  vi.spyOn(api, "listUsers").mockResolvedValue([]);
  const create = vi.spyOn(api, "createUser").mockResolvedValue(user());
  const u = setup("admin");
  await u.click(await screen.findByRole("button", { name: "Crear usuario" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByLabelText("Bóvedas", { exact: true })).toHaveValue("2");
  expect(within(dialog).getByLabelText("Documentos por bóveda")).toHaveValue("100");
  expect(within(dialog).getByLabelText("Almacenamiento por bóveda")).toHaveValue("500");
  expect(within(dialog).queryByLabelText("Rol")).not.toBeInTheDocument(); // solo el super admin elige rol
  await u.type(within(dialog).getByLabelText("Correo"), "nuevo@synapse.test");
  await u.click(within(dialog).getByRole("button", { name: "Crear cuenta" }));
  expect(create).toHaveBeenCalledWith("nuevo@synapse.test", "guest", { max_vaults: 2, max_notes_per_vault: 100, max_storage_bytes_per_vault: 500 * api.MB });
  expect(await screen.findByRole("status")).toHaveTextContent(/admin1234/);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("crear: un campo vacío es «sin límite» y uno no numérico se rechaza antes de enviar", async () => {
  vi.spyOn(api, "listUsers").mockResolvedValue([]);
  const create = vi.spyOn(api, "createUser").mockResolvedValue(user());
  const u = setup();
  await u.click(await screen.findByRole("button", { name: "Crear usuario" }));
  const dialog = screen.getByRole("dialog");
  await u.type(within(dialog).getByLabelText("Correo"), "a@b.com");
  await u.clear(within(dialog).getByLabelText("Bóvedas", { exact: true }));
  await u.clear(within(dialog).getByLabelText("Documentos por bóveda"));
  await u.type(within(dialog).getByLabelText("Documentos por bóveda"), "12x");
  await u.click(within(dialog).getByRole("button", { name: "Crear cuenta" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(/números enteros/i);
  expect(create).not.toHaveBeenCalled();
  await u.clear(within(dialog).getByLabelText("Documentos por bóveda"));
  await u.click(within(dialog).getByRole("button", { name: "Crear cuenta" }));
  expect(create).toHaveBeenCalledWith("a@b.com", "guest", { max_vaults: null, max_notes_per_vault: null, max_storage_bytes_per_vault: 500 * api.MB });
});

test("crear: un correo repetido se explica dentro de la ventana, que sigue abierta", async () => {
  vi.spyOn(api, "listUsers").mockResolvedValue([]);
  vi.spyOn(api, "createUser").mockRejectedValue(new ApiError(409, { type: PROBLEM.emailTaken }));
  const u = setup();
  await u.click(await screen.findByRole("button", { name: "Crear usuario" }));
  const dialog = screen.getByRole("dialog");
  await u.type(within(dialog).getByLabelText("Correo"), "ana@synapse.test");
  await u.click(within(dialog).getByRole("button", { name: "Crear cuenta" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(/ya existe una cuenta/i);
});

test("límites: se editan en una ventana y avisan si la persona quedó por encima", async () => {
  vi.spyOn(api, "listUsers").mockResolvedValue([user()]);
  const save = vi.spyOn(api, "updateLimits").mockResolvedValue(user({ grace: [{ kind: "documents", vault_id: "v", deadline_at: "2026-12-18T00:00:00Z" }] }));
  const u = setup();
  await u.click(await screen.findByRole("button", { name: "Límites de ana@synapse.test" }));
  const dialog = screen.getByRole("dialog");
  const field = within(dialog).getByLabelText("Documentos por bóveda");
  await u.clear(field);
  await u.type(field, "10");
  await u.click(within(dialog).getByRole("button", { name: "Guardar límites" }));
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

test("una cuenta eliminada se recupera desde el filtro «Eliminadas»", async () => {
  vi.spyOn(api, "listUsers").mockResolvedValue([user({ deleted_at: "2026-11-18T12:00:00Z", purge_at: "2026-12-18T12:00:00Z" })]);
  const restore = vi.spyOn(api, "restoreUser").mockResolvedValue(user());
  const u = setup();
  await screen.findByRole("table", { name: "Cuentas" }).catch(() => undefined);
  await u.click(await screen.findByRole("button", { name: /^Eliminadas/ }));
  await u.click(screen.getByRole("button", { name: "Recuperar ana@synapse.test" }));
  expect(restore).toHaveBeenCalledWith("u1");
});

test("no se puede eliminar la propia cuenta; el cambio de rol es solo del super admin", async () => {
  vi.spyOn(api, "listUsers").mockResolvedValue([user({ id: "me", email: ME.email, role: "super_admin" }), user({ id: "a", email: "admin@synapse.test", role: "admin" })]);
  setup();
  await screen.findByText(ME.email);
  expect(screen.queryByRole("button", { name: `Eliminar ${ME.email}` })).not.toBeInTheDocument();
  expect(screen.getByText("Tú")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cambiar el rol de admin@synapse.test" })).toHaveAttribute("title", "Hacer usuario");
});

test("un admin no ve el cambio de rol", async () => {
  vi.spyOn(api, "listUsers").mockResolvedValue([user()]);
  setup("admin");
  await screen.findByText("ana@synapse.test");
  expect(screen.queryByRole("button", { name: /cambiar el rol/i })).not.toBeInTheDocument();
});

test("«Ver uso» abre una ventana con el uso por bóveda contra el límite y los totales", async () => {
  vi.spyOn(api, "listUsers").mockResolvedValue([user()]);
  const usage = vi.spyOn(api, "getUsage").mockResolvedValue({
    vaults: [
      { alias: "Bóveda 1", documents: 85, storage_bytes: 120 * api.MB },
      { alias: "Bóveda 2", documents: 3, storage_bytes: 0 },
    ],
    documents_total: 88,
    storage_bytes_total: 120 * api.MB,
  });
  const u = setup("admin");
  await u.click(await screen.findByRole("button", { name: "Ver el uso de ana@synapse.test" }));
  expect(usage).toHaveBeenCalledWith("u1");
  const panel = await screen.findByLabelText("Uso de ana@synapse.test");
  // Las bóvedas se muestran con alias: el nombre y el contenido son privados de la persona.
  expect(within(panel).getByText("Bóveda 1")).toBeInTheDocument();
  expect(within(panel).getByText("Bóveda 2")).toBeInTheDocument();
  expect(within(panel).getByText(/su nombre y su contenido son privados/i)).toBeInTheDocument();
  expect(within(panel).getByText("85 de 100")).toBeInTheDocument();
  expect(within(panel).getByText("120 MB de 500 MB")).toBeInTheDocument();
  expect(within(panel).getByText("2 de 2")).toBeInTheDocument(); // bóvedas: 2 de las 2 permitidas
  expect(within(panel).getByText("Documentos en total").nextSibling).toHaveTextContent("88");
  await u.click(screen.getByRole("button", { name: "Cerrar" }));
  expect(screen.queryByLabelText("Uso de ana@synapse.test")).not.toBeInTheDocument();
});

test("el uso de un administrador no muestra límites", async () => {
  vi.spyOn(api, "listUsers").mockResolvedValue([user({ role: "admin", id: "a", email: "admin@synapse.test" })]);
  vi.spyOn(api, "getUsage").mockResolvedValue({ vaults: [{ alias: "Bóveda 1", documents: 4, storage_bytes: 2 * api.MB }], documents_total: 4, storage_bytes_total: 2 * api.MB });
  const u = setup();
  await u.click(await screen.findByRole("button", { name: "Ver el uso de admin@synapse.test" }));
  const panel = await screen.findByLabelText("Uso de admin@synapse.test");
  expect(within(panel).queryByText(/\d (MB )?de \d/)).not.toBeInTheDocument();
  expect(within(panel).queryByRole("progressbar")).not.toBeInTheDocument();
});

test("si el cálculo del uso falla, la ventana lo avisa sin romper la lista", async () => {
  vi.spyOn(api, "listUsers").mockResolvedValue([user()]);
  vi.spyOn(api, "getUsage").mockRejectedValue(new ApiError(503, { title: "down" }));
  const u = setup();
  await u.click(await screen.findByRole("button", { name: "Ver el uso de ana@synapse.test" }));
  expect(await screen.findByText(/no se pudo calcular el uso/i)).toBeInTheDocument();
});

test("en celular las cuentas son tarjetas con acciones de texto y sin tabla", async () => {
  mobile(true);
  vi.spyOn(api, "listUsers").mockResolvedValue([user({ vaults_used: 2 })]);
  setup();
  const card = await screen.findByRole("listitem", { name: "ana@synapse.test" });
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(within(card).getByText("2 de 2")).toBeInTheDocument();
  for (const name of [/ver el uso/i, /límites de/i, /cambiar el rol/i, /eliminar/i]) {
    expect(within(card).getByRole("button", { name })).toBeVisible();
  }
  // Cuatro botones en una fila: la etiqueta visible es corta; el título conserva el texto completo.
  expect(within(card).getByText("Rol")).toBeInTheDocument();
  expect(within(card).getByRole("button", { name: /cambiar el rol/i })).toHaveAttribute("title", "Hacer admin");
  // Una cuenta activa no repite «Activa» en cada tarjeta; solo lo que requiere atención.
  expect(within(card).queryByText("Activa")).not.toBeInTheDocument();
});

test("si la carga falla, avisa y permite reintentar", async () => {
  const spy = vi.spyOn(api, "listUsers").mockRejectedValueOnce(new ApiError(503, { title: "down" }));
  const u = setup();
  expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudieron cargar/i);
  spy.mockResolvedValueOnce([user()]);
  await u.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(await screen.findByText("ana@synapse.test")).toBeInTheDocument();
});

test("límites: los valores sugeridos rellenan el campo y el almacenamiento grande se lee en GB", async () => {
  vi.spyOn(api, "listUsers").mockResolvedValue([user()]);
  const save = vi.spyOn(api, "updateLimits").mockResolvedValue(user());
  const u = setup();
  await u.click(await screen.findByRole("button", { name: "Límites de ana@synapse.test" }));
  const dialog = screen.getByRole("dialog");
  await u.click(within(within(dialog).getByRole("group", { name: "Valores sugeridos de almacenamiento por bóveda" })).getByRole("button", { name: "1 GB" }));
  expect(within(dialog).getByLabelText("Almacenamiento por bóveda")).toHaveValue("1024");
  expect(within(dialog).getByText("Equivale a 1 GB.")).toBeInTheDocument();
  await u.click(within(within(dialog).getByRole("group", { name: "Valores sugeridos de bóvedas" })).getByRole("button", { name: "5" }));
  await u.click(within(dialog).getByRole("button", { name: "Guardar límites" }));
  expect(save).toHaveBeenCalledWith("u1", { max_vaults: 5, max_notes_per_vault: 100, max_storage_bytes_per_vault: 1024 * api.MB });
});

test("límites: el interruptor «Sin límite» vacía el campo y al apagarlo devuelve el último valor", async () => {
  vi.spyOn(api, "listUsers").mockResolvedValue([user()]);
  const save = vi.spyOn(api, "updateLimits").mockResolvedValue(user());
  const u = setup();
  await u.click(await screen.findByRole("button", { name: "Límites de ana@synapse.test" }));
  const dialog = screen.getByRole("dialog");
  const field = within(dialog).getByLabelText("Documentos por bóveda");
  const toggle = within(dialog).getByRole("switch", { name: "Sin límite de documentos por bóveda" });
  expect(toggle).not.toBeChecked();
  await u.click(toggle);
  expect(field).toHaveValue("");
  expect(toggle).toBeChecked();
  await u.click(toggle);
  expect(field).toHaveValue("100");
  await u.click(toggle);
  await u.click(within(dialog).getByRole("button", { name: "Guardar límites" }));
  expect(save).toHaveBeenCalledWith("u1", { max_vaults: 2, max_notes_per_vault: null, max_storage_bytes_per_vault: 500 * api.MB });
});

test("límites: avisa en vivo si el tope de bóvedas queda por debajo de lo que la persona ya usa", async () => {
  vi.spyOn(api, "listUsers").mockResolvedValue([user({ vaults_used: 2 })]);
  const u = setup();
  await u.click(await screen.findByRole("button", { name: "Límites de ana@synapse.test" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("Hoy usa 2.")).toBeInTheDocument();
  await u.click(within(within(dialog).getByRole("group", { name: "Valores sugeridos de bóvedas" })).getByRole("button", { name: "1" }));
  expect(within(dialog).getByText(/Hoy usa 2: tendrá 30 días para reducir/)).toBeInTheDocument();
});

test("el uso sin bóvedas lo dice con claridad", async () => {
  vi.spyOn(api, "listUsers").mockResolvedValue([user({ vaults_used: 0 })]);
  vi.spyOn(api, "getUsage").mockResolvedValue({ vaults: [], documents_total: 0, storage_bytes_total: 0 });
  const u = setup();
  await u.click(await screen.findByRole("button", { name: "Ver el uso de ana@synapse.test" }));
  const panel = await screen.findByLabelText("Uso de ana@synapse.test");
  expect(within(panel).getByText("Aún no tiene bóvedas.")).toBeInTheDocument();
});

test("en celular la tarjeta muestra el estado solo si pide atención", async () => {
  mobile(true);
  vi.spyOn(api, "listUsers").mockResolvedValue([user({ id: "p", email: "p@s.test", must_change_password: true })]);
  setup();
  const card = await screen.findByRole("listitem", { name: "p@s.test" });
  expect(within(card).getByText("Invitación pendiente")).toBeInTheDocument();
});
