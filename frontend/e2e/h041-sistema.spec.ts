// H-041 E1: los documentos de sistema (la skill global y `plantilla-skill`) llevan candado, se abren de solo lectura y
// no ofrecen editar, mover, renombrar ni borrar. E2: una skill nueva se nombra `skill-…` sin acentos ni espacios aunque el
// usuario escriba «Gestión de variables». En navegador real a 1280 y 390 px.
import type { Page } from "@playwright/test";
import { expect, MOBILE, newSession, shot, test, waitForSynced, waitForVaults, type Seeded } from "./fixtures";

const tree = (page: Page) => page.getByRole("tree", { name: "Notas" });

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

async function workspace(browser: Parameters<typeof newSession>[0], seeded: Seeded, size: { width: number; height: number }) {
  const context = await newSession(browser, seeded, { theme: "dark", size });
  const page = await context.newPage();
  await page.goto(`/vaults/${seeded.vaults[0].id}`);
  await waitForVaults(page, seeded.vaults.length);
  await waitForSynced(page);
  await showSidebar(page);
  return { context, page };
}

// Abre la carpeta reservada (si aún no lo está) y espera a que la réplica traiga el documento de sistema.
async function openFolder(page: Page, folder: string, child: string) {
  await expect(async () => {
    await showSidebar(page);
    const row = tree(page).getByRole("treeitem", { name: folder, exact: true });
    if ((await row.getAttribute("aria-expanded")) !== "true") await row.click();
    await showSidebar(page);
    await expect(tree(page).getByRole("treeitem", { name: child, exact: true })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
}

for (const { label, size } of [{ label: "1280", size: { width: 1280, height: 900 } }, { label: "390", size: MOBILE }]) {
  test(`H-041: documentos de sistema de solo lectura a ${label} px`, async ({ browser, content }) => {
    const { context, page } = await workspace(browser, content, size);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 150)));

    // 1. La skill global llega con la bóveda, con candado y sin ⋮, arrastre, F2 ni Supr.
    await openFolder(page, "AG - SKILLS", "skill-bovedas-synapse");
    const skillRow = tree(page).getByRole("treeitem", { name: "skill-bovedas-synapse", exact: true });
    await expect(skillRow.locator('[data-icon="lock"]')).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Acciones de skill-bovedas-synapse" })).toHaveCount(0);
    await expect(skillRow).toHaveAttribute("draggable", "false");
    await skillRow.focus();
    await page.keyboard.press("F2");
    await expect(page.getByRole("textbox", { name: "Nuevo nombre de la nota" })).toHaveCount(0);
    await page.keyboard.press("Delete");
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    // 2. Se abre de solo lectura: título, insignia con la versión y el texto, sin editor.
    await skillRow.click();
    const view = page.getByRole("region", { name: "skill-bovedas-synapse" });
    await expect(view).toBeVisible({ timeout: 15_000 });
    await expect(view.getByText(/Documento de sistema · solo lectura · v1\.0\.0/)).toBeVisible();
    await expect(view.getByText("Operar bóvedas de Synapse")).toBeVisible({ timeout: 15_000 });
    await expect(view.getByRole("textbox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Editar|Guardar/ })).toHaveCount(0);
    await shot(page, `h041-${label}-1-skill-de-sistema`);

    // 3. La plantilla de sistema no abre el formulario de plantillas: muestra su definición de solo lectura.
    await openFolder(page, "PLANTILLAS", "plantilla-skill");
    const templateRow = tree(page).getByRole("treeitem", { name: "plantilla-skill", exact: true });
    await expect(templateRow.locator('[data-icon="lock"]')).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Acciones de plantilla-skill" })).toHaveCount(0);
    await templateRow.click();
    const template = page.getByRole("region", { name: "plantilla-skill" });
    await expect(template.getByText(/Documento de sistema · solo lectura/)).toBeVisible({ timeout: 15_000 });
    await expect(template.getByText("Se ofrece en")).toBeVisible();
    await expect(template.getByText("propietario (texto), agentes (lista), version (texto)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Guardar plantilla" })).toHaveCount(0);
    await shot(page, `h041-${label}-2-plantilla-de-sistema`);

    await waitForSynced(page);
    await expect(page.getByText(/cambios? rechazados?/), "sin rechazos del push").toHaveCount(0);
    expect(errors, "sin errores de consola").toEqual([]);
    await context.close();
  });
}

for (const { label, size } of [{ label: "1280", size: { width: 1280, height: 900 } }, { label: "390", size: MOBILE }]) {
  test(`H-041 E2: el nombre de una skill nueva se estructura a ${label} px`, async ({ browser, content }) => {
    const { context, page } = await workspace(browser, content, size);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 150)));

    await openFolder(page, "AG - SKILLS", "skill-bovedas-synapse");
    await openCreate(page);
    await page.getByLabel(/Título de la nota nueva/).fill(`Gestión de variables ${label}`);
    await page.getByRole("button", { name: "Nueva nota" }).click();
    // El nombre que se guarda y se ve en el árbol es el canónico, no lo que se escribió.
    const row = tree(page).getByRole("treeitem", { name: `skill-gestion-de-variables-${label}`, exact: true });
    await showSidebar(page);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(tree(page).getByRole("treeitem", { name: `Gestión de variables ${label}`, exact: true })).toHaveCount(0);
    await shot(page, `h041-${label}-3-skill-nueva`);

    await waitForSynced(page);
    await expect(page.getByText(/cambios? rechazados?/), "sin rechazos del push").toHaveCount(0);
    expect(errors, "sin errores de consola").toEqual([]);
    await context.close();
  });
}
