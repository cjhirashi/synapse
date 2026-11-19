// H-063: bloque ```diff (el de la BITACORA): agregadas en verde, eliminadas en rojo sin tachado, contexto sin color.
import type { Page } from "@playwright/test";
import { expect, MOBILE, newSession, seedSingleNote, shot, test, waitForSynced, waitForVaults, type Size } from "./fixtures";

// Mismo formato que escribe `number_diff` en el servidor: la marca va primero y luego las dos columnas de número.
const DIFF = [
  "@@ -1,3 +1,4 @@",
  "   1   1  Línea uno",
  "-  2      Línea dos",
  "+      2  Línea dos editada",
  "   3   3  Línea tres",
  "+      4  Línea cuatro nueva",
  '-prop           estado: "borrador"',
  '+prop           estado: "aprobado"',
].join("\n");

const NOTE = "H063 diff";

async function showSidebar(page: Page) {
  const show = page.getByRole("button", { name: "Mostrar la barra de notas" });
  if (await show.isVisible()) await show.click();
  await expect(page.getByRole("complementary", { name: "Notas de la bóveda" })).toBeVisible();
}

for (const { label, size, theme } of [
  { label: "1280-dark", size: { width: 1280, height: 900 } as Size, theme: "dark" as const },
  { label: "1280-light", size: { width: 1280, height: 900 } as Size, theme: "light" as const },
  { label: "390-dark", size: MOBILE as Size, theme: "dark" as const },
  { label: "390-light", size: MOBILE as Size, theme: "light" as const },
]) {
  test(`H-063: bloque diff con color, ${label}`, async ({ browser }) => {
    const seeded = await seedSingleNote(`${NOTE}.md`, `Cambio de ejemplo\n\n\`\`\`diff\n${DIFF}\n\`\`\`\n`);
    const context = await newSession(browser, seeded, { theme, size });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // Los 404 de `/sync/db/_local/*` son los puntos de control de PouchDB al sincronizar por primera vez: no son un fallo.
    page.on("console", (m) => m.type() === "error" && !m.text().includes("status of 404") && errors.push(m.text().slice(0, 150)));
    await page.goto(`/vaults/${seeded.vaults[0].id}`);
    await waitForVaults(page, 1);
    await waitForSynced(page);

    // Con una sola nota la app la abre sola; si no, se abre desde el árbol.
    await expect(page.getByRole("heading", { name: NOTE, level: 2 })).toBeVisible({ timeout: 15_000 }).catch(async () => {
      await showSidebar(page);
      await page.getByRole("tree", { name: "Notas" }).getByRole("treeitem", { name: NOTE, exact: true }).click();
    });

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

    // Colores computados = tokens del tema; las eliminadas sin tachado; el contexto conserva el color del bloque.
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
    const preColor = await block.locator("pre").evaluate((el) => getComputedStyle(el).color);
    expect(preColor).not.toBe(successToken);
    expect(preColor).not.toBe(dangerToken);

    await shot(page, `h063-diff-${label}`);
    expect(errors, "sin errores de consola").toEqual([]);
    await context.close();
  });
}
