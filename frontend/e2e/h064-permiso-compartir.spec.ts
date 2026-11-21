// H-064 F5d: solo administradores y usuarios habilitados comparten bóvedas. En navegador real: sin el permiso no hay botón
// «Compartir» y el servidor rechaza la invitación; el administrador activa la función desde «Límites y permisos» y el botón aparece.
import { createUser, createVault, expect, MOBILE, newSession, shot, test, waitForSynced, type Size, type Theme } from "./fixtures";

const base = () => process.env.BASE_URL ?? "http://127.0.0.1:8010";
const SHARE = { name: "Compartir esta bóveda" };

const CASES: Array<{ label: string; size: Size; theme: Theme }> = [
  { label: "1280-light", size: { width: 1280, height: 900 }, theme: "light" },
  { label: "390-dark", size: MOBILE, theme: "dark" },
];

for (const { label, size, theme } of CASES) {
  test(`H-064 F5d: permiso de compartir a ${label}`, async ({ browser }) => {
    const mobile = size.width <= 640;
    const owner = await createUser();
    const ana = await createUser();
    const vault = await createVault(owner.cookie, "Mi bóveda");

    // Sin el permiso: la bóveda funciona igual, pero no hay «Compartir» y la API rechaza invitar.
    const ownerContext = await newSession(browser, owner, { theme, size, touch: mobile });
    const ownerPage = await ownerContext.newPage();
    const errors: string[] = [];
    ownerPage.on("pageerror", (e) => errors.push(e.message));
    await ownerPage.goto(`/vaults/${vault}`);
    await waitForSynced(ownerPage);
    await expect(ownerPage.getByRole("heading", { name: "Mi bóveda" }).first()).toBeVisible();
    await expect(ownerPage.getByRole("button", SHARE)).toHaveCount(0);
    const denied = await fetch(`${base()}/vaults/${vault}/members`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: owner.cookie },
      body: JSON.stringify({ email: ana.email, grants: [{ folder: "*", level: "lectura" }] }),
    });
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { type: string }).type).toMatch(/share-not-allowed$/);

    // El administrador lo activa desde Usuarios → Límites y permisos.
    const admin = await newSession(browser, { email: process.env.ADMIN_EMAIL!, password: process.env.E2E_ADMIN_PASSWORD! }, { theme, size });
    const adminPage = await admin.newPage();
    await adminPage.goto("/settings/users");
    await adminPage.getByRole("button", { name: `Límites de ${owner.email}`, exact: true }).click();
    const dialog = adminPage.getByRole("dialog");
    const toggle = dialog.getByRole("switch", { name: "Puede compartir bóvedas" });
    await expect(toggle).not.toBeChecked();
    await shot(adminPage, `h064d-${label}-1-interruptor-apagado`);
    expect(await dialog.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    await toggle.click({ force: true });
    await expect(toggle).toBeChecked();
    await shot(adminPage, `h064d-${label}-2-interruptor-activado`);
    await dialog.getByRole("button", { name: "Guardar" }).click();
    await expect(adminPage.getByText("Cambios guardados.")).toBeVisible();
    await admin.close();

    // Con el permiso: recarga y el botón aparece.
    await ownerPage.reload();
    await waitForSynced(ownerPage);
    await expect(ownerPage.getByRole("button", SHARE)).toBeVisible();
    await shot(ownerPage, `h064d-${label}-3-con-boton`);
    expect(errors).toEqual([]);
    await ownerContext.close();
  });
}
