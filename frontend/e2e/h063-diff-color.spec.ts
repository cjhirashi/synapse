// H-063: bloque ```diff (el de la BITACORA): agregadas en verde, eliminadas en rojo sin tachado, contexto sin color.
import type { Page } from "@playwright/test";
import { expect, MOBILE, newSession, shot, test, waitForSynced, waitForVaults, type Seeded, type Size } from "./fixtures";

const tree = (page: Page) => page.getByRole("tree", { name: "Notas" });

// Mismo formato que escribe `number_diff` en el servidor: la marca va primero y luego las dos columnas de número.
const DIFF = [
  "@@ -1,3 +1,4 @@",
  " 1    1  Línea uno",
  "-2       Línea dos",
  "+     2  Línea dos editada",
  " 3    3  Línea tres",
  "+     4  Línea cuatro nueva",
  '-prop prop  estado: "borrador"',
  '+prop prop  estado: "aprobado"',
].join("\n");

async function showSidebar(page: Page) {
  const show = page.getByRole("button", { name: "Mostrar la barra de notas" });
  if (await show.isVisible()) await show.click();
  await expect(page.getByRole("complementary", { name: "Notas de la bóveda" })).toBeVisible();
}

async function workspace(browser: Parameters<typeof newSession>[0], seeded: Seeded, theme: "dark" | "light", size: Size) {
  const context = await newSession(browser, seeded, { theme, size });
  const page = await context.newPage();
  await page.goto(`/vaults/${seeded.vaults[0].id}`);
  await waitForVaults(page, seeded.vaults.length);
  await waitForSynced(page);
  await showSidebar(page);
  return { context, page };
}

for (const { label, size, theme } of [
  { label: "1280-dark", size: { width: 1280, height: 900 }, theme: "dark" as const },
  { label: "1280-light", size: { width: 1280, height: 900 }, theme: "light" as const },
  { label: "390-dark", size: MOBILE, theme: "dark" as const },
  { label: "390-light", size: MOBILE, theme: "light" as const },
]) {
  test(`H-063: bloque diff con color, ${label}`, async ({ browser, content }) => {
    const { context, page } = await workspace(browser, content, theme, size);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 150)));

    await expect(async () => {
      await showSidebar(page);
      await expect(tree(page).getByRole("treeitem", { name: "Raíz", exact: true })).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    await tree(page).getByRole("treeitem", { name: "Raíz", exact: true }).click();
    await showSidebar(page);
    await page.getByRole("button", { name: /^Nueva nota en/ }).click();
    await page.getByLabel(/Título de la nota nueva/).fill(`H063 diff ${label}`);
    await page.getByLabel(/Contenido de la nota nueva/).fill(`Cambio de ejemplo\n\n\`\`\`diff\n${DIFF}\n\`\`\`\n`);
    await page.getByRole("button", { name: "Crear nota", exact: true }).click();

    const block = page.locator(".code-block").filter({ has: page.locator(".code-block-label", { hasText: /^diff$/ }) });
    await expect(block).toBeVisible({ timeout: 15_000 });
    // El lenguaje se carga bajo demanda: espera a que aparezcan las decoraciones.
    const added = block.locator(".sx-insertion");
    const removed = block.locator(".sx-deletion");
    await expect(added.first()).toBeAttached({ timeout: 15_000 });
    await expect(removed.first()).toBeAttached();
    expect(await added.count(), "3 líneas agregadas").toBe(3);
    expect(await removed.count(), "2 líneas eliminadas").toBe(2);
    await expect(block.locator(".sx-meta").first(), "cabecera @@").toBeAttached();

    // Colores computados = tokens del tema; las eliminadas sin tachado; el contexto no lleva ninguna de las dos clases.
    const resolve = (token: string) =>
      page.evaluate((t) => {
        const probe = document.createElement("span");
        probe.style.color = `var(${t})`;
        document.body.appendChild(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      }, token);
    const colorOf = (loc: typeof added) => loc.first().evaluate((el) => getComputedStyle(el).color);
    const successToken = await resolve("--success-text");
    const dangerToken = await resolve("--danger-text");
    expect(await colorOf(added), "agregadas = --success-text").toBe(successToken);
    expect(await colorOf(removed), "eliminadas = --danger-text").toBe(dangerToken);
    expect(successToken).not.toBe(dangerToken);
    expect(await removed.first().evaluate((el) => getComputedStyle(el).textDecorationLine), "sin tachado").toBe("none");

    // Un renglón de contexto (empieza con espacio) mantiene el color normal del bloque.
    const preColor = await block.locator("pre").evaluate((el) => getComputedStyle(el).color);
    expect(preColor).not.toBe(successToken);
    expect(preColor).not.toBe(dangerToken);

    await shot(page, `h063-diff-${label}`);
    await waitForSynced(page);
    expect(errors, "sin errores de consola").toEqual([]);
    await context.close();
  });
}
