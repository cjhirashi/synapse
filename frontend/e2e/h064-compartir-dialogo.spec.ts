// H-064 F5b: diálogo «Compartir» del propietario en navegador real: celular y escritorio, claro y oscuro.
// Siembra por la API (bóveda con carpetas, una persona activa con permisos por carpeta y otra pendiente), invita por la interfaz
// con permisos personalizados, cambia permisos, quita un acceso y comprueba por la API que lo hecho en pantalla quedó en el servidor.
import { createUser, createVault, expect, MOBILE, newSession, shot, test, waitForSynced, type Size, type Theme } from "./fixtures";

const base = () => process.env.BASE_URL ?? "http://127.0.0.1:8010";

async function call<T = unknown>(path: string, cookie: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(base() + path, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

interface Member { id: string; status: string; user: { email: string } | null; grants: Array<{ folder: string; level: string }> }

const CASES: Array<{ label: string; size: Size; theme: Theme }> = [
  { label: "1280-dark", size: { width: 1280, height: 900 }, theme: "dark" },
  { label: "1280-light", size: { width: 1280, height: 900 }, theme: "light" },
  { label: "390-dark", size: MOBILE, theme: "dark" },
  { label: "390-light", size: MOBILE, theme: "light" },
];

for (const { label, size, theme } of CASES) {
  test(`H-064 F5b: diálogo compartir a ${label}`, async ({ browser }) => {
    const mobile = size.width <= 640;
    const owner = await createUser({ canShare: true });
    const ana = await createUser();
    const bea = await createUser();
    const cam = await createUser();
    const vault = await createVault(owner.cookie, "Plan estratégico de operaciones y expansión regional 2027");
    for (const path of ["Docs/Sub/a.md", "Docs/b.md", "Proyectos/c.md", "Notas/d.md"]) {
      await call(`/vaults/${vault}/notes`, owner.cookie, "POST", { path, content: "# Nota" });
    }
    const anaMember = await call<Member>(`/vaults/${vault}/members`, owner.cookie, "POST", {
      email: ana.email,
      grants: [{ folder: "Docs", level: "escritura" }, { folder: "Proyectos", level: "lectura" }],
    });
    await call(`/invitations/${anaMember.id}/accept`, ana.cookie, "POST");
    await call(`/vaults/${vault}/members`, owner.cookie, "POST", { email: bea.email, grants: [{ folder: "*", level: "lectura" }] });

    const context = await newSession(browser, owner, { theme, size, touch: mobile });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/vaults/${vault}`);
    await waitForSynced(page);

    await page.getByRole("button", { name: "Compartir esta bóveda" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Personas con acceso" })).toBeVisible();
    await expect(dialog.locator(".share-member")).toHaveCount(2);
    await expect(dialog.getByText("Escritura en Docs · Lectura en Proyectos")).toBeVisible();
    await shot(page, `h064b-${label}-1-lista`);

    const fits = async () => {
      expect(await dialog.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
      const box = (await dialog.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1);
      const small: string[] = [];
      for (const control of await dialog.locator("button:visible, select:visible, input:visible:not([type=radio])").all()) {
        const height = (await control.boundingBox())!.height;
        if (height < 43) small.push(`${Math.round(height)} px · ${await control.evaluate((el) => el.outerHTML.slice(0, 110))}`);
      }
      expect(small).toEqual([]);
    };
    await fits();

    // Invitar con permisos personalizados: escritura en Docs y lectura en Notas.
    await dialog.getByLabel("Correo de la persona").fill(cam.email);
    const invite = dialog.locator(".share-invite-form");
    await invite.getByRole("radio", { name: "Personalizado" }).check({ force: true });
    await invite.getByLabel("Carpeta").selectOption("Docs");
    await invite.getByLabel("Acceso").selectOption("escritura");
    await invite.getByRole("button", { name: "Agregar carpeta" }).click();
    await invite.getByLabel("Carpeta").nth(1).selectOption("Notas");
    await dialog.getByLabel("Correo de la persona").scrollIntoViewIfNeeded();
    await shot(page, `h064b-${label}-2-invitar`);
    await fits();
    await invite.getByRole("button", { name: "Invitar", exact: true }).click();
    await expect(dialog.getByRole("status")).toContainText(`Invitación enviada a ${cam.email}`);
    await expect(dialog.locator(".share-member")).toHaveCount(3);
    await expect(dialog.locator(".share-member", { hasText: cam.email }).getByText("Pendiente")).toBeVisible();
    await expect(dialog.getByLabel("Correo de la persona")).toHaveValue("");
    await expect(invite.getByRole("radio", { name: "Lector" })).toBeChecked();
    await shot(page, `h064b-${label}-3-invitada`);

    // Cambiar los permisos de Ana a «Editor».
    const anaCard = dialog.locator(".share-member", { hasText: ana.email });
    await anaCard.getByRole("button", { name: "Permisos" }).click();
    await anaCard.getByRole("radio", { name: "Editor" }).check({ force: true });
    await shot(page, `h064b-${label}-4-permisos`, { selector: "[role=dialog]" });
    await anaCard.getByRole("button", { name: "Guardar permisos" }).click();
    await expect(anaCard.getByText("Escritura en toda la bóveda")).toBeVisible();

    // Quitar el acceso pendiente de Bea (pide confirmación).
    const beaCard = dialog.locator(".share-member", { hasText: bea.email });
    await beaCard.getByRole("button", { name: "Cancelar invitación" }).click();
    await expect(beaCard.getByText(`¿Quitar el acceso de ${bea.email}?`)).toBeVisible();
    await shot(page, `h064b-${label}-5-quitar`, { selector: "[role=dialog]" });
    await beaCard.getByRole("button", { name: "Quitar", exact: true }).click();
    await expect(dialog.locator(".share-member", { hasText: bea.email })).toHaveCount(0);

    // Lo hecho en pantalla quedó en el servidor.
    const { items } = await call<{ items: Member[] }>(`/vaults/${vault}/members`, owner.cookie);
    const by = (email: string) => items.find((m) => m.user?.email === email)!;
    expect(by(ana.email).grants).toEqual([{ folder: "*", level: "escritura" }]);
    expect(by(cam.email).status).toBe("pendiente");
    expect(by(cam.email).grants).toEqual(expect.arrayContaining([{ folder: "Docs", level: "escritura" }, { folder: "Notas", level: "lectura" }]));
    expect(by(bea.email).status).toBe("revocado");

    await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(errors).toEqual([]);
    await context.close();
  });
}
