// H-030b: BITACORA automática de solo lectura y PLANTILLAS (formulario, selector, plantilla en uso) en navegador real
// a 1280 y 390 px.
import type { Page } from "@playwright/test";
import { expect, MOBILE, newSession, shot, test, waitForSynced, waitForVaults, type Seeded, type Size } from "./fixtures";

const tree = (page: Page) => page.getByRole("tree", { name: "Notas" });
// El vault de prueba se comparte entre las dos pasadas (1280 y 390): cada una usa nombres propios.
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });

async function showSidebar(page: Page) {
  const show = page.getByRole("button", { name: "Mostrar la barra de notas" });
  if (await show.isVisible()) await show.click();
  await expect(page.getByRole("complementary", { name: "Notas de la bóveda" })).toBeVisible();
}

// A ≤ 640 px el formulario de creación está plegado tras «Crear…»: se abre solo si hace falta.
async function openCreate(page: Page) {
  const toggle = page.getByRole("button", { name: "Crear…" });
  if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
}

async function workspace(browser: Parameters<typeof newSession>[0], seeded: Seeded, size: Size) {
  const context = await newSession(browser, seeded, { theme: "dark", size });
  const page = await context.newPage();
  await page.goto(`/vaults/${seeded.vaults[0].id}`);
  await waitForVaults(page, seeded.vaults.length);
  await waitForSynced(page);
  await showSidebar(page);
  return { context, page };
}

for (const { label, size } of [{ label: "1280", size: { width: 1280, height: 900 } }, { label: "390", size: MOBILE }]) {
  test(`H-030b: bitácora automática y plantillas a ${label} px`, async ({ browser, content }) => {
    const { context, page } = await workspace(browser, content, size);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 150)));

    // 1. Crear una plantilla desde PLANTILLAS: el formulario pide el nombre y abre su vista de cuatro secciones.
    await expect(async () => {
      await showSidebar(page);
      await expect(tree(page).getByRole("treeitem", { name: "PLANTILLAS", exact: true })).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    await tree(page).getByRole("treeitem", { name: "PLANTILLAS", exact: true }).click();
    await showSidebar(page);
    await openCreate(page);
    await page.getByLabel("Nombre de la plantilla nueva").fill(`Acta ${label}`);
    await page.getByRole("button", { name: "Nueva plantilla" }).click();
    await expect(page.getByRole("heading", { name: `Plantilla acta-${label}` })).toBeVisible({ timeout: 15_000 });
    for (const legend of ["1. Dónde se usa", "2. Atributos opcionales", "3. Estilo", "4. Estructura base"]) {
      await expect(page.getByText(legend, { exact: true })).toBeVisible();
    }
    await page.getByRole("button", { name: "Añadir atributo" }).click();
    await page.getByLabel("Nombre del atributo 1").fill("cliente");
    await page.getByLabel("Valor inicial del atributo 1").fill("Acme");
    await page.getByLabel(/Markdown con el que nace/).fill("# Asistentes\n\n# Acuerdos\n");
    await shot(page, `h030b-${label}-1-plantilla`);
    await page.getByRole("button", { name: "Guardar plantilla" }).click();
    await expect(page.getByRole("button", { name: "Guardar plantilla" })).toBeDisabled({ timeout: 15_000 });
    await waitForSynced(page);

    // 2. Crear una nota desde la plantilla (carpeta raíz): el selector la ofrece y la nota nace con el cuerpo.
    await showSidebar(page);
    await tree(page).getByRole("treeitem", { name: "Raíz", exact: true }).click();
    await showSidebar(page);
    await openCreate(page);
    await page.getByRole("combobox", { name: "Plantilla" }).selectOption({ label: `Acta ${label}` });
    await page.getByLabel(/Título de la nota nueva/).fill(`Reunión del lunes ${label}`);
    await page.getByRole("button", { name: "Nueva nota" }).click();
    await expect(page.getByText("Acuerdos")).toBeVisible({ timeout: 15_000 });
    await waitForSynced(page);

    // 3. La plantilla en uso no se borra: el aviso explica por qué. (a 390 px la barra flotante se cierra al elegir la opción del menú: ahí lo cubren las pruebas unitarias)
    if (size.width > 640) {
      await showSidebar(page);
      await tree(page).getByRole("treeitem", { name: "PLANTILLAS", exact: true }).focus();
      const templateRow = tree(page).getByRole("treeitem", { name: `plantilla-acta-${label}`, exact: true });
      if (!(await templateRow.isVisible())) await tree(page).getByRole("treeitem", { name: "PLANTILLAS", exact: true }).click();
      await showSidebar(page);
      await page.getByRole("button", { name: `Acciones de plantilla-acta-${label}` }).click();
      await page.getByRole("menuitem", { name: /Borrar/ }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Borrar" }).click();
      await expect(page.getByText(/No se puede borrar, renombrar ni mover la plantilla/)).toBeVisible({ timeout: 15_000 });
      await shot(page, `h030b-${label}-2-plantilla-en-uso`);
    }

    // 4. El servidor registró los cambios: el documento del día aparece en BITACORA (réplica) y es de solo lectura.
    await expect(async () => {
      await showSidebar(page);
      await tree(page).getByRole("treeitem", { name: "BITACORA", exact: true }).click();
      await showSidebar(page);
      await expect(tree(page).getByRole("treeitem", { name: today().slice(0, 7), exact: true })).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 45_000 });
    await tree(page).getByRole("treeitem", { name: today().slice(0, 7), exact: true }).click();
    await showSidebar(page);
    await tree(page).getByRole("treeitem", { name: today(), exact: true }).click();
    await expect(page.getByText("Solo lectura · la escribe el servidor")).toBeVisible({ timeout: 15_000 });
    const view = page.locator(".bitacora-view");
    await expect(view.getByText(/creación/).first()).toBeVisible();
    await expect(view.getByText(`Reunión del lunes ${label}`).first()).toBeVisible();
    await expect(view.getByRole("textbox")).toHaveCount(0); // sin editor
    await showSidebar(page);
    await expect(page.getByRole("button", { name: `Acciones de ${today()}` })).toHaveCount(0);
    await shot(page, `h030b-${label}-3-bitacora`);

    await waitForSynced(page);
    await expect(page.getByText(/cambios? rechazados?/), "sin rechazos del push").toHaveCount(0);
    expect(errors, "sin errores de consola").toEqual([]);
    await context.close();
  });
}
