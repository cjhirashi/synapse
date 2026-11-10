// H-028: riel dividido (bóvedas arriba; Archivos, Papelera y Usuario abajo), navbar sin esos enlaces ni tema ni menú de
// usuario, y pantalla de usuario (/settings: Perfil, Contraseña, API keys, Tema) en navegador real.
import type { Page } from "@playwright/test";
import { expect, MOBILE, newSession, shot, test, waitForSynced, waitForVaults, type Seeded, type Size, type Theme } from "./fixtures";

const rail = (page: Page) => page.getByRole("navigation", { name: "Bóvedas abiertas" });

async function open(browser: Parameters<typeof newSession>[0], seeded: Seeded, size: Size, theme: Theme) {
  const context = await newSession(browser, seeded, { theme, size });
  const page = await context.newPage();
  await page.goto(`/vaults/${seeded.vaults[0].id}`);
  await waitForVaults(page, seeded.vaults.length);
  await waitForSynced(page);
  return { context, page };
}

const CASES: Array<{ label: string; size: Size; theme: Theme }> = [
  { label: "1280-dark", size: { width: 1280, height: 900 }, theme: "dark" },
  { label: "1280-light", size: { width: 1280, height: 900 }, theme: "light" },
  { label: "768-dark", size: { width: 768, height: 1024 }, theme: "dark" },
  { label: "390-dark", size: MOBILE, theme: "dark" },
  { label: "390-light", size: MOBILE, theme: "light" },
];

for (const { label, size, theme } of CASES) {
  test(`H-028: riel y pantalla de usuario a ${label}`, async ({ browser, buzon: seeded }) => {
    const { context, page } = await open(browser, seeded, size, theme);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    // Zona inferior del riel: Archivos, Papelera y Usuario, y la superior sigue con las bóvedas.
    const nav = rail(page);
    await expect(nav.getByRole("link", { name: "Archivos" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Papelera" })).toBeVisible();
    const user = nav.getByRole("link", { name: /^Usuario:/ });
    await expect(user).toBeVisible();
    const files = (await nav.getByRole("link", { name: "Archivos" }).boundingBox())!;
    const trash = (await nav.getByRole("link", { name: "Papelera" }).boundingBox())!;
    const me = (await user.boundingBox())!;
    expect(files.y).toBeLessThan(trash.y);
    expect(trash.y).toBeLessThan(me.y);
    const vaultLink = (await nav.locator(".vault-rail-scroll").getByRole("link").first().boundingBox())!;
    expect(vaultLink.y).toBeLessThan(files.y);
    // Pegado al fondo: el usuario queda en la parte baja de la ventana.
    expect(me.y + me.height).toBeGreaterThan(size.height - 120);

    // La navbar ya no lleva Archivos, Papelera, el menú de usuario ni el selector de tema.
    const bar = page.getByRole("banner");
    await expect(bar.getByRole("link", { name: "Archivos" })).toHaveCount(0);
    await expect(bar.getByRole("link", { name: "Papelera" })).toHaveCount(0);
    await expect(bar.getByRole("group", { name: "Tema" })).toHaveCount(0);
    await expect(bar.getByRole("button", { name: /Cuenta|Usuario|Menú de usuario/i })).toHaveCount(0);
    await shot(page, `h028-${label}-1-riel`);

    // Usuario abre la pantalla de perfil; sin nombre muestra el correo y las iniciales.
    await user.click();
    await expect(page).toHaveURL(/\/settings\/profile$/);
    await expect(page.locator(".settings-header h1")).toContainText("visual-");
    await shot(page, `h028-${label}-2-perfil`);

    // Guardar el nombre: el encabezado y el riel muestran el nombre y no el correo.
    const name = `Carlos ${label}`;
    await page.getByLabel("Nombre", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.locator(".settings-header h1")).toHaveText(name, { timeout: 15_000 });
    await expect(rail(page).getByRole("link", { name: new RegExp(`Usuario: ${name}`) })).toBeVisible({ timeout: 15_000 });
    await shot(page, `h028-${label}-3-nombre`);

    // Resto de secciones.
    const settingsNav = page.locator(".settings-nav");
    await settingsNav.getByRole("link", { name: "Contraseña" }).click();
    await expect(page.getByLabel("Nueva contraseña", { exact: true })).toBeVisible();
    await settingsNav.getByRole("link", { name: "API keys" }).click();
    await expect(page.getByText("Crear API key").first()).toBeVisible();
    await settingsNav.getByRole("link", { name: "Tema" }).click();
    const group = page.getByRole("group", { name: "Tema" });
    await expect(group).toBeVisible();
    const target = theme === "dark" ? "claro" : "oscuro";
    await group.getByRole("button", { name: new RegExp(target, "i") }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme === "dark" ? "light" : "dark");
    await shot(page, `h028-${label}-4-tema`);

    // Archivos y Papelera abren sus pantallas desde el riel.
    await rail(page).getByRole("link", { name: "Archivos" }).click();
    await expect(page).toHaveURL(/\/files$/);
    await rail(page).getByRole("link", { name: "Papelera" }).click();
    await expect(page).toHaveURL(/\/vaults\/trash$/);

    expect(errors).toEqual([]);
    await context.close();
  });
}
