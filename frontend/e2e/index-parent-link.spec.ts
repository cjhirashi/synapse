// Enlace automático al índice padre en cada documento y líneas propias (estado + fecha, descripción, tags) en los índices.
import { expect, openNote, openWorkspace, shot, test } from "./fixtures";

for (const theme of ["dark", "light"] as const) {
  test(`índice padre y líneas del índice (${theme})`, async ({ browser, indexDemo }) => {
    const { context, page } = await openWorkspace(browser, indexDemo, { theme, size: { width: 1280, height: 900 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const show = page.getByRole("button", { name: "Mostrar la barra de notas" });
    if (await show.isVisible()) await show.click();
    const tree = page.getByRole("tree", { name: "Notas" });
    const folder = tree.getByRole("treeitem", { name: "Guías", exact: true });
    if ((await folder.getAttribute("aria-expanded")) === "false") await folder.click();
    await openNote(page, "Primera guía");
    const nav = page.getByRole("navigation", { name: "Índice padre" });
    await expect(nav).toBeVisible();
    // Entre las propiedades y el contenido del documento.
    const meta = await page.locator(".note-meta, [aria-label='Propiedades']").first().boundingBox();
    const navBox = (await nav.boundingBox())!;
    const body = (await page.locator(".milkdown-view").boundingBox())!;
    if (meta) expect(navBox.y).toBeGreaterThanOrEqual(meta.y);
    expect(navBox.y).toBeLessThan(body.y);
    await shot(page, `indice-padre-enlace-${theme}`);
    await nav.getByRole("button").click();
    await expect(page.locator(".index-list")).toBeVisible();
    const first = page.locator(".index-list li.index-item", { hasText: "Primera guía" });
    await expect(first.locator(".index-item-title")).toBeVisible();
    await expect(first.locator(".index-item-tags .tag-pill")).toHaveCount(3);
    await expect(first.locator(".index-item-state .estado-pill")).toHaveText("en revisión");
    await shot(page, `indice-lineas-${theme}`);
    expect(errors, "sin errores de página").toEqual([]);
    await context.close();
  });
}
