// Capturas de no regresión de las pantallas que comparten estilos base con el workspace (SPEC-0009
// enmienda 1, T-067): login, lista de bóvedas, papelera, diálogo de confirmación y menú de cuenta.
// Se corren con `REGRESS_TAG=antes|despues` y se comparan a ojo (los estilos base de `button` cambian de
// especificidad: nada debe moverse salvo lo intencionado). Salida: /tmp/s9/e2e/reg-{tag}-{pantalla}-{tema}.png
import { expect, newSession, shot, test, THEMES } from "./fixtures";

const TAG = process.env.REGRESS_TAG ?? "actual";

for (const theme of THEMES) {
  test(`Regresión visual ${TAG}: pantallas de cuenta y listas, ${theme} (RF-007)`, async ({ browser, seeded }) => {
    // Login: sin sesión.
    const anonymous = await browser.newContext({ baseURL: process.env.BASE_URL, viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    await anonymous.addInitScript((mode) => localStorage.setItem("synapse-theme", mode), theme);
    const login = await anonymous.newPage();
    await login.goto("/login");
    await expect(login.getByLabel("Correo")).toBeVisible();
    await shot(login, `reg-${TAG}-login-${theme}`);
    await anonymous.close();

    const context = await newSession(browser, seeded, { theme });
    const page = await context.newPage();
    await page.goto("/vaults");
    await expect(page.getByRole("listitem", { name: seeded.vaults[0].name })).toBeVisible();
    await shot(page, `reg-${TAG}-lista-${theme}`);

    // Diálogo de confirmación de borrado de bóveda.
    await page.getByRole("listitem", { name: seeded.vaults[0].name }).getByRole("button", { name: "Borrar" }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await shot(page, `reg-${TAG}-dialogo-${theme}`);
    await page.getByRole("button", { name: "Cancelar" }).click();

    // Menú de cuenta.
    await page.locator(".account-menu-trigger").click();
    await expect(page.locator(".account-menu-popover")).toBeVisible();
    await shot(page, `reg-${TAG}-cuenta-${theme}`);
    await page.keyboard.press("Escape");

    // Papelera de bóvedas.
    await page.goto("/vaults/trash");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await shot(page, `reg-${TAG}-papelera-${theme}`);
    await context.close();
  });
}
