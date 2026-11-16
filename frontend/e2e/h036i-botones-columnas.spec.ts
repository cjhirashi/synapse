// H-036i: los botones de 2, 3 y 4 columnas crean las columnas con una celda `col` por columna; cambiar el número no pierde contenido y repetirlo las quita.
import { expect, newSession, test, waitForSynced, waitForVaults } from "./fixtures";

test("H-036i: botones de columnas con celdas", async ({ browser, seeded }) => {
  const context = await newSession(browser, seeded, { theme: "light", size: { width: 1280, height: 1000 } });
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
  await expect(page.locator('.milkdown-view[data-mode="read"] .ProseMirror').getByRole("heading", { name: "Bienvenida" })).toBeVisible();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByRole("button", { name: "Código", exact: true }).click();
  const original = await page.locator(".cm-content").innerText();
  // Un párrafo corto propio al final, para colocar el cursor sin depender de dónde termina una línea visual.
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText("\n\nUNO-TEXTO\n");
  await page.getByRole("button", { name: "Visual", exact: true }).click();
  const editor = page.locator(".milkdown-view .ProseMirror");
  await editor.locator("p", { hasText: "UNO-TEXTO" }).click();
  await page.keyboard.press("End");
  const cells = editor.locator("div.cols-cells > div.col");

  // 3 columnas: tres celdas, el texto en la primera y el cursor listo para escribir.
  await page.getByRole("button", { name: "3 columnas" }).click();
  await expect(editor.locator("div.cols-3.cols-cells")).toHaveCount(1);
  await expect(cells).toHaveCount(3);
  await expect(cells.nth(0)).not.toHaveCSS("padding-top", "0px"); // la etiqueta «Columna» tiene su espacio y no pisa el texto
  await expect(cells.nth(0)).toContainText("UNO-TEXTO");
  await expect(cells.nth(1)).toHaveText("");
  await page.keyboard.type(" mas");
  await expect(cells.nth(0)).toContainText("UNO-TEXTO mas");
  // Escribir dentro de la segunda y de la tercera celda.
  await cells.nth(1).locator("p").click();
  await page.keyboard.type("DOS-TEXTO");
  await cells.nth(2).locator("p").click();
  await page.keyboard.type("TRES-TEXTO");
  const [a, b, c] = await Promise.all([0, 1, 2].map((i) => cells.nth(i).boundingBox()));
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(2);
  expect(c!.x).toBeGreaterThan(b!.x);

  await editor.locator("div.cols-cells").screenshot({ path: `${process.env.VISUAL_OUT_DIR ?? "/tmp/s9/e2e"}/h036i-columnas-botones.png` });

  // De 3 a 2: sobra una celda y su texto se une a la última que queda; no se pierde nada.
  await page.getByRole("button", { name: "2 columnas" }).click();
  await expect(editor.locator("div.cols-2.cols-cells")).toHaveCount(1);
  await expect(cells).toHaveCount(2);
  await expect(cells.nth(0)).toContainText("UNO-TEXTO mas");
  await expect(cells.nth(1)).toContainText("DOS-TEXTO");
  await expect(cells.nth(1)).toContainText("TRES-TEXTO");

  // De 2 a 4: nacen dos celdas vacías.
  await page.getByRole("button", { name: "4 columnas" }).click();
  await expect(cells).toHaveCount(4);
  await expect(cells.nth(3)).toHaveText("");

  // El Markdown guardado lleva las celdas.
  await page.getByRole("button", { name: "Código", exact: true }).click();
  const source = await page.locator(".cm-content").innerText();
  expect(source.match(/<div class="col">/g)).toHaveLength(4);
  expect(source).toContain('<div class="cols-4">');
  await page.getByRole("button", { name: "Visual", exact: true }).click();

  // Otra vez 4 columnas con el cursor dentro: se quitan y el contenido queda en orden.
  await cells.nth(0).locator("p").first().click();
  await page.getByRole("button", { name: "4 columnas" }).click();
  await expect(editor.locator("div.cols-cells")).toHaveCount(0);
  const text = await editor.innerText();
  expect(text.indexOf("UNO-TEXTO mas")).toBeGreaterThan(-1);
  expect(text.indexOf("DOS-TEXTO")).toBeGreaterThan(text.indexOf("UNO-TEXTO mas"));
  expect(text.indexOf("TRES-TEXTO")).toBeGreaterThan(text.indexOf("DOS-TEXTO"));

  // La nota queda como estaba.
  await page.getByRole("button", { name: "Código", exact: true }).click();
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText(original);
  await page.getByRole("button", { name: "Leer", exact: true }).click();
  await waitForSynced(page);
  await expect(page.locator('.milkdown-view[data-mode="read"] .ProseMirror')).not.toContainText("UNO-TEXTO");
  expect(errors, "sin errores de página").toEqual([]);
  await context.close();
});
