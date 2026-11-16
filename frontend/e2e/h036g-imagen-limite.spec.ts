// H-036g: `![texto|50%|alto:100](enlace)` limita el ancho (porcentaje del texto) y el alto (px) de la imagen en Lectura, sin agrandarla ni deformarla.
import { expect, newSession, test, waitForSynced, waitForVaults } from "./fixtures";

for (const theme of ["dark", "light"] as const) {
  test(`H-036g: imagen con límite de tamaño (${theme})`, async ({ browser, seeded }) => {
    const context = await newSession(browser, seeded, { theme, size: { width: 1280, height: 1100 } });
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
    const reading = page.locator('.milkdown-view[data-mode="read"] .ProseMirror');
    await expect(reading.getByRole("heading", { name: "Bienvenida" })).toBeVisible(); // el documento ya cargó
    const before = await reading.locator(".md-img").count(); // lo que haya de una corrida anterior no cuenta
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    await page.getByRole("button", { name: "Código", exact: true }).click();
    await page.locator(".cm-content").click();
    await page.keyboard.press("Control+End");
    const image = new URL("/icons/icon-512.png", page.url()).href; // 512 x 512 px, la sirve la propia app
    const added = `\n\n![sin limite](${image})\n\n![por alto|alto:100](${image})\n\n![por ancho|30%](${image})\n\n![ambos|20%|alto:400](${image})\n`;
    await page.keyboard.insertText(added);
    await page.getByRole("button", { name: "Leer", exact: true }).click();
    await waitForSynced(page);
    await expect(reading.locator(".md-img")).toHaveCount(before + 4);
    const size = async (alt: string) => {
      const img = reading.locator(`.md-img img[alt="${alt}"]`).last();
      await expect(img).toBeVisible();
      const [box, wrap, button] = await Promise.all([
        img.boundingBox(), img.locator("xpath=..").boundingBox(), img.locator("xpath=..").locator(".md-img-fullscreen").boundingBox(),
      ]);
      return { box: box!, wrap: wrap!, button: button! };
    };
    const free = await size("sin limite");
    const byHeight = await size("por alto");
    const byWidth = await size("por ancho");
    const both = await size("ambos");
    const column = await reading.evaluate((root) => (root.querySelector("p") as HTMLElement).getBoundingClientRect().width);

    expect(Math.round(byHeight.box.height)).toBe(100); // limitada por alto, y cuadrada: ancho = alto
    expect(Math.round(byHeight.box.width)).toBe(100);
    expect(Math.abs(byWidth.box.width - column * 0.3)).toBeLessThan(2); // el 30 % del texto
    expect(Math.round(byWidth.box.height)).toBe(Math.round(byWidth.box.width)); // sin deformar
    expect(Math.abs(both.box.width - column * 0.2)).toBeLessThan(2); // manda el límite más estricto
    expect(free.box.width).toBeGreaterThan(byWidth.box.width * 1.5); // sin marcas no se limita
    for (const { box, wrap, button } of [byHeight, byWidth, both]) {
      expect(Math.abs(wrap.width - box.width)).toBeLessThan(2); // el contenedor se ajusta a la imagen
      expect(Math.abs(button.x + button.width - (box.x + box.width))).toBeLessThan(14); // el botón de pantalla completa queda en la esquina de la imagen
    }
    await page.screenshot({ path: `${process.env.VISUAL_OUT_DIR ?? "/tmp/s9/e2e"}/h036g-imagen-limite-${theme}.png`, fullPage: false });

    // La nota queda como estaba.
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    await page.getByRole("button", { name: "Código", exact: true }).click();
    await page.locator(".cm-content").click();
    await page.keyboard.press("Control+End");
    for (let i = 0; i < added.length; i++) await page.keyboard.press("Backspace");
    await page.getByRole("button", { name: "Leer", exact: true }).click();
    await expect(reading.locator(".md-img")).toHaveCount(before);
    await waitForSynced(page);
    expect(errors, "sin errores de página").toEqual([]);
    await context.close();
  });
}
