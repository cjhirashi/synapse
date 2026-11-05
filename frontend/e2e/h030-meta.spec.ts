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

for (const { label, size } of [{ label: "1280", size: { width: 1280, height: 900 } }, { label: "390", size: MOBILE }]) {
  test(`H-030: sección META del árbol a ${label} px`, async ({ browser, content }) => {
    const { context, page } = await workspace(browser, content, size);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 150)));
    const meta = () => tree(page).getByRole("group", { name: "META" });

    // 1. Las cinco carpetas reservadas nacen con la bóveda (las siembra el servidor con su INDICE y llegan por la
    // réplica); BITACORA y PLANTILLAS sólo reservan el nombre, pero se muestran igual.
    await expect(async () => {
      await showSidebar(page);
      await expect(meta().getByRole("treeitem")).toHaveCount(5, { timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    expect(await meta().getByRole("treeitem").allTextContents()).toEqual(META_ORDER);

    // 3. META va ENCIMA de «Raíz» (posición real en pantalla) y es una sección propia con su rótulo.
    const metaBox = (await meta().boundingBox())!;
    const rootBox = (await tree(page).getByRole("treeitem", { name: "Raíz", exact: true }).boundingBox())!;
    expect(metaBox.y + metaBox.height, "META termina antes de «Raíz»").toBeLessThanOrEqual(rootBox.y);
    const head = tree(page).getByRole("treeitem", { name: "META", exact: true });
    await expect(head).toBeVisible();
    await expect(head).toHaveAttribute("aria-expanded", "true");
    await expect(tree(page).getByRole("treeitem").first()).toHaveText("META");
    await expect(tree(page).getByRole("treeitem").nth(1)).toHaveText("AG - SKILLS");

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

    // 7b. La cabecera pliega la sección entera (deja «Raíz» a la vista) y se recuerda al recargar.
    await showSidebar(page);
    await head.click();
    await expect(head).toHaveAttribute("aria-expanded", "false");
    await expect(meta()).toHaveCount(0);
    await shot(page, `h030meta-${label}-3-meta-plegada`);
    await head.click();
    await expect(head).toHaveAttribute("aria-expanded", "true");
    // AG - SKILLS sigue abierta (paso 7) y muestra la skill de cajón que el servidor siembra con la bóveda (H-030b).
    await expect(meta().getByRole("treeitem")).toHaveCount(6);

    // 8. Tras recargar, META sigue arriba (la agrupación sale de las rutas, no de un estado local). Se pliega antes
    // AG - SKILLS: la app recuerda las carpetas abiertas y sus hijos también son filas del grupo.
    await showSidebar(page);
    const skills = tree(page).getByRole("treeitem", { name: "AG - SKILLS", exact: true });
    if ((await skills.getAttribute("aria-expanded")) === "true") await skills.click();
    await showSidebar(page); // a ≤ 640 px abrir el INDICE cierra la barra flotante
    await expect(skills).toHaveAttribute("aria-expanded", "false");
    await hideSidebar(page, size);
    await page.reload();
    await waitForSynced(page);
    // Tras recargar, la nota abierta (el INDICE de AG - SKILLS) vuelve a desplegar su carpeta y se ve la skill de cajón
    // que el servidor siembra (H-030b): se comprueban las cinco reservadas sin contar ese hijo.
    await expect(async () => {
      await showSidebar(page);
      await expect(meta().getByRole("treeitem", { name: "PLANTILLAS", exact: true })).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    expect((await meta().getByRole("treeitem").allTextContents()).filter((name) => META_ORDER.includes(name))).toEqual(META_ORDER);

    await waitForSynced(page);
    await expect(page.getByText(/cambios? rechazados?/), "sin rechazos del push").toHaveCount(0);
    expect(errors, "sin errores de consola").toEqual([]);
    await context.close();
  });
}
