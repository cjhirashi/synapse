// H-036c: tarjetas de Portada e Índice del PDF en un celular (390 px): sin desbordes horizontales, controles legibles y con área de toque suficiente.
import type { Locator, Page } from "@playwright/test";
import { expect, newSession, test, waitForSynced, waitForVaults, type Seeded } from "./fixtures";
import { OUT_DIR } from "./out-dir";

const tree = (page: Page) => page.getByRole("tree", { name: "Notas" });

async function showSidebar(page: Page) {
  const show = page.getByRole("button", { name: "Mostrar la barra de notas" });
  if (await show.isVisible()) await show.click();
  await expect(page.getByRole("complementary", { name: "Notas de la bóveda" })).toBeVisible();
}

/** Lo que se sale de la tarjeta por los lados y los controles de toque demasiado pequeños (WCAG 2.5.8: 24 px). */
async function measure(card: Locator) {
  return card.evaluate((root) => {
    const box = root.getBoundingClientRect();
    const overflow = [...root.querySelectorAll("*")]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > box.right + 1 || r.left < box.left - 1); })
      .map((el) => `${el.tagName.toLowerCase()}.${(el as HTMLElement).className}`);
    const small = [...root.querySelectorAll("input:not([type=hidden]), select, button")]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.height < 24 || r.width < 24); })
      .map((el) => `${el.tagName.toLowerCase()}[${el.getAttribute("aria-label") ?? ""}] ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`);
    return { overflow, small, width: Math.round(box.width) };
  });
}

for (const theme of ["dark", "light"] as const) {
  test(`H-036c: portada e índice en celular (${theme})`, async ({ browser, content }: { browser: Parameters<typeof newSession>[0]; content: Seeded }) => {
    const context = await newSession(browser, content, { theme, size: { width: 390, height: 2400 }, touch: true });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/vaults/${content.vaults[0].id}`);
    await waitForVaults(page, content.vaults.length);
    await waitForSynced(page);
    await showSidebar(page);
    await expect(async () => {
      await showSidebar(page);
      await expect(tree(page).getByRole("treeitem", { name: "PLANTILLAS", exact: true })).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    await tree(page).getByRole("treeitem", { name: "PLANTILLAS", exact: true }).click();
    await showSidebar(page);
    await page.getByRole("button", { name: /^Nueva plantilla/ }).click();
    await page.getByLabel("Nombre de la plantilla nueva").fill(`Movil ${theme}`);
    await page.getByRole("button", { name: "Crear plantilla" }).click();
    await expect(page.getByRole("heading", { name: `Plantilla movil-${theme}` })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("checkbox", { name: /Permitir descargar los documentos de esta plantilla como PDF/ }).check();

    const report: Record<string, unknown> = {};
    for (const [name, label] of [["portada", "Portada"], ["indice", "Índice"]] as const) {
      const card = page.getByRole("group", { name: label, exact: true });
      await card.scrollIntoViewIfNeeded();
      await card.screenshot({ path: `${OUT_DIR}/h036c-${name}-apagado-${theme}.png` });
      report[`${name}-apagado`] = await measure(card);
      await card.getByRole("checkbox", { name: `${label}: personalizar tipografía y color` }).check();
      await card.screenshot({ path: `${OUT_DIR}/h036c-${name}-personalizado-${theme}.png` });
      report[`${name}-personalizado`] = await measure(card);
    }
    console.log(`MEDIDAS ${theme} ${JSON.stringify(report)}`);
    expect(errors, "sin errores de página").toEqual([]);
    await context.close();
  });
}
