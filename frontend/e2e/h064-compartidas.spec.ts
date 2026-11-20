// H-064 F5a: «Compartidas conmigo» (invitaciones del invitado) en navegador real: celular y escritorio, claro y oscuro.
// Siembra por la API (dos invitaciones, una con nombre de bóveda y de propietario largos), acepta por la interfaz y mide
// que nada se desborde ni se trunque y que cada botón cumpla el área de toque.
import { createUser, createVault, expect, MOBILE, newSession, shot, test, type Size, type Theme } from "./fixtures";

const base = () => process.env.BASE_URL ?? "http://127.0.0.1:8010";

async function call(path: string, cookie: string, method: string, body: unknown): Promise<Response> {
  const res = await fetch(base() + path, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
  return res;
}

const CASES: Array<{ label: string; size: Size; theme: Theme }> = [
  { label: "1280-dark", size: { width: 1280, height: 900 }, theme: "dark" },
  { label: "1280-light", size: { width: 1280, height: 900 }, theme: "light" },
  { label: "390-dark", size: MOBILE, theme: "dark" },
  { label: "390-light", size: MOBILE, theme: "light" },
];

const LONG_VAULT = "Plan estratégico de operaciones y expansión regional 2027 con nombre bastante largo";

for (const { label, size, theme } of CASES) {
  test(`H-064 F5a: compartidas conmigo a ${label}`, async ({ browser }) => {
    const mobile = size.width <= 640;
    const owner = await createUser();
    const guest = await createUser();
    const longVault = await createVault(owner.cookie, LONG_VAULT);
    const plainVault = await createVault(owner.cookie, "Notas de la casa");
    await call(`/vaults/${longVault}/members`, owner.cookie, "POST", {
      email: guest.email,
      grants: [
        { folder: "Pub", level: "lectura" },
        { folder: "Docs/Sub", level: "escritura" },
        { folder: "Notas", level: "escritura" },
      ],
    });
    await call(`/vaults/${plainVault}/members`, owner.cookie, "POST", { email: guest.email, grants: [{ folder: "*", level: "lectura" }] });

    const context = await newSession(browser, guest, { theme, size, touch: mobile });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/compartidas");

    await expect(page.getByRole("heading", { name: "Compartidas conmigo", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Invitaciones", level: 2 })).toBeVisible();
    await expect(page.locator(".shared-title", { hasText: LONG_VAULT }).first()).toBeVisible();
    await expect(page.getByText(`Te invitó ${owner.email}`).first()).toBeVisible();
    await expect(page.getByText("Escritura en Docs/Sub y Notas · Lectura en Pub")).toBeVisible();
    await expect(page.getByText("Lectura en toda la bóveda")).toBeVisible();
    await shot(page, `h064-${label}-1-pendientes`);

    // Sin desbordes y con área de toque suficiente.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    for (const button of await page.locator(".shared-btn").all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(43);
    }
    for (const card of await page.locator(".shared-card").all()) {
      const box = (await card.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1);
    }
    // Los títulos se parten, nunca se cortan con puntos suspensivos.
    for (const title of await page.locator(".shared-title").all()) {
      expect(await title.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    }

    // Aceptar una; la otra se rechaza.
    await page.getByRole("button", { name: `Aceptar invitación a «${LONG_VAULT}»` }).click();
    await expect(page.locator(".shared-page > p[role=status]")).toContainText("Aceptaste la invitación");
    await expect(page.getByRole("heading", { name: "Bóvedas compartidas", level: 2 })).toBeVisible();
    await shot(page, `h064-${label}-2-aceptada`);

    // Salir pide confirmación.
    await page.getByRole("button", { name: `Salir de «${LONG_VAULT}»` }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await shot(page, `h064-${label}-3-salir`);
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Rechazar invitación a «Notas de la casa»" }).click();
    await expect(page.locator(".shared-page > p[role=status]")).toContainText("Rechazaste la invitación");

    // El aviso llegó a la bandeja y lleva a la página.
    await page.goto("/avisos");
    await expect(page.getByText("Compartir bóveda").first()).toBeVisible();
    await shot(page, `h064-${label}-4-aviso`);
    expect(errors).toEqual([]);
    await context.close();
  });
}
