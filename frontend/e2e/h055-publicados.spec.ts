// H-055 fase 2: pestaña «Publicados» y fecha de despublicación en navegador real (celular y escritorio, claro y oscuro):
// la lista, sin desbordes, controles táctiles, fijar, cambiar y quitar la fecha, despublicar, y la fecha al publicar desde el diálogo.
import type { Page } from "@playwright/test";
import { expect, MOBILE, newSession, shot, test, waitForSynced, waitForVaults } from "./fixtures";

const origin = () => process.env.BASE_URL ?? "http://127.0.0.1:8010";

async function session(user: { email: string; password: string }) {
  const login = await fetch(`${origin()}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: user.email, password: user.password }),
  });
  const cookie = login.headers.getSetCookie().map((line) => line.split(";")[0]).join("; ");
  return async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${origin()}${path}`, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, json: () => JSON.parse(text) as any };
  };
}

async function openTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { name });
  await expect(async () => {
    const show = page.getByRole("button", { name: "Mostrar la barra de notas" });
    if (await show.isVisible()) await show.click();
    await expect(tab).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await tab.click();
}

for (const { label, size } of [{ label: "390", size: MOBILE }, { label: "1280", size: { width: 1280, height: 900 } }]) {
  for (const scheme of ["light", "dark"] as const) {
    test(`H-055: Publicados y fecha de despublicación a ${label} px (${scheme})`, async ({ browser, content }) => {
      const vault = content.vaults[0];
      const api = await session(content);
      const base = `/vaults/${vault.id}`;
      const template = await api("POST", `${base}/notes`, {
        path: "PLANTILLAS/plantilla-pub.md", content: "# Estructura",
        frontmatter: { titulo: "Pub", descripcion: "Plantilla de prueba", alcance: ["*"], atributos: [], estados: [{ nombre: "borrador", color: "azul" }], estilo: { publicar: { activo: true }, pdf: {} } },
      });
      expect([201, 409]).toContain(template.status);
      const make = async (name: string, title: string) => {
        const note = await api("POST", `${base}/notes`, {
          path: `Pub${label}${scheme}/${name}.md`, content: `# ${title}\n\nTexto.`,
          frontmatter: { titulo: title, descripcion: "Prueba", tags: [], estado: "borrador", plantilla: "pub" },
        });
        expect(note.status, note.text).toBe(201);
        return note.json().id as string;
      };
      const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
      const first = await make("Primero", `Informe con un título bastante largo para comprobar que se parte bien ${label} ${scheme}`);
      const second = await make("Segundo", `Segundo ${label} ${scheme}`);
      const p1 = await api("POST", `${base}/notes/${first}/publication`, { html: "<p>Uno</p>", unpublish_at: soon });
      const p2 = await api("POST", `${base}/notes/${second}/publication`, { html: "<p>Dos</p>" });
      expect(p1.status, p1.text).toBe(201);
      expect(p2.status, p2.text).toBe(201);

      const context = await newSession(browser, content, { theme: scheme, size, touch: label === "390" });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(base);
      await waitForVaults(page, content.vaults.length);
      await waitForSynced(page);
      await openTab(page, "Publicados");

      await expect(page.getByRole("heading", { name: "Documentos publicados" })).toBeVisible();
      const cards = page.locator(".published-card");
      await expect(cards).toHaveCount(2);
      await expect(page.locator(".published-list-count")).toHaveText("2 documentos");
      await expect(cards.first()).toContainText(`Segundo ${label} ${scheme}`); // la más reciente primero
      await expect(cards.first()).toContainText("Sin fecha de despublicación");
      await expect(cards.nth(1)).toContainText("Se despublicará el");

      // Sin desbordes y con controles táctiles
      const overflow = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, view: window.innerWidth }));
      expect(overflow.doc, `ancho ${overflow.doc} contra ${overflow.view}`).toBeLessThanOrEqual(overflow.view + 1);
      for (const button of await cards.first().locator("button, a.btn").all()) {
        expect((await button.boundingBox())!.height, await button.innerText()).toBeGreaterThanOrEqual(40);
      }
      for (const card of await cards.all()) {
        const box = (await card.boundingBox())!;
        expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1);
      }
      await shot(page, `h055-publicados-${label}-${scheme}`);

      // Fijar fecha en la primera tarjeta (sin fecha)
      await cards.first().getByRole("button", { name: "Fecha de despublicación" }).click();
      const picker = cards.first().locator("input[type=datetime-local]");
      await expect(picker).toBeVisible();
      expect(await picker.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
      await expect(cards.first().getByRole("button", { name: "Guardar fecha" })).toBeEnabled();
      await picker.fill("2020-01-01T10:00"); // pasada
      await expect(cards.first().getByText("Elige una fecha al menos 5 minutos adelante.")).toBeVisible();
      await expect(cards.first().getByRole("button", { name: "Guardar fecha" })).toBeDisabled();
      await shot(page, `h055-publicados-fecha-invalida-${label}-${scheme}`);
      await picker.fill("2030-03-15T10:00");
      await cards.first().getByRole("button", { name: "Guardar fecha" }).click();
      await expect(cards.first()).toContainText("Se despublicará el");
      const saved = await api("GET", `${base}/notes/${second}/publication`);
      expect(saved.json().unpublish_at).toBe("2030-03-15T16:00:00Z"); // 10:00 CDMX = 16:00 UTC

      // Quitar la fecha
      await cards.first().getByRole("button", { name: "Fecha de despublicación" }).click();
      await cards.first().getByRole("button", { name: "Quitar fecha" }).click();
      await expect(cards.first()).toContainText("Sin fecha de despublicación");
      expect((await api("GET", `${base}/notes/${second}/publication`)).json().unpublish_at).toBeNull();

      // Despublicar con confirmación
      await cards.first().getByRole("button", { name: "Despublicar" }).click();
      await expect(cards.first().getByText("Se elimina la copia y el enlace deja de funcionar. Si vuelves a publicar, el enlace será otro.")).toBeVisible();
      await shot(page, `h055-publicados-confirmar-${label}-${scheme}`);
      await cards.first().locator(".published-card-confirm-delete").getByRole("button", { name: "Despublicar" }).click();
      await expect(cards).toHaveCount(1);
      expect((await fetch(`${origin()}${p2.json().path}`)).status).toBe(404);

      // Limpieza
      expect((await api("DELETE", `${base}/notes/${first}/publication`)).status).toBe(204);
      expect(errors, "sin errores de página").toEqual([]);
      await context.close();
    });
  }
}

async function openDoc(page: Page, folder: string, name: string) {
  const tree = page.getByRole("tree", { name: "Notas" });
  await expect(async () => {
    const show = page.getByRole("button", { name: "Mostrar la barra de notas" });
    if (await show.isVisible()) await show.click();
    await expect(tree.getByRole("treeitem", { name: folder, exact: true })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await tree.getByRole("treeitem", { name: folder, exact: true }).click();
  const row = tree.getByRole("treeitem", { name, exact: true });
  await expect(async () => {
    const show = page.getByRole("button", { name: "Mostrar la barra de notas" });
    if (await show.isVisible()) await show.click();
    await expect(row).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });
  await row.focus();
  await page.keyboard.press("Enter");
}

for (const { label, size } of [{ label: "390", size: MOBILE }, { label: "1280", size: { width: 1280, height: 900 } }]) {
  test(`H-055: fecha de despublicación en el diálogo de publicar a ${label} px`, async ({ browser, content }) => {
    const vault = content.vaults[0];
    const api = await session(content);
    const base = `/vaults/${vault.id}`;
    const folder = `Dlg${label}`;
    const template = await api("POST", `${base}/notes`, {
      path: "PLANTILLAS/plantilla-pub.md", content: "# Estructura",
      frontmatter: { titulo: "Pub", descripcion: "Plantilla de prueba", alcance: ["*"], atributos: [], estados: [{ nombre: "borrador", color: "azul" }], estilo: { publicar: { activo: true }, pdf: {} } },
    });
    expect([201, 409]).toContain(template.status);
    const created = await api("POST", `${base}/notes`, {
      path: `${folder}/Informe.md`, content: "# Informe\n\nTexto.", frontmatter: { titulo: `Informe ${label}`, descripcion: "Prueba", tags: [], estado: "borrador", plantilla: "pub" },
    });
    expect(created.status, created.text).toBe(201);
    const noteId = created.json().id as string;

    const context = await newSession(browser, content, { theme: "dark", size, touch: label === "390" });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await waitForVaults(page, content.vaults.length);
    await waitForSynced(page);
    await openDoc(page, folder, "Informe");
    await page.getByRole("button", { name: "Publicar en la web" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("checkbox", { name: /Entiendo que cualquier persona/ }).check();
    await expect(dialog.getByRole("button", { name: "Publicar", exact: true })).toBeEnabled({ timeout: 15_000 });
    await expect(dialog.getByText("Fecha y hora de despublicación")).toHaveCount(0);
    await dialog.getByRole("checkbox", { name: "Despublicar automáticamente en una fecha" }).check();
    const picker = dialog.locator("input[type=datetime-local]");
    await expect(picker).toBeVisible();
    await picker.fill("2020-01-01T10:00");
    await expect(dialog.getByRole("button", { name: "Publicar", exact: true })).toBeDisabled();
    await shot(page, `h055-dialogo-fecha-invalida-${label}`);
    await picker.fill("2030-03-15T10:00");
    await expect(dialog.getByRole("button", { name: "Publicar", exact: true })).toBeEnabled();
    await dialog.getByRole("button", { name: "Publicar", exact: true }).click();
    await expect(dialog.getByText("Publicado. Copia el enlace para compartirlo.")).toBeVisible();
    await expect(dialog.getByText(/Se despublicará el .*CDMX/)).toBeVisible();
    expect((await api("GET", `${base}/notes/${noteId}/publication`)).json().unpublish_at).toBe("2030-03-15T16:00:00Z");
    await shot(page, `h055-dialogo-publicado-${label}`);

    await dialog.getByRole("button", { name: "Quitar" }).click();
    await expect(dialog.getByText("Sin fecha de despublicación.")).toBeVisible();
    expect((await api("GET", `${base}/notes/${noteId}/publication`)).json().unpublish_at).toBeNull();

    expect((await api("DELETE", `${base}/notes/${noteId}/publication`)).status).toBe(204);
    expect(errors, "sin errores de página").toEqual([]);
    await context.close();
  });
}
