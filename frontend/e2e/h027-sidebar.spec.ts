// H-027: sidebar de documentos sin «Crear en»/aviso de «/», botones de icono, franja de título y menú ⋮ en móvil,
// en navegador real a 1280, 768 y 390 px, en tema claro y oscuro.
import type { Page } from "@playwright/test";
import { expect, MOBILE, newSession, shot, test, waitForSynced, waitForVaults, type Seeded, type Size, type Theme } from "./fixtures";

const tree = (page: Page) => page.getByRole("tree", { name: "Notas" });

async function showSidebar(page: Page) {
  const show = page.getByRole("button", { name: "Mostrar la barra de notas" });
  if (await show.isVisible()) await show.click();
  await expect(page.getByRole("complementary", { name: "Notas de la bóveda" })).toBeVisible();
}

async function workspace(browser: Parameters<typeof newSession>[0], seeded: Seeded, size: Size, theme: Theme) {
  const context = await newSession(browser, seeded, { theme, size });
  const page = await context.newPage();
  await page.goto(`/vaults/${seeded.vaults[0].id}`);
  await waitForVaults(page, seeded.vaults.length);
  await waitForSynced(page);
  await showSidebar(page);
  return { context, page };
}

const CASES: Array<{ label: string; size: Size; theme: Theme }> = [
  { label: "1280-dark", size: { width: 1280, height: 900 }, theme: "dark" },
  { label: "1280-light", size: { width: 1280, height: 900 }, theme: "light" },
  { label: "768-dark", size: { width: 768, height: 1024 }, theme: "dark" },
  { label: "390-dark", size: MOBILE, theme: "dark" },
  { label: "390-light", size: MOBILE, theme: "light" },
];

for (const { label, size, theme } of CASES) {
  test(`H-027: sidebar de documentos a ${label}`, async ({ browser, buzon: seeded }) => {
    const { context, page } = await workspace(browser, seeded, size, theme);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    const side = page.getByRole("complementary", { name: "Notas de la bóveda" });
    // (a) sin «Crear en…» ni el aviso de «/»
    await expect(side.getByText(/Crear en/)).toHaveCount(0);
    await expect(side.getByText(/subcarpeta/i)).toHaveCount(0);

    // (b) botones de icono, en una línea y centrados
    const newNote = side.getByRole("button", { name: /^Nueva nota en/ });
    const newFolder = side.getByRole("button", { name: /^Nueva carpeta en/ });
    await expect(newNote).toBeVisible();
    await expect(newFolder).toBeVisible();
    await expect(newNote).toHaveText("");
    await expect(newFolder).toHaveText("");
    const a = (await newNote.boundingBox())!;
    const b = (await newFolder.boundingBox())!;
    expect(Math.abs(a.y - b.y)).toBeLessThan(2);
    const s = (await side.boundingBox())!;
    const centre = (a.x + (b.x + b.width)) / 2;
    expect(Math.abs(centre - (s.x + s.width / 2))).toBeLessThan(24);

    // (c) franja con el nombre de la bóveda, fuera de la sidebar y sobre ambos paneles
    const title = page.locator(".vault-workspace-titlebar .vault-workspace-title");
    await expect(title).toHaveText(seeded.vaults[0].name);
    const t = (await title.boundingBox())!;
    expect(t.y + t.height).toBeLessThanOrEqual(s.y + 2);
    await expect(side.getByRole("heading", { name: seeded.vaults[0].name })).toHaveCount(0);
    await shot(page, `h027-${label}-1-sidebar`);

    // (d) menú ⋮: Renombrar y Borrar no cierran la sidebar
    const item = tree(page).getByRole("treeitem", { name: "Ideas", exact: true });
    await item.hover();
    await page.getByRole("button", { name: "Acciones de Ideas" }).click();
    await shot(page, `h027-${label}-2-menu`);
    await page.getByRole("menuitem", { name: "Renombrar" }).click();
    await expect(side).toBeVisible();
    const input = page.getByLabel(/Nuevo nombre de la/);
    await expect(input).toBeVisible();
    await input.fill(`Ideas ${label}`);
    await input.press("Enter");
    await expect(side).toBeVisible();
    await expect(tree(page).getByRole("treeitem", { name: `Ideas ${label}`, exact: true })).toBeVisible();

    await tree(page).getByRole("treeitem", { name: `Ideas ${label}`, exact: true }).hover();
    await page.getByRole("button", { name: `Acciones de Ideas ${label}` }).click();
    await page.getByRole("menuitem", { name: "Borrar" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(side).toBeVisible();
    const d = (await dialog.boundingBox())!;
    expect(Math.abs(d.x + d.width / 2 - size.width / 2)).toBeLessThan(40);
    await expect(side.getByRole("alertdialog")).toHaveCount(0);
    await shot(page, `h027-${label}-3-borrar`);
    await dialog.getByRole("button", { name: /Cancelar/ }).click();
    await expect(dialog).toHaveCount(0);
    await expect(side).toBeVisible();
    await expect(tree(page).getByRole("treeitem", { name: `Ideas ${label}`, exact: true })).toBeVisible();

    expect(errors).toEqual([]);
    await context.close();
  });
}
