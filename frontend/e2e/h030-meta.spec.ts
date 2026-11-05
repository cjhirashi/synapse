// H-030: sección META del árbol (carpetas reservadas encima de «Raíz», sin ⋮, con descripción e INDICE)
// en navegador real a 1280 y 390 px.
import type { Page } from "@playwright/test";
import { expect, MOBILE, newSession, shot, test, waitForSynced, waitForVaults, type Seeded, type Size } from "./fixtures";

const tree = (page: Page) => page.getByRole("tree", { name: "Notas" });
const META_ORDER = ["AG - SKILLS", "AG - MENSAJES", "AG - AGENTES", "BITACORA", "PLANTILLAS"];

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

/** Crea `Carpeta/título` desde la raíz con «Nueva nota» (la carpeta nace con su INDICE). */
async function createInRoot(page: Page, title: string, size: Size) {
  await showSidebar(page);
  await tree(page).getByRole("treeitem", { name: "Raíz", exact: true }).click();
  // A ≤ 640 px el bloque de creación es un disclosure («Crear…»).
  const create = page.getByRole("button", { name: "Crear…" });
  if (size.width <= 640 && (await create.getAttribute("aria-expanded")) !== "true") await create.click();
  await page.getByLabel("Título de la nota nueva (opcional)").fill(title);
  await page.getByRole("button", { name: "Nueva nota" }).click();
  await waitForSynced(page);
}

for (const { label, size } of [{ label: "1280", size: { width: 1280, height: 900 } }, { label: "390", size: MOBILE }]) {
  test(`H-030: sección META del árbol a ${label} px`, async ({ browser, content }) => {
    const { context, page } = await workspace(browser, content, size);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 150)));
    const meta = () => tree(page).getByRole("group", { name: "META" });

    // 1. Las tres carpetas AG nacen con la bóveda (las siembra el servidor y llegan por la réplica).
    await expect(async () => {
      await showSidebar(page);
      await expect(meta().getByRole("treeitem")).toHaveCount(3, { timeout: 2000 });
    }).toPass({ timeout: 30_000 });

    // 2. BITACORA y PLANTILLAS sólo reservan el nombre: aparecen en cuanto existen.
    await createInRoot(page, "BITACORA/demo", size);
    await createInRoot(page, "PLANTILLAS/plantilla-demo", size);
    await showSidebar(page);
    await expect(meta().getByRole("treeitem")).toHaveCount(5);
    expect(await meta().getByRole("treeitem").allTextContents()).toEqual(META_ORDER);

    // 3. META va ENCIMA de «Raíz» (posición real en pantalla) y es una sección propia con su rótulo.
    const metaBox = (await meta().boundingBox())!;
    const rootBox = (await tree(page).getByRole("treeitem", { name: "Raíz", exact: true }).boundingBox())!;
    expect(metaBox.y + metaBox.height, "META termina antes de «Raíz»").toBeLessThanOrEqual(rootBox.y);
    await expect(tree(page).getByText("META", { exact: true })).toBeVisible();
    const first = tree(page).getByRole("treeitem").first();
    await expect(first).toHaveText("AG - SKILLS");

    // 4. No se repiten dentro de la raíz: cada nombre aparece una sola vez en todo el árbol.
    for (const name of META_ORDER) await expect(tree(page).getByRole("treeitem", { name, exact: true })).toHaveCount(1);

    // 5. Sin ⋮ en las reservadas (ni renombrar, ni mover, ni borrar); una carpeta común conserva el suyo.
    for (const name of META_ORDER) await expect(page.getByRole("button", { name: `Acciones de ${name}` })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Acciones de Propiedades" })).toHaveCount(1);
    await expect(tree(page).getByRole("treeitem", { name: "AG - SKILLS", exact: true })).toHaveAttribute("draggable", "false");
    await tree(page).getByRole("treeitem", { name: "AG - AGENTES", exact: true }).focus();
    await page.keyboard.press("F2");
    await expect(page.getByRole("textbox", { name: "Nuevo nombre de la carpeta" })).toHaveCount(0);
    await page.keyboard.press("Delete");
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    // 6. Cada carpeta muestra la descripción de su INDICE.
    await expect(meta().getByText(/Skills para los agentes/)).toBeVisible();
    await expect(meta().getByText(/Buzón entre agentes/)).toBeVisible();
    await expect(meta().getByText(/Registro de los agentes/)).toBeVisible();
    await shot(page, `h030meta-${label}-1-arbol`);

    // 7. El nombre de la carpeta reservada abre su INDICE.
    await expect(async () => {
      await showSidebar(page);
      await tree(page).getByRole("treeitem", { name: "AG - SKILLS", exact: true }).click();
      await expect(page.getByRole("region", { name: "Índice de AG - SKILLS" })).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    await showSidebar(page);
    await expect(tree(page).getByRole("treeitem", { name: "AG - SKILLS", exact: true })).toHaveAttribute("aria-selected", "true");
    await shot(page, `h030meta-${label}-2-indice-abierto`);

    // 8. Tras recargar, META sigue arriba (la agrupación sale de las rutas, no de un estado local). Se pliega antes
    // AG - SKILLS: la app recuerda las carpetas abiertas y sus hijos también son filas del grupo.
    await showSidebar(page);
    const skills = tree(page).getByRole("treeitem", { name: "AG - SKILLS", exact: true });
    if ((await skills.getAttribute("aria-expanded")) === "true") await skills.click();
    await expect(skills).toHaveAttribute("aria-expanded", "false");
    await hideSidebar(page, size);
    await page.reload();
    await waitForSynced(page);
    await expect(async () => {
      await showSidebar(page);
      await expect(meta().getByRole("treeitem")).toHaveCount(5, { timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    expect(await meta().getByRole("treeitem").allTextContents()).toEqual(META_ORDER);

    await waitForSynced(page);
    await expect(page.getByText(/cambios? rechazados?/), "sin rechazos del push").toHaveCount(0);
    expect(errors, "sin errores de consola").toEqual([]);
    await context.close();
  });
}
