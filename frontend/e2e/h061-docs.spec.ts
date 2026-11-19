// H-061: el botón «Documentación» del riel (justo encima de Usuario) abre el Manual de Operación dentro de la app,
// con sus campos de atributo resueltos, la lista de capítulos y el pie anterior/siguiente; en móvil la lista es flotante.
import type { Page } from "@playwright/test";
import { expect, MOBILE, newSession, shot, test, waitForSynced, waitForVaults, type Size, type Theme } from "./fixtures";

const rail = (page: Page) => page.getByRole("navigation", { name: "Bóvedas abiertas" });

const CASES: Array<{ label: string; size: Size; theme: Theme }> = [
  { label: "1280-light", size: { width: 1280, height: 900 }, theme: "light" },
  { label: "1280-dark", size: { width: 1280, height: 900 }, theme: "dark" },
  { label: "390-light", size: MOBILE, theme: "light" },
  { label: "390-dark", size: MOBILE, theme: "dark" },
];

for (const { label, size, theme } of CASES) {
  test(`H-061: Documentación a ${label}`, async ({ browser, buzon: seeded }) => {
    const context = await newSession(browser, seeded, { theme, size });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/vaults/${seeded.vaults[0].id}`);
    await waitForVaults(page, seeded.vaults.length);
    await waitForSynced(page);

    // El botón está justo encima de Usuario.
    const docs = rail(page).getByRole("link", { name: "Documentación" });
    const user = rail(page).getByRole("link", { name: /^Usuario:/ });
    await expect(docs).toBeVisible();
    const d = (await docs.boundingBox())!;
    const u = (await user.boundingBox())!;
    expect(d.y).toBeLessThan(u.y);
    expect(u.y - (d.y + d.height)).toBeLessThan(24);
    await shot(page, `h061-${label}-1-riel`);

    await docs.click();
    await expect(page).toHaveURL(/\/docs\/01-conceptos-y-recorrido$/);
    // Portada: el campo `{{atributo:programa}}` se resuelve; el texto de la llave no queda a la vista.
    const reader = page.locator(".docs-doc .milkdown-view");
    await expect(reader).toContainText("Manual de Operación - Synapse");
    await expect(reader).toContainText("Carlos Jiménez");
    await expect(reader).not.toContainText("{{atributo");
    await expect(page.locator(".docs-doc img[src]").first()).toBeVisible();
    await shot(page, `h061-${label}-2-capitulo`);

    if (size.width <= 640) {
      // En móvil la lista de capítulos es flotante: el botón del título la abre y elegir un capítulo la cierra.
      await page.getByRole("button", { name: "Mostrar la lista de capítulos" }).click();
      await expect(page.getByRole("tree", { name: "Capítulos" })).toBeVisible();
      await shot(page, `h061-${label}-3-lista`);
    }
    await page.getByRole("tree", { name: "Capítulos" }).getByRole("treeitem", { name: "03 - Bóvedas" }).click();
    await expect(page).toHaveURL(/\/docs\/03-bovedas$/);
    // Barra izquierda (capítulos) y derecha (índice), como en una bóveda; en móvil la derecha flota y empieza oculta.
    if (size.width > 1023) {
      const side = (await page.locator(".vault-workspace-side").boundingBox())!;
      const aside = page.getByRole("complementary", { name: "Índice del documento" });
      await expect(aside).toBeVisible();
      await expect(aside.getByRole("button", { name: "Paso a paso: crear una bóveda" })).toBeVisible();
      const doc = (await page.locator(".docs-doc").boundingBox())!;
      expect(side.x + side.width).toBeLessThanOrEqual(doc.x + 1);
      expect(doc.x + doc.width).toBeLessThanOrEqual((await aside.boundingBox())!.x + 1);
    }
    // Las capturas del capítulo son archivos públicos de Synapse: todas deben cargar (no una caja vacía).
    const images = page.locator(".docs-doc img[src]");
    await expect(images.first()).toBeVisible();
    const broken = await images.evaluateAll((list) =>
      Promise.all(
        (list as HTMLImageElement[]).map(async (img) => {
          img.loading = "eager";
          await img.decode().catch(() => undefined);
          return img.naturalWidth > 0 ? null : img.src;
        }),
      ),
    );
    expect(broken.filter(Boolean)).toEqual([]);
    await expect(page.getByRole("link", { name: /Siguiente/ })).toHaveAttribute("href", /\/docs\/04-/);
    await shot(page, `h061-${label}-4-capitulo-3`);

    expect(errors).toEqual([]);
    await context.close();
  });
}
