// H-031: INDICES automáticos de carpeta (árbol sin INDICE, apertura desde el nombre de la carpeta, cuerpo
// generado, descripción editable, columnas opcionales recordadas) en navegador real a 1280 y 390 px.
import type { Page } from "@playwright/test";
import { expect, MOBILE, openWorkspace, shot, test, waitForSynced } from "./fixtures";

const tree = (page: Page) => page.getByRole("tree", { name: "Notas" });

async function showSidebar(page: Page) {
  const show = page.getByRole("button", { name: "Mostrar la barra de notas" });
  if (await show.isVisible()) await show.click();
  await expect(page.getByRole("complementary", { name: "Notas de la bóveda" })).toBeVisible();
}

for (const { label, size } of [{ label: "1280", size: { width: 1280, height: 900 } }, { label: "390", size: MOBILE }]) {
  test(`H-031: INDICES de carpeta a ${label} px`, async ({ browser, seeded }) => {
    const { context, page } = await openWorkspace(browser, seeded, { theme: "dark", size });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 150)));
    await showSidebar(page);

    // 1. El INDICE existe en cada carpeta pero no es una fila del árbol.
    await expect(tree(page).getByRole("treeitem", { name: /INDICE/ })).toHaveCount(0);
    await waitForSynced(page);

    // 2. El nombre de la carpeta abre su INDICE: cuerpo generado con sus subcarpetas y documentos enlazados.
    await tree(page).getByRole("treeitem", { name: "Guías", exact: true }).click();
    const view = page.getByRole("region", { name: "Índice de Guías" });
    await expect(view).toBeVisible();
    await expect(view.getByRole("heading", { name: "Guías", level: 1 })).toBeVisible();
    await expect(view.getByRole("heading", { name: "Subcarpetas" })).toBeVisible();
    await expect(view.getByRole("heading", { name: "Documentos" })).toBeVisible();
    await expect(view.getByRole("table").first()).toContainText("Diseño");
    await expect(view.getByRole("table").last()).toContainText("Notas rápidas");
    await expect(view.getByRole("columnheader", { name: "Descripción" }).first()).toBeVisible();
    await shot(page, `h031-${label}-1-indice`);

    // 3. Solo se edita la descripción, y se conserva tras recargar.
    const text = `Guías de diseño ${label}`;
    await view.getByLabel("Descripción", { exact: true }).fill(text);
    await view.getByRole("button", { name: "Guardar descripción" }).click();
    await expect(view.getByRole("button", { name: "Guardar descripción" })).toBeDisabled();
    await waitForSynced(page);
    await page.reload();
    await waitForSynced(page);
    await showSidebar(page);
    await tree(page).getByRole("treeitem", { name: "Guías", exact: true }).click();
    await expect(page.getByRole("region", { name: "Índice de Guías" }).getByLabel("Descripción", { exact: true })).toHaveValue(text);

    // 4. El INDICE de la carpeta padre muestra la descripción en su fila de subcarpeta.
    await page.getByRole("region", { name: "Índice de Guías" }).getByRole("link", { name: "Diseño" }).first().click();
    const design = page.getByRole("region", { name: "Índice de Diseño" });
    await expect(design).toBeVisible();
    await expect(design.getByRole("heading", { name: "Navegación" })).toBeVisible();
    await design.getByRole("link", { name: "Guías" }).click(); // vuelve por la navegación al INDICE padre
    await expect(page.getByRole("region", { name: "Índice de Guías" })).toBeVisible();

    // 5. Un documento enlazado desde el INDICE se abre en el editor.
    await page.getByRole("region", { name: "Índice de Guías" }).getByRole("link", { name: "Notas rápidas" }).click();
    await expect(page.getByRole("heading", { name: "Notas rápidas", level: 2 })).toBeVisible();

    // 6. «Nueva carpeta» crea la carpeta con su INDICE, sin nota de relleno.
    await showSidebar(page);
    const folder = `Carpeta H031 ${label}`;
    await page.getByRole("button", { name: "Nueva carpeta" }).click();
    await page.getByRole("textbox", { name: "Nombre de la carpeta" }).fill(folder);
    await page.getByRole("button", { name: "Crear carpeta" }).click();
    await expect(page.getByRole("region", { name: `Índice de ${folder}` })).toBeVisible();
    await expect(page.getByRole("region", { name: `Índice de ${folder}` }).getByText("Sin documentos.")).toBeVisible();
    await showSidebar(page);
    await expect(tree(page).getByRole("treeitem", { name: folder, exact: true })).toBeVisible();
    await expect(tree(page).getByRole("treeitem", { name: /Sin título/ })).toHaveCount(0);
    await waitForSynced(page);
    await expect(page.getByText(/cambios? rechazados?/), "sin rechazos del push").toHaveCount(0);
    await shot(page, `h031-${label}-2-carpeta-nueva`);

    expect(errors, "sin errores de consola").toEqual([]);
    await context.close();
  });
}
