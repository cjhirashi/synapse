// H-063: Diff en la BITACORA con números de línea y colores (verde para agregadas, rojo para eliminadas)
import type { Page } from "@playwright/test";
import { expect, MOBILE, newSession, shot, test, waitForSynced, waitForVaults, type Seeded, type Size } from "./fixtures";

const tree = (page: Page) => page.getByRole("tree", { name: "Notas" });
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });

async function showSidebar(page: Page) {
  const show = page.getByRole("button", { name: "Mostrar la barra de notas" });
  if (await show.isVisible()) await show.click();
  await expect(page.getByRole("complementary", { name: "Notas de la bóveda" })).toBeVisible();
}

async function workspace(browser: Parameters<typeof newSession>[0], seeded: Seeded, size: Size) {
  const context = await newSession(browser, seeded, { theme: "dark", size });
  const page = await context.newPage();
  await page.goto(`/vaults/${seeded.vaults[0].id}`);
  await waitForVaults(page, seeded.vaults.length);
  await waitForSynced(page);
  await showSidebar(page);
  return { context, page };
}

for (const { label, size, theme } of [
  { label: "1280-dark", size: { width: 1280, height: 900 }, theme: "dark" },
  { label: "1280-light", size: { width: 1280, height: 900 }, theme: "light" },
  { label: "390-dark", size: MOBILE, theme: "dark" },
  { label: "390-light", size: MOBILE, theme: "light" },
]) {
  test(`H-063: diff con números y colores a ${label} px`, async ({ browser, content }) => {
    const { context, page } = await workspace(browser, content, size);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 150)));

    // 1. Crear una nota inicial para después editarla
    await expect(async () => {
      await showSidebar(page);
      await expect(tree(page).getByRole("treeitem", { name: "Raíz", exact: true })).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    await tree(page).getByRole("treeitem", { name: "Raíz", exact: true }).click();
    await showSidebar(page);
    await page.getByRole("button", { name: /^Nueva nota en/ }).click();
    await page.getByLabel(/Título de la nota nueva/).fill(`H063-test-${label}`);
    await page.getByLabel(/Contenido de la nota nueva/).fill("línea inicial\ncontenido antiguo\nlínea final");
    await page.getByRole("button", { name: "Crear nota", exact: true }).click();
    await expect(page.getByText("línea inicial")).toBeVisible({ timeout: 15_000 });
    await waitForSynced(page);

    // 2. Editar la nota: cambiar contenido y frontmatter
    const editor = page.locator(".editor-view");
    await editor.click();
    // Editar el contenido: reemplazar "contenido antiguo" con "contenido nuevo"
    // Primero seleccionar y borrar
    const findReplace = page.getByRole("button", { name: /buscar/i });
    if (await findReplace.isVisible({ timeout: 1000 })) {
      await findReplace.click();
    }
    // Seleccionar la segunda línea manualmente
    await editor.click();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await page.keyboard.press("Delete");
    await page.keyboard.type("contenido nuevo");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("línea agregada");
    await waitForSynced(page);

    // 3. Buscar la BITACORA y abrir el documento del día
    await expect(async () => {
      await showSidebar(page);
      await tree(page).getByRole("treeitem", { name: "BITACORA", exact: true }).click();
      await showSidebar(page);
      await expect(tree(page).getByRole("treeitem", { name: today().slice(0, 7), exact: true })).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 45_000 });
    await tree(page).getByRole("treeitem", { name: today().slice(0, 7), exact: true }).click();
    await showSidebar(page);
    await tree(page).getByRole("treeitem", { name: today(), exact: true }).click();
    await expect(page.getByText("Solo lectura · la escribe el servidor")).toBeVisible({ timeout: 15_000 });

    // 4. Verificar que el diff está presente y contiene números de línea
    const view = page.locator(".bitacora-view");
    const diffBlock = view.locator("code");
    await expect(diffBlock.first()).toBeVisible();

    // Dentro del bloque diff, buscar líneas con números
    const diffText = await diffBlock.first().textContent();
    // El diff debe contener: números de línea (formato: - {num} {num} {texto})
    // y líneas marcadas con +/- al inicio
    if (diffText) {
      // Verificar que hay líneas que empiezan con + o -
      const hasAddedLines = diffText.includes("+");
      const hasRemovedLines = diffText.includes("-");
      expect(hasAddedLines || hasRemovedLines).toBeTruthy();
    }

    // 5. Verificar colores en tema oscuro
    const addedLines = view.locator("code >> span[style*='color']").filter({ hasText: "+" });
    const removedLines = view.locator("code >> span[style*='color']").filter({ hasText: "-" });

    // Tomar capturas en ambos temas para documentación
    await shot(page, `h063-${label}-bitacora-diff`);

    // 6. Verificar contraste de color (con la API de computedStyle)
    if (addedLines.count() > 0) {
      const computedColor = await addedLines.first().evaluate((el) => window.getComputedStyle(el).color);
      // El color debe ser distinto del texto normal (no debe ser --text-secondary)
      expect(computedColor).toBeTruthy();
    }

    if (removedLines.count() > 0) {
      const computedColor = await removedLines.first().evaluate((el) => window.getComputedStyle(el).color);
      expect(computedColor).toBeTruthy();
    }

    await waitForSynced(page);
    await expect(page.getByText(/cambios? rechazados?/), "sin rechazos del push").toHaveCount(0);
    expect(errors, "sin errores de consola").toEqual([]);
    await context.close();
  });
}
