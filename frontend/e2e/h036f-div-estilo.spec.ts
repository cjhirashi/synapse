// H-036f: un `<div style="…">` del cuerpo se dibuja como caja en Lectura (no como texto); el estilo peligroso se descarta.
import { expect, newSession, test, waitForSynced, waitForVaults } from "./fixtures";

for (const theme of ["dark", "light"] as const) {
  test(`H-036f: div con estilo en Lectura (${theme})`, async ({ browser, seeded }) => {
    const context = await newSession(browser, seeded, { theme, size: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/vaults/${seeded.vaults[0].id}`);
    await waitForVaults(page, seeded.vaults.length);
    await waitForSynced(page);
    const show = page.getByRole("button", { name: "Mostrar la barra de notas" });
    if (await show.isVisible()) await show.click();
    const row = page.getByRole("tree", { name: "Notas" }).getByRole("treeitem", { name: "Bienvenida" });
    await row.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    await page.getByRole("button", { name: "Código", exact: true }).click();
    await page.locator(".cm-content").click();
    await page.keyboard.press("Control+End");
    // `insertText` evita el cierre automático de comillas y paréntesis del editor de código.
    const added =
      '\n\n## Color\n\n<div style="width:120px;height:48px;border-radius:10px;background:#1f9bb8"></div>\n\n'
      + '<div style="position:fixed;top:0;left:0;width:30px;height:30px;background:url(https://x.test/a.png)"></div>\n\n- **Nombre:** Cian\n';
    await page.keyboard.insertText(added);
    await page.getByRole("button", { name: "Leer", exact: true }).click();
    await waitForSynced(page);
    const reading = page.locator('.milkdown-view[data-mode="read"] .ProseMirror');
    const boxes = reading.locator(".md-html > div");
    await expect(boxes).toHaveCount(2);
    const swatch = boxes.first();
    await expect(swatch).toHaveCSS("background-color", "rgb(31, 155, 184)");
    await expect(swatch).toHaveCSS("width", "120px");
    await expect(swatch).toHaveCSS("height", "48px");
    await expect(swatch).toHaveCSS("border-top-left-radius", "10px");
    await expect(reading).not.toContainText('style="width:120px');
    // El segundo no puede salirse de su sitio ni pedir recursos: queda solo el tamaño.
    const risky = boxes.nth(1);
    await expect(risky).toHaveCSS("position", "static");
    await expect(risky).toHaveCSS("background-image", "none");
    await expect(risky).toHaveAttribute("style", "width: 30px; height: 30px");
    await swatch.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${process.env.VISUAL_OUT_DIR ?? "/tmp/s9/e2e"}/h036f-div-estilo-${theme}.png` });

    // La nota queda como estaba: se quita lo añadido.
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    await page.getByRole("button", { name: "Código", exact: true }).click();
    await page.locator(".cm-content").click();
    await page.keyboard.press("Control+End");
    for (let i = 0; i < added.length; i++) await page.keyboard.press("Backspace");
    await page.getByRole("button", { name: "Leer", exact: true }).click();
    await expect(reading.locator(".md-html")).toHaveCount(0);
    await expect(reading).not.toContainText("Cian");
    await waitForSynced(page);
    expect(errors, "sin errores de página").toEqual([]);
    await context.close();
  });
}
