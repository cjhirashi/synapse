// H-042: el buzón entre agentes es solo para agentes. Dentro de AG - MENSAJES la barra lateral no ofrece crear nada (ni
// «Crear en», «Nueva nota», «Nueva carpeta» ni «Crear…»), las conversaciones y sus documentos no se arrastran ni se editan,
// y un documento se abre de solo lectura. En navegador real a 1280 y 390 px.
import type { Page } from "@playwright/test";
import { BUZON_CONVERSATION, expect, MOBILE, newSession, shot, test, waitForSynced, waitForVaults, type Seeded } from "./fixtures";

const tree = (page: Page) => page.getByRole("tree", { name: "Notas" });
const FOLDER = BUZON_CONVERSATION.split("/")[1];

async function showSidebar(page: Page) {
  await expect(async () => {
    const show = page.getByRole("button", { name: "Mostrar la barra de notas" });
    if (await show.first().isVisible()) await show.first().click();
    await expect(page.getByRole("complementary", { name: "Notas de la bóveda" })).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
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

const creationControls = (page: Page) => [
  page.getByText(/Crear en:/),
  page.getByRole("button", { name: "Nueva nota" }),
  page.getByRole("button", { name: "Nueva carpeta" }),
  page.getByRole("button", { name: "Crear…" }),
];

for (const { label, size } of [{ label: "1280", size: { width: 1280, height: 900 } }, { label: "390", size: MOBILE }]) {
  test(`H-042: AG - MENSAJES es de solo lectura para el usuario a ${label} px`, async ({ browser, buzon }) => {
    const { context, page } = await workspace(browser, buzon, size);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 150)));

    // 1. En la raíz hay controles de creación (a ≤ 640 px, tras «Crear…»).
    const toggle = page.getByRole("button", { name: "Crear…" });
    if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
    await expect(page.getByRole("button", { name: "Nueva nota" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nueva carpeta" })).toBeVisible();

    // 2. Al entrar en el buzón desaparecen todos y aparece el aviso.
    // A ≤ 640 px la barra flota y se cierra al abrir una nota o un índice: se vuelve a mostrar tras cada clic.
    const click = async (row: ReturnType<typeof tree>) => {
      await row.click();
      await showSidebar(page);
    };
    const buzonRow = tree(page).getByRole("treeitem", { name: "AG - MENSAJES", exact: true });
    await click(buzonRow);
    for (const control of creationControls(page)) await expect(control).toHaveCount(0);
    await expect(page.getByRole("note")).toHaveText(/Buzón entre agentes: solo lectura/);
    await shot(page, `h042-${label}-1-buzon-sin-crear`);

    // 3. La conversación (una carpeta «de → para - asunto - fecha») no se arrastra ni ofrece ⋮; tampoco sus documentos.
    const conversation = tree(page).getByRole("treeitem", { name: FOLDER, exact: true });
    await expect(conversation).toBeVisible();
    await expect(conversation).toHaveAttribute("draggable", "false");
    await expect(page.getByRole("button", { name: `Acciones de ${FOLDER}` })).toHaveCount(0);
    await click(conversation);
    for (const control of creationControls(page)) await expect(control).toHaveCount(0);
    const message = tree(page).getByRole("treeitem", { name: "001-de-aira", exact: true });
    await expect(message).toBeVisible();
    await expect(message).toHaveAttribute("draggable", "false");
    await expect(page.getByRole("button", { name: "Acciones de 001-de-aira" })).toHaveCount(0);
    await message.focus();
    await page.keyboard.press("F2");
    await expect(page.getByRole("textbox", { name: "Nuevo nombre de la nota" })).toHaveCount(0);
    await page.keyboard.press("Delete");
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    // 4. Un mensaje se abre de solo lectura: insignia, de dónde viene y el texto; sin editor.
    await click(message);
    const view = page.getByRole("region", { name: "001-de-aira" });
    await expect(view).toBeVisible({ timeout: 15_000 });
    await expect(view.getByText(/Buzón entre agentes · solo lectura/)).toBeVisible();
    await expect(view.getByText("aira → liza · Revisar el plan · 2026-11-05")).toBeVisible();
    await expect(view.getByText("aira (mensaje 1)")).toBeVisible();
    await expect(view.getByText("Necesito que revises el plan de H-042.")).toBeVisible({ timeout: 15_000 });
    await expect(view.getByRole("textbox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Editar|Guardar/ })).toHaveCount(0);
    await shot(page, `h042-${label}-2-mensaje-solo-lectura`);

    // 5. La cabecera muestra el estado; la respuesta del receptor también se lee.
    await showSidebar(page);
    await click(tree(page).getByRole("treeitem", { name: "000-cabecera", exact: true }));
    const head = page.getByRole("region", { name: "aira → liza - Revisar el plan" });
    await expect(head.getByText("abierta")).toBeVisible({ timeout: 15_000 });
    await click(tree(page).getByRole("treeitem", { name: "002-de-liza", exact: true }));
    await expect(page.getByRole("region", { name: "002-de-liza" }).getByText("liza (mensaje 2)")).toBeVisible({ timeout: 15_000 });

    // 6. El INDICE de la conversación se lee, pero su descripción no se edita.
    await click(conversation);
    const description = page.getByLabel("Descripción");
    if (await description.count()) {
      await expect(description).toHaveAttribute("readonly", "");
      await expect(page.getByRole("button", { name: "Guardar descripción" })).toHaveCount(0);
    }

    // 7. Fuera del buzón todo sigue igual: vuelven los controles y una nota normal ofrece ⋮.
    await click(tree(page).getByRole("treeitem", { name: "Raíz", exact: true }));
    if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
    await expect(page.getByRole("button", { name: "Nueva nota" })).toBeVisible();
    await expect(page.getByRole("note")).toHaveCount(0);
    await click(tree(page).getByRole("treeitem", { name: "Ideas", exact: true }));
    await expect(page.getByRole("button", { name: "Acciones de Una nota normal" })).toBeVisible();

    expect(errors).toEqual([]);
    await context.close();
  });
}
