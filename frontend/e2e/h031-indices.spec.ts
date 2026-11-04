// H-031: INDICES automáticos de carpeta (árbol sin INDICE, apertura desde el nombre de la carpeta, cuerpo
// generado, descripción editable, columnas opcionales recordadas) en navegador real a 1280 y 390 px.
import type { Page } from "@playwright/test";
import { expect, MOBILE, newSession, shot, test, waitForSynced, waitForVaults, type Seeded, type Size } from "./fixtures";

const tree = (page: Page) => page.getByRole("tree", { name: "Notas" });

async function showSidebar(page: Page) {
  const show = page.getByRole("button", { name: "Mostrar la barra de notas" });
  if (await show.isVisible()) await show.click();
  await expect(page.getByRole("complementary", { name: "Notas de la bóveda" })).toBeVisible();
}

// A ≤ 640 px la barra flota sobre el contenido (Escape la cierra); en escritorio queda anclada.
async function hideSidebar(page: Page, size: Size) {
  if (size.width > 640) return;
  if (await page.getByRole("button", { name: "Ocultar la barra de notas" }).first().isVisible()) await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Mostrar la barra de notas" }).first()).toBeVisible();
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
  test(`H-031: INDICES de carpeta a ${label} px`, async ({ browser, content }) => {
    const { context, page } = await workspace(browser, content, size);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 150)));
    await showSidebar(page);
    const index = (name: string) => page.getByRole("region", { name: `Índice de ${name}` });

    // 1. El INDICE existe en cada carpeta pero no es una fila del árbol.
    await expect(tree(page).getByRole("treeitem", { name: /INDICE/ })).toHaveCount(0);

    // 2. El nombre de la carpeta abre su INDICE (la app lo crea al tener la réplica al día): cuerpo generado.
    await expect(async () => {
      await showSidebar(page);
      await tree(page).getByRole("treeitem", { name: "Propiedades", exact: true }).click();
      await expect(index("Propiedades")).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    const view = index("Propiedades");
    await expect(view.getByRole("heading", { name: "Propiedades", level: 1 })).toBeVisible();
    await expect(view.getByRole("heading", { name: "Subcarpetas" })).toBeVisible();
    await expect(view.getByRole("heading", { name: "Documentos" })).toBeVisible();
    // Subcarpetas y Documentos son listas, no tablas.
    await expect(view.getByRole("table")).toHaveCount(0);
    const documents = view.getByRole("listitem");
    await expect(documents.filter({ hasText: "Tipos de propiedad" })).toHaveCount(1);
    await expect(documents.filter({ hasText: "Doce propiedades" })).toHaveCount(1);
    await shot(page, `h031-${label}-1-indice`);
    // La carpeta de su INDICE abierto queda seleccionada en el árbol, como una nota abierta.
    await showSidebar(page);
    await expect(tree(page).getByRole("treeitem", { name: "Propiedades", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(tree(page).getByRole("treeitem", { name: "Mermaid", exact: true })).toHaveAttribute("aria-selected", "false");
    await shot(page, `h031-${label}-1b-carpeta-seleccionada`);
    await hideSidebar(page, size);

    // 3. Solo se edita la descripción, y se conserva tras recargar.
    const text = `Propiedades de ejemplo ${label}`;
    await view.getByLabel("Descripción", { exact: true }).fill(text);
    await view.getByRole("button", { name: "Guardar descripción" }).click();
    await expect(view.getByRole("button", { name: "Guardar descripción" })).toBeDisabled();
    await waitForSynced(page);
    await page.reload();
    await waitForSynced(page);
    await expect(async () => {
      await showSidebar(page);
      await tree(page).getByRole("treeitem", { name: "Propiedades", exact: true }).click();
      await expect(index("Propiedades").getByLabel("Descripción", { exact: true })).toHaveValue(text, { timeout: 2000 });
    }).toPass({ timeout: 30_000 });

    // 4. «Nueva carpeta» (con Propiedades activa) crea la subcarpeta con su INDICE, sin nota de relleno.
    const sub = `Sub H031 ${label}`;
    await showSidebar(page);
    // A ≤ 640 px el bloque de creación es un disclosure («Crear…»).
    if (size.width <= 640) await page.getByRole("button", { name: "Crear…" }).click();
    await page.getByRole("button", { name: "Nueva carpeta" }).click();
    await page.getByRole("textbox", { name: "Nombre de la carpeta" }).fill(sub);
    await page.getByRole("button", { name: "Crear carpeta" }).click();
    await expect(index(sub)).toBeVisible();
    await expect(index(sub).getByText("Sin documentos.")).toBeVisible();
    await expect(index(sub).getByRole("heading", { name: "Navegación" })).toBeVisible();
    await showSidebar(page);
    await expect(tree(page).getByRole("treeitem", { name: /Sin título/ })).toHaveCount(0);
    await shot(page, `h031-${label}-2-subcarpeta`);

    // 5. La navegación al INDICE padre y el enlace a la subcarpeta funcionan en ambos sentidos.
    await hideSidebar(page, size);
    await index(sub).getByText("Propiedades", { exact: true }).first().click();
    await expect(index("Propiedades")).toBeVisible();
    await expect(index("Propiedades").getByRole("listitem").filter({ hasText: sub })).toHaveCount(1);

    // 6. Un documento enlazado desde el INDICE se abre en el editor.
    await hideSidebar(page, size);
    await index("Propiedades").getByText("Tipos de propiedad", { exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "Tipos de propiedad", level: 2 })).toBeVisible();

    await waitForSynced(page);
    await expect(page.getByText(/cambios? rechazados?/), "sin rechazos del push").toHaveCount(0);
    expect(errors, "sin errores de consola").toEqual([]);
    await context.close();
  });
}
