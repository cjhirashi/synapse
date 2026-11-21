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
    const mobile = size.width <= 640;
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

    await expect(page.getByRole("heading", { name: "Usuarios", level: 2 })).toBeVisible();
    // Escritorio: la tabla compartida; celular: tarjetas.
    if (mobile) {
      await expect(page.getByRole("listitem", { name: ana })).toBeVisible();
      await expect(page.getByRole("table")).toHaveCount(0);
    } else {
      await expect(page.getByRole("table", { name: "Cuentas" })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: /Cuenta/ })).toBeVisible();
    }
    await expect(page.getByText(ana).first()).toBeVisible();
    await expect(page.getByLabel("Resumen").getByText("Cuentas", { exact: true })).toBeVisible();
    await shot(page, `h060-${label}-1-lista`);
    if (mobile) {
      // Lista completa: el scroll vive en el contenedor de Ajustes, no en la página; se mide y se captura entero.
      await page.evaluate(() => { const c = document.querySelector<HTMLElement>(".settings-content"); if (c) c.scrollTop = 0; });
      const total = await page.evaluate(() => document.querySelector(".settings-content")?.scrollHeight ?? 0);
      await page.setViewportSize({ width: size.width, height: Math.min(total + 140, 4000) });
      await shot(page, `h060-${label}-0-completa`);
      await page.setViewportSize(size);
    }

    // Sin desbordes: la página no se desplaza en horizontal y cada acción cumple su área de toque.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    for (const button of await page.locator(".us-act").all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(mobile ? 43 : 29);
    }
    if (mobile) {
      for (const card of await page.locator(".us-card").all()) {
        const box = (await card.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1);
      }
    }

    // Filtros y búsqueda.
    await page.getByRole("button", { name: /^Eliminadas/ }).click();
    await expect(page.getByText(eli).first()).toBeVisible();
    await shot(page, `h060-${label}-6-eliminadas`);
    await page.getByRole("button", { name: /^Todas/ }).click();
    await page.getByLabel("Buscar cuenta").fill("luis-con");
    await expect(page.getByText(ana)).toHaveCount(0);
    await page.getByLabel("Buscar cuenta").fill("");

    // Uso por bóveda (ventana).
    await page.getByRole("button", { name: `Ver el uso de ${ana}`, exact: true }).click();
    const usage = page.getByLabel(`Uso de ${ana}`, { exact: true });
    await expect(usage.getByText("Archivos en total")).toBeVisible();
    // Privacidad: el administrador ve alias, nunca el nombre de las bóvedas de la persona.
    await expect(usage.getByText("Bóveda 1", { exact: true })).toBeVisible();
    await expect(usage.getByText("Investigación de mercado")).toHaveCount(0);
    await expect(usage.getByText("Diario")).toHaveCount(0);
    await shot(page, `h060-${label}-5-uso`);
    await page.getByRole("button", { name: "Cerrar", exact: true }).click();

    // Alta: tres límites con los valores iniciales.
    await page.getByRole("button", { name: "Crear usuario" }).click();
    const create = page.getByRole("dialog");
    await expect(create.getByLabel("Bóvedas", { exact: true })).toHaveValue("2");
    await expect(create.getByLabel("Documentos por bóveda", { exact: true })).toHaveValue("100");
    await expect(create.getByLabel("Almacenamiento por bóveda", { exact: true })).toHaveValue("500");
    await shot(page, `h060-${label}-2-alta`);
    await create.getByRole("button", { name: "Cancelar" }).click();

    // Límites.
    await page.getByRole("button", { name: `Límites de ${ana}`, exact: true }).click();
    await expect(page.getByRole("button", { name: "Guardar" })).toBeVisible();
    await shot(page, `h060-${label}-3-limites`);
    await page.getByRole("button", { name: "Cancelar" }).click();

    // Eliminar: pide el correo.
    await page.getByRole("button", { name: `Eliminar ${ana}`, exact: true }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByRole("button", { name: "Eliminar cuenta" })).toBeDisabled();
    await shot(page, `h060-${label}-4-eliminar`);
    await dialog.getByRole("button", { name: "Cancelar" }).click();

    expect(errors).toEqual([]);
    await context.close();
  });
}
