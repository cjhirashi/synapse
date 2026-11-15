// La barra de formato del editor va en una sola fila con scroll horizontal, también en móvil.
import { expect, MOBILE, newSession, shot, test, waitForSynced, waitForVaults } from "./fixtures";

for (const [label, size] of [["movil", MOBILE], ["escritorio", { width: 1280, height: 900 }]] as const) {
  test(`barra de formato en una sola fila (${label})`, async ({ browser, seeded }) => {
    const context = await newSession(browser, seeded, { theme: "dark", size });
    const page = await context.newPage();
    await page.goto(`/vaults/${seeded.vaults[0].id}`);
    await waitForVaults(page, seeded.vaults.length);
    await waitForSynced(page);
    const show = page.getByRole("button", { name: "Mostrar la barra de notas" });
    if (await show.isVisible()) await show.click();
    // A 390 px la barra de notas se cierra al abrir la nota: un solo clic.
    await page.getByRole("tree", { name: "Notas" }).getByRole("treeitem", { name: "Bienvenida", exact: true }).click();
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    const row = page.locator(".note-editor-row-3");
    await expect(row).toBeVisible();
    const box = (await row.boundingBox())!;
    expect(box.height, "una sola fila").toBeLessThan(60);
    const tops = await row.locator("button").evaluateAll((buttons) => new Set(buttons.map((b) => Math.round(b.getBoundingClientRect().top))).size);
    expect(tops, "todos los botones a la misma altura").toBe(1);
    const scrolls = await row.evaluate((el) => el.scrollWidth > el.clientWidth);
    if (label === "movil") expect(scrolls, "con scroll horizontal").toBe(true);
    await shot(page, `barra-una-fila-${label}`);
    await context.close();
  });
}
