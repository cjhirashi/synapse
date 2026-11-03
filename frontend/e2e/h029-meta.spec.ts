// H-029: sección META de la nota (siete atributos generales), Código sin YAML, fechas selladas y estados de la bóveda.
import type { Page } from "@playwright/test";
import { CONTENT_NOTES, noteName } from "./content-notes";
import { expect, MOBILE, newSession, shot, test, waitForSynced, waitForVaults, type Seeded, type Size } from "./fixtures";

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function openNote(page: Page, key: string) {
  const note = CONTENT_NOTES.find((n) => n.key === key)!;
  const show = page.getByRole("button", { name: "Mostrar la barra de notas" });
  if (await show.isVisible()) await show.click();
  const tree = page.getByRole("tree", { name: "Notas" });
  for (const folder of note.path.split("/").slice(0, -1)) {
    const row = tree.getByRole("treeitem", { name: folder, exact: true });
    if ((await row.getAttribute("aria-expanded")) === "false") await row.click();
  }
  await tree.getByRole("treeitem", { name: noteName(note), exact: true }).click();
  await expect(page.getByRole("heading", { name: noteName(note), level: 2 })).toBeVisible();
}

async function workspace(browser: Parameters<typeof newSession>[0], seeded: Seeded, size: Size) {
  const context = await newSession(browser, seeded, { theme: "dark", size });
  const page = await context.newPage();
  await page.goto(`/vaults/${seeded.vaults[0].id}`);
  await waitForVaults(page, seeded.vaults.length);
  await waitForSynced(page);
  const show = page.getByRole("button", { name: "Mostrar la barra de notas" });
  if (await show.isVisible()) await show.click();
  await expect(page.getByRole("complementary", { name: "Notas de la bóveda" })).toBeVisible();
  return { context, page };
}

for (const { label, size } of [{ label: "1280", size: { width: 1280, height: 900 } }, { label: "390", size: MOBILE }]) {
  test(`H-029: META, Código sin YAML, fechas y estados de la bóveda a ${label} px`, async ({ browser, content }) => {
    const { context, page } = await workspace(browser, content, size);
    const errors: string[] = [];
    // Los dos tamaños comparten la bóveda sembrada: valores propios para que el segundo también cambie algo.
    const titulo = `Nota META ${label}`;
    const tag = `mi_tag_${label}`;
    const estado = `en pruebas ${label}`;
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 150)));

    // 1. Lectura: los siete generales en orden fijo arriba del documento.
    await openNote(page, "props-types");
    const generals = page.getByRole("group", { name: "Atributos generales" });
    await expect(generals).toBeVisible();
    await expect(generals.locator("dt")).toHaveText(["Título", "Descripción", "Ruta", "Fecha de creación", "Fecha de actualización", "Etiquetas", "Estado"]);
    await expect(generals).toContainText("Propiedades/Tipos de propiedad.md");
    await shot(page, `h029-${label}-1-lectura`);

    // 2. Edición: título, etiqueta y estado; nada se emite al abrir (no queda «sucia» sin tocarla).
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    await expect(page.getByText("Cambios sin guardar")).toHaveCount(0);
    await page.getByLabel("Título", { exact: true }).fill(titulo);
    await page.getByPlaceholder("Añadir etiqueta (Enter)").fill(tag.replace(/_/g, " "));
    await page.keyboard.press("Enter");
    await expect(page.locator(".note-chip", { hasText: tag })).toBeVisible();
    await page.getByLabel("Estado", { exact: true }).selectOption("aprobado");
    await shot(page, `h029-${label}-2-edicion`);

    // 3. Código muestra solo el cuerpo (sin bloque YAML) y la sección META sigue arriba.
    await page.getByRole("button", { name: "Código", exact: true }).click();
    const code = page.locator(".cm-content");
    await expect(code).toBeVisible();
    const text = await code.innerText();
    expect(text, "Código no lleva YAML").not.toMatch(/^---/);
    expect(text).not.toContain("titulo:");
    await expect(page.getByLabel("Título", { exact: true })).toHaveValue(titulo);
    await page.getByRole("button", { name: "Visual", exact: true }).click();

    // 4. Un estado nuevo: queda en la nota y se añade al catálogo de la bóveda.
    await page.getByLabel("Estado", { exact: true }).selectOption({ label: "Otro estado…" });
    await page.getByLabel("Nuevo estado").fill(estado);
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Estado", { exact: true })).toHaveValue(estado);

    // 5. Guardar y leer: valores y fecha de actualización de hoy.
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Cambios sin guardar")).toHaveCount(0, { timeout: 10_000 });
    await page.getByRole("button", { name: "Leer", exact: true }).click();
    await expect(generals).toContainText(titulo);
    await expect(generals).toContainText(tag);
    await expect(generals).toContainText(estado);
    await expect(generals.locator("dd").nth(4)).toHaveText(todayLocal());
    await shot(page, `h029-${label}-3-guardada`);

    // 6. Otra nota de la bóveda ofrece el estado nuevo (catálogo).
    await openNote(page, "props-twelve");
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    await expect(page.getByLabel("Estado", { exact: true }).locator("option", { hasText: new RegExp(`^${estado}$`) })).toHaveCount(1, { timeout: 15_000 });
    await shot(page, `h029-${label}-4-estado-en-otra-nota`);

    expect(errors.filter((e) => !/Failed to load resource.*(favicon|manifest)/.test(e)), "sin errores de consola").toEqual([]);
    await context.close();
  });
}
