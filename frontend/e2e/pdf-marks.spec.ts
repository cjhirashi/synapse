// Marcas de formato del documento (portada, índice, salto, alineación, columnas) y botón «Párrafo»: botones de la barra,
// efecto en el editor y Markdown guardado, en navegador real, en tema claro y oscuro.
import { expect, openNote, openWorkspace, shot, test, waitForSynced } from "./fixtures";

for (const theme of ["dark", "light"] as const) {
  test(`marcas de formato del PDF en el editor (${theme})`, async ({ browser, seeded }) => {
    const { context, page } = await openWorkspace(browser, seeded, { theme, size: { width: 1280, height: 900 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const show = page.getByRole("button", { name: "Mostrar la barra de notas" });
    if (await show.isVisible()) await show.click();
    await openNote(page, "Bienvenida");
    await expect(page.locator(".milkdown-view .ProseMirror")).toBeVisible();
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    const editor = page.locator(".milkdown-view .ProseMirror");
    // El cursor al final del último párrafo del documento (la plantilla de la nota trae primero encabezado y propiedades).
    await editor.locator("> p").last().click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type(`Texto del formato ${theme}`);
    await page.waitForTimeout(600);
    const mine = (tag: string) => editor.locator(tag, { hasText: `Texto del formato ${theme}` });

    // Párrafo: un encabezado vuelve a texto normal.
    await page.getByRole("button", { name: "Encabezado 2" }).click();
    await expect(mine("h2")).toHaveCount(1);
    await page.getByRole("button", { name: "Párrafo", exact: true }).click();
    await expect(mine("h2")).toHaveCount(0);
    await expect(mine("p")).toHaveCount(1);

    // Centrado, columnas y portada, anidados; después un índice y un salto de página.
    await page.getByRole("button", { name: "Centrar" }).click();
    await expect(editor.locator('div[align="center"]')).toHaveCount(1);
    await expect(editor.locator('div[align="center"]')).toHaveCSS("text-align", "center");
    await page.getByRole("button", { name: "2 columnas" }).click();
    await expect(editor.locator("div.cols-2")).toHaveCount(1);
    await expect(editor.locator("div.cols-2")).toHaveCSS("column-count", "2");
    await page.getByRole("button", { name: "4 columnas" }).click();
    await expect(editor.locator("div.cols-4")).toHaveCount(1);
    await expect(editor.locator("div.cols-2")).toHaveCount(0);
    await page.getByRole("button", { name: "Portada", exact: true }).click();
    await expect(editor.locator("section.pdf-portada")).toHaveCount(1);
    const indexBefore = await editor.locator('.pdf-mark[data-pdf-mark="indice"]').count();
    const breakBefore = await editor.locator('.pdf-mark[data-pdf-mark="salto"]').count();
    await page.getByRole("button", { name: "Índice", exact: true }).click();
    await page.getByRole("button", { name: "Salto de página" }).click();
    await expect(editor.locator('.pdf-mark[data-pdf-mark="indice"]')).toHaveCount(indexBefore + 1);
    await expect(editor.locator('.pdf-mark[data-pdf-mark="salto"]')).toHaveCount(breakBefore + 1);
    // Comentario de revisión: una ventana con el nombre de quien lo deja (la persona) y el día.
    await page.getByRole("button", { name: "Comentario", exact: true }).click();
    await expect(editor.locator("div.comentario")).toHaveCount(1);
    await expect(editor.locator("div.comentario .comentario-head")).toContainText(/\S/);
    await expect(editor.locator("div.comentario .comentario-fecha")).toHaveText(/\d{1,2} \w{3} \d{4}/);
    await expect(editor.locator("div.comentario")).toHaveCSS("border-top-style", "solid");
    await shot(page, `pdf-marcas-edicion-${theme}`);

    // El Markdown guardado lleva las etiquetas HTML.
    await page.getByRole("button", { name: "Código", exact: true }).click();
    const source = await page.locator(".cm-content").innerText();
    for (const tag of ['<div align="center">', '<div class="cols-4">', "<!-- pdf:portada -->", "<!-- /pdf:portada -->", "<!-- pdf:indice -->", "<!-- pdf:salto -->", '<div class="comentario" data-autor="usuario" data-fecha="']) expect(source).toContain(tag);
    await page.getByRole("button", { name: "Visual", exact: true }).click();

    // Quitar cada uno repitiendo el botón con el cursor dentro.
    await mine("p").click();
    await page.getByRole("button", { name: "Comentario", exact: true }).click();
    await expect(editor.locator("div.comentario")).toHaveCount(0);
    await page.getByRole("button", { name: "Portada", exact: true }).click();
    await expect(editor.locator("section.pdf-portada")).toHaveCount(0);
    await page.getByRole("button", { name: "4 columnas" }).click();
    await expect(editor.locator("div.cols-4")).toHaveCount(0);
    await page.getByRole("button", { name: "Alinear a la izquierda" }).click();
    await expect(editor.locator('div[align="center"]')).toHaveCount(0);

    // Lectura: el índice y el salto de página se ven con su mensajito (sin entrar a editar) y el comentario como ventana gris.
    await page.getByRole("button", { name: "Comentario", exact: true }).click();
    await page.getByRole("button", { name: "Leer", exact: true }).click().catch(() => undefined);
    await waitForSynced(page);
    const reading = page.locator('.milkdown-view[data-mode="read"] .ProseMirror');
    await expect(reading.locator('.pdf-mark[data-pdf-mark="indice"]').first()).toBeVisible();
    await expect(reading.locator('.pdf-mark[data-pdf-mark="salto"]').first()).toBeVisible();
    const before = (selector: string) => reading.locator(selector).first().evaluate((el) => getComputedStyle(el, "::before").content);
    expect(await before('.pdf-mark[data-pdf-mark="indice"]')).toContain("Índice del PDF · aquí se arma el índice");
    expect(await before('.pdf-mark[data-pdf-mark="salto"]')).toContain("Salto de página · lo que sigue empieza en hoja nueva");
    await expect(reading.locator("div.comentario")).toHaveCount(1);
    await expect(reading.locator("div.comentario .comentario-head")).toBeVisible();
    await shot(page, `pdf-marcas-lectura-${theme}`);

    // La nota queda como estaba: se quita el comentario que se dejó para leerlo.
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    await editor.locator("div.comentario .comentario-body").click();
    await page.getByRole("button", { name: "Comentario", exact: true }).click();
    await expect(editor.locator("div.comentario")).toHaveCount(0);
    await page.getByRole("button", { name: "Leer", exact: true }).click(); // al salir de la edición se guarda
    await waitForSynced(page);
    await expect(page.locator('.milkdown-view[data-mode="read"] .ProseMirror div.comentario')).toHaveCount(0);
    expect(errors, "sin errores de página").toEqual([]);
    await context.close();
  });
}
