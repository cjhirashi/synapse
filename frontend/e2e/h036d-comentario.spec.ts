// H-036d: cabecera del comentario de revisión (foto a la izquierda; nombre arriba y «comentario · día» debajo) en celular y escritorio, tema claro y oscuro.
import { expect, newSession, test, waitForSynced, waitForVaults } from "./fixtures";

for (const [name, size] of [["movil", { width: 390, height: 900 }], ["escritorio", { width: 1280, height: 900 }]] as const) {
  for (const theme of ["dark", "light"] as const) {
    test(`H-036d: cabecera del comentario (${name}, ${theme})`, async ({ browser, seeded }) => {
      const context = await newSession(browser, seeded, { theme, size, touch: name === "movil" });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`/vaults/${seeded.vaults[0].id}`);
      await waitForVaults(page, seeded.vaults.length);
      await waitForSynced(page);
      // En celular la barra de notas está oculta: se abre con su botón, como lo haría la persona.
      const show = page.getByRole("button", { name: "Mostrar la barra de notas" });
      if (await show.isVisible()) await show.click();
      await expect(page.getByRole("complementary", { name: "Notas de la bóveda" })).toBeVisible();
      // Se abre con el teclado (en celular la barra se cierra al elegir la nota, así que no se espera su selección).
      const row = page.getByRole("tree", { name: "Notas" }).getByRole("treeitem", { name: "Bienvenida" });
      await row.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("button", { name: "Editar", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Editar", exact: true }).click();
      const editor = page.locator(".milkdown-view .ProseMirror");
      await editor.locator("> p").last().click();
      await page.keyboard.press("End");
      await page.keyboard.press("Enter");
      await page.getByRole("button", { name: "Comentario", exact: true }).click();
      const box = editor.locator("div.comentario");
      await expect(box).toHaveCount(1);
      await page.keyboard.type("La imagen de portada debe ir en esta parte con el título de portada");
      const author = box.locator(".comentario-autor"), kind = box.locator(".comentario-tipo"), date = box.locator(".comentario-fecha");
      const [a, k, d] = await Promise.all([author.boundingBox(), kind.boundingBox(), date.boundingBox()]);
      // Nombre arriba; «comentario» y la fecha debajo, en la misma fila y en ese orden.
      expect(k!.y).toBeGreaterThan(a!.y + a!.height - 2);
      expect(Math.abs(k!.y - d!.y)).toBeLessThan(3);
      expect(d!.x).toBeGreaterThan(k!.x + k!.width - 1);
      await box.screenshot({ path: `${process.env.VISUAL_OUT_DIR ?? "/tmp/s9/e2e"}/h036d-comentario-${name}-${theme}.png` });
      expect(errors, "sin errores de página").toEqual([]);
      await context.close();
    });
  }
}
