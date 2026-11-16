// H-036h: `<div class="cols-2">` con celdas `<div class="col">`: cada celda es una columna y su Markdown se queda dentro de ella; el texto guardado no cambia.
import { expect, newSession, test, waitForSynced, waitForVaults } from "./fixtures";

for (const [name, size] of [["escritorio", { width: 1280, height: 1000 }], ["movil", { width: 390, height: 1400 }]] as const) {
  test(`H-036h: columnas con celdas (${name})`, async ({ browser, seeded }) => {
    const context = await newSession(browser, seeded, { theme: "light", size, touch: name === "movil" });
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
    await expect(reading.getByRole("heading", { name: "Bienvenida" })).toBeVisible();
    const before = await reading.locator("div.col").count();
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    await page.getByRole("button", { name: "Código", exact: true }).click();
    await page.locator(".cm-content").click();
    await page.keyboard.press("Control+End");
    const added =
      '\n\n<div class="cols-2">\n\n<div class="col">\n\n### Izquierda\n\nTexto de la **primera** columna.\n\n- punto A\n- punto B\n\n</div>\n\n'
      + '<div class="col">\n\n### Derecha\n\nTexto de la segunda columna, bastante mas largo para que ocupe varias lineas dentro de su celda y se vea que no pasa a la vecina.\n\n</div>\n\n</div>\n';
    await page.keyboard.insertText(added);
    await page.getByRole("button", { name: "Leer", exact: true }).click();
    await waitForSynced(page);
    const all = reading.locator("div.cols-cells > div.col");
    await expect(all).toHaveCount(before + 2);
    // Las nuestras son las dos últimas; lo de una corrida anterior no cuenta.
    const mine = [all.nth(before), all.nth(before + 1)];
    const [a, b] = await Promise.all([mine[0].boundingBox(), mine[1].boundingBox()]);
    if (name === "escritorio") {
      expect(Math.abs(a!.y - b!.y)).toBeLessThan(2); // misma altura de arranque: lado a lado
      expect(b!.x).toBeGreaterThan(a!.x + a!.width - 1);
      expect(Math.abs(a!.width - b!.width)).toBeLessThan(2); // columnas iguales
    } else {
      expect(b!.y).toBeGreaterThan(a!.y + a!.height - 2); // en celular se apilan
      expect(Math.abs(a!.x - b!.x)).toBeLessThan(2);
    }
    await expect(mine[0].locator("h3")).toHaveText("Izquierda"); // el Markdown de dentro se interpreta y queda en su celda
    await expect(mine[0].locator("li")).toHaveCount(2);
    await expect(mine[1].locator("h3")).toHaveText("Derecha");
    await expect(mine[0].locator("strong")).toHaveText("primera");
    await page.screenshot({ path: `${process.env.VISUAL_OUT_DIR ?? "/tmp/s9/e2e"}/h036h-columnas-${name}.png` });

    // Ida y vuelta: entrar a edición Visual y volver a Código no cambia las etiquetas guardadas.
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    await page.getByRole("button", { name: "Visual", exact: true }).click();
    await expect(page.locator(".milkdown-view .ProseMirror div.cols-cells > div.col")).toHaveCount(before + 2);
    await page.getByRole("button", { name: "Código", exact: true }).click();
    const source = await page.locator(".cm-content").innerText();
    expect(source.match(/<div class="col">/g)).toHaveLength(before + 2);
    expect(source).toContain('<div class="cols-2">');

    // La nota queda como estaba.
    await page.locator(".cm-content").click();
    await page.keyboard.press("Control+End");
    for (let i = 0; i < added.length; i++) await page.keyboard.press("Backspace");
    await page.getByRole("button", { name: "Leer", exact: true }).click();
    await expect(reading.locator("div.col")).toHaveCount(before);
    await waitForSynced(page);
    expect(errors, "sin errores de página").toEqual([]);
    await context.close();
  });
}
