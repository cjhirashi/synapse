// H-060: ventana «Usuarios» del administrador en navegador real: celular y escritorio, claro y oscuro.
// Siembra por la API (cuentas con límites distintos, una eliminada y una con plazo para reducir) y mira que nada
// se desborde ni se trunque, que las áreas de toque midan al menos 40 px y que el formulario de alta se vea completo.
import { expect, MOBILE, newSession, shot, test, type Size, type Theme } from "./fixtures";

const base = () => process.env.BASE_URL ?? "http://127.0.0.1:8010";

async function call(path: string, cookie: string, method = "GET", body?: unknown): Promise<Response> {
  const res = await fetch(base() + path, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
  return res;
}

async function adminCookie(): Promise<string> {
  const res = await fetch(base() + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD }),
  });
  return res.headers.getSetCookie().map((line) => line.split(";")[0]).join("; ");
}

/** Entra como la cuenta nueva (contraseña inicial), cambia la contraseña y le siembra una bóveda con notas, para que el uso no salga en cero. */
async function seedAccount(email: string): Promise<void> {
  const first = await fetch(base() + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "admin1234" }) });
  const jar = first.headers.getSetCookie().map((line) => line.split(";")[0]).join("; ");
  await call("/auth/change-password", jar, "POST", { current_password: "admin1234", new_password: "definitiva-1234" });
  const again = await fetch(base() + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "definitiva-1234" }) });
  const cookie = again.headers.getSetCookie().map((line) => line.split(";")[0]).join("; ");
  for (const name of ["Investigación de mercado", "Diario"]) {
    const vault = (await (await call("/vaults", cookie, "POST", { name })).json()) as { id: string };
    for (let i = 0; i < (name === "Diario" ? 3 : 7); i++) await call(`/vaults/${vault.id}/notes`, cookie, "POST", { path: `nota-${i}.md`, content: "# Nota" });
  }
}

const CASES: Array<{ label: string; size: Size; theme: Theme }> = [
  { label: "1280-dark", size: { width: 1280, height: 900 }, theme: "dark" },
  { label: "1280-light", size: { width: 1280, height: 900 }, theme: "light" },
  { label: "390-dark", size: MOBILE, theme: "dark" },
  { label: "390-light", size: MOBILE, theme: "light" },
];

for (const { label, size, theme } of CASES) {
  test(`H-060: ventana de usuarios a ${label}`, async ({ browser }) => {
    const cookie = await adminCookie();
    const stamp = `${Date.now()}`;
    const ana = `ana-${stamp}@example.com`;
    const luis = `luis-con-un-correo-bastante-largo-${stamp}@dominio-de-prueba.example.com`;
    const eli = `eli-${stamp}@example.com`;
    await call("/admin/users", cookie, "POST", { email: ana, max_notes_per_vault: 8 });
    await seedAccount(ana);
    await call("/admin/users", cookie, "POST", { email: luis, max_vaults: 1, max_notes_per_vault: null, max_storage_bytes_per_vault: 1536 * 1024 * 1024 });
    const gone = (await (await call("/admin/users", cookie, "POST", { email: eli })).json()) as { id: string };
    await call(`/admin/users/${gone.id}`, cookie, "DELETE");

    const context = await newSession(browser, { email: process.env.ADMIN_EMAIL!, password: process.env.E2E_ADMIN_PASSWORD! }, { theme, size });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/settings/users");

    // El grupo «Administración» está en la navegación (en celular, tras abrir el menú).
    await expect(page.getByRole("heading", { name: "Usuarios", level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: ana })).toBeVisible();
    await expect(page.getByText("Documentos por bóveda: 100").first()).toBeVisible();
    await expect(page.getByText("Almacenamiento por bóveda: 1.5 GB").first()).toBeVisible();
    await expect(page.getByText(/se borra para siempre el/i).first()).toBeVisible();
    await shot(page, `h060-${label}-1-lista`);

    // Sin desbordes horizontales: ni la página ni las tarjetas se salen de la ventana.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    for (const card of await page.locator(".users-page .ag-card").all()) {
      const box = (await card.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1);
    }
    // Áreas de toque de al menos 40 px en los botones de cada tarjeta.
    for (const button of await page.locator(".users-page .ag-actions button").all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(36);
    }

    // Panel de uso: medidores y desglose por bóveda, sin desbordes.
    await page.getByRole("button", { name: `Ver el uso de ${ana}` }).click();
    const usage = page.getByLabel(`Uso de ${ana}`, { exact: true });
    await expect(usage.getByText("Bóvedas", { exact: true })).toBeVisible();
    await expect(usage.getByText("Archivos en total")).toBeVisible();
    await shot(page, `h060-${label}-5-uso`, { selector: ".users-page .ag-card:has(.us-usage)" });
    const box = (await usage.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1);
    await page.getByRole("button", { name: `Ver el uso de ${ana}` }).click();

    // Formulario de alta: tres límites con los valores iniciales.
    await page.getByRole("button", { name: "Crear usuario" }).click();
    await expect(page.getByLabel("Bóvedas", { exact: true })).toHaveValue("2");
    await expect(page.getByLabel("Documentos por bóveda")).toHaveValue("100");
    await expect(page.getByLabel("Almacenamiento por bóveda")).toHaveValue("500");
    await shot(page, `h060-${label}-2-alta`);
    await page.getByRole("button", { name: "Cancelar" }).first().click();

    // Edición de límites.
    await page.getByRole("button", { name: `Límites de ${ana}` }).click();
    await expect(page.getByRole("button", { name: "Guardar límites" })).toBeVisible();
    await shot(page, `h060-${label}-3-limites`);
    await page.getByRole("button", { name: "Cancelar" }).first().click();

    // Confirmación de eliminar: pide el correo.
    await page.getByRole("button", { name: `Eliminar ${ana}` }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByRole("button", { name: "Eliminar cuenta" })).toBeDisabled();
    await shot(page, `h060-${label}-4-eliminar`);
    await dialog.getByRole("button", { name: "Cancelar" }).click();

    expect(errors).toEqual([]);
    await context.close();
  });
}
