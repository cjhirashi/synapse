// H-036b: tarjetas de Portada e Índice del PDF en la vista de plantilla (fondo, imagen principal, estilos propios o los del documento, miniatura) en navegador real,
// en tema claro y oscuro.
import type { Page } from "@playwright/test";
import { expect, newSession, shot, test, waitForSynced, waitForVaults, type Seeded } from "./fixtures";

const tree = (page: Page) => page.getByRole("tree", { name: "Notas" });

async function showSidebar(page: Page) {
  const show = page.getByRole("button", { name: "Mostrar la barra de notas" });
  if (await show.isVisible()) await show.click();
  await expect(page.getByRole("complementary", { name: "Notas de la bóveda" })).toBeVisible();
}

for (const theme of ["dark", "light"] as const) {
  test(`H-036b: portada e índice de la plantilla (${theme})`, async ({ browser, content }: { browser: Parameters<typeof newSession>[0]; content: Seeded }) => {
    const context = await newSession(browser, content, { theme, size: { width: 1280, height: 1100 } });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/vaults/${content.vaults[0].id}`);
    await waitForVaults(page, content.vaults.length);
    await waitForSynced(page);
    await showSidebar(page);
    await expect(async () => {
      await showSidebar(page);
      await expect(tree(page).getByRole("treeitem", { name: "PLANTILLAS", exact: true })).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    await tree(page).getByRole("treeitem", { name: "PLANTILLAS", exact: true }).click();
    await showSidebar(page);
    await page.getByRole("button", { name: /^Nueva plantilla/ }).click();
    await page.getByLabel("Nombre de la plantilla nueva").fill(`Hojas ${theme}`);
    await page.getByRole("button", { name: "Crear plantilla" }).click();
    await expect(page.getByRole("heading", { name: `Plantilla hojas-${theme}` })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("checkbox", { name: /Permitir descargar los documentos de esta plantilla como PDF/ }).check();

    const cover = page.getByRole("group", { name: "Portada", exact: true });
    const index = page.getByRole("group", { name: "Índice", exact: true });
    await cover.scrollIntoViewIfNeeded();
    await expect(cover.getByRole("heading", { name: "Fondo" })).toBeVisible();

    // Sin imagen propia el fondo es el color; el interruptor de la imagen de las páginas está bloqueado mientras no haya una (y avisa por qué).
    const sheet = page.getByTestId("pdf-sheet-portada");
    await cover.getByLabel("Portada: color de fondo").fill("#224488");
    await expect(sheet).toHaveCSS("background-color", "rgb(34, 68, 136)");
    const borrow = cover.getByRole("checkbox", { name: "Portada: usar la imagen de fondo de las páginas" });
    await expect(borrow).toBeDisabled();
    await expect(cover.getByText("Primero elige la imagen de fondo en «Encabezado de página».")).toBeVisible();

    // Sin personalizar los campos muestran los estilos del documento (H1 de 18 pt) y están bloqueados; al encender parten de ellos y se pueden cambiar.
    const personalize = cover.getByRole("checkbox", { name: "Portada: personalizar tipografía y color" });
    await expect(personalize).not.toBeChecked();
    await expect(cover.getByLabel("Portada: encabezados: tamaño")).toBeDisabled();
    await expect(cover.getByLabel("Portada: encabezados: tamaño")).toHaveValue("18");
    await personalize.check();
    await expect(cover.getByLabel("Portada: encabezados: tamaño")).toBeEnabled();
    await cover.getByLabel("Portada: encabezados: tamaño").fill("36");
    await cover.getByLabel("Portada: encabezados: color").fill("#ffffff");
    await expect(page.getByTestId("pdf-sheet-heading").first()).toHaveCSS("color", "rgb(255, 255, 255)");

    // El índice: título, niveles y su propia miniatura con las entradas.
    await index.scrollIntoViewIfNeeded();
    await index.getByLabel("Índice: título").fill("Contenido");
    await index.getByLabel("Índice: niveles").fill("2");
    await expect(page.getByTestId("pdf-sheet-indice").getByText("Contenido")).toBeVisible();
    await expect(page.getByTestId("pdf-sheet-indice").getByText("Componentes")).toHaveCount(0); // el nivel 3 no entra con 2 niveles
    await index.getByRole("checkbox", { name: "Índice: personalizar tipografía y color" }).check();
    await shot(page, `h036b-hojas-${theme}`);

    await page.getByRole("button", { name: "Guardar plantilla" }).click();
    await expect(page.getByRole("button", { name: "Guardar plantilla" })).toBeDisabled({ timeout: 15_000 });
    await waitForSynced(page);
    expect(errors, "sin errores de página").toEqual([]);
    await context.close();
  });
}
