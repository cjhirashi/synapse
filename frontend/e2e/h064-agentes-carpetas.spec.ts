// H-064 F5c: selector de carpetas de escritura de los agentes («Agentes por bóveda») en navegador real: celular y escritorio, claro y oscuro.
// Siembra una bóveda con carpetas y un agente registrado (con una carpeta que ya no existe), cambia el alcance por la interfaz y
// comprueba por la API lo que quedó guardado.
import { createUser, createVault, expect, MOBILE, newSession, shot, test, waitForSynced, type Size, type Theme } from "./fixtures";

const base = () => process.env.BASE_URL ?? "http://127.0.0.1:8010";

async function call<T = unknown>(path: string, cookie: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(base() + path, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

const CASES: Array<{ label: string; size: Size; theme: Theme }> = [
  { label: "1280-dark", size: { width: 1280, height: 900 }, theme: "dark" },
  { label: "1280-light", size: { width: 1280, height: 900 }, theme: "light" },
  { label: "390-dark", size: MOBILE, theme: "dark" },
  { label: "390-light", size: MOBILE, theme: "light" },
];

for (const { label, size, theme } of CASES) {
  test(`H-064 F5c: agentes por carpeta a ${label}`, async ({ browser }) => {
    const mobile = size.width <= 640;
    const owner = await createUser({ canShare: true });
    const vault = await createVault(owner.cookie, "Plan estratégico de operaciones y expansión regional 2027");
    for (const path of ["Docs/Sub/a.md", "Docs/b.md", "Proyectos/c.md", "Notas/d.md"]) {
      await call(`/vaults/${vault}/notes`, owner.cookie, "POST", { path, content: "# Nota" });
    }
    await call(`/vaults/${vault}/agent-access/aira`, owner.cookie, "PUT", { carpetas: ["Docs", "Vieja"], estado: "activo" });

    const context = await newSession(browser, owner, { theme, size, touch: mobile });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/settings/agent-access");
    await waitForSynced(page);

    const card = page.getByRole("listitem", { name: "Agente aira" });
    await expect(card.getByRole("radio", { name: "Carpetas" })).toBeChecked();
    await expect(card.getByText("(ya no existe)")).toBeVisible();
    await expect(card.getByRole("checkbox", { name: "Docs/Sub" })).toBeVisible();
    await card.scrollIntoViewIfNeeded();
    await shot(page, `h064c-${label}-1-carpetas`);

    const check = async () => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      const small: string[] = [];
      for (const label of await card.locator(".fsp-label, .share-role-button").all()) {
        const height = (await label.boundingBox())!.height;
        if (height < 43) small.push(`${Math.round(height)} px · ${(await label.textContent())?.trim()}`);
      }
      expect(small).toEqual([]);
      for (const name of await card.locator(".fsp-name, .share-role-button span").all()) {
        expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      }
    };
    await check();

    // Quitar la carpeta desaparecida y sumar «Proyectos».
    await card.getByRole("checkbox", { name: /Vieja/ }).click(); // la fila desaparece al quitarla
    await card.getByRole("checkbox", { name: "Proyectos" }).check();
    await card.getByRole("button", { name: "Guardar aira" }).click();
    await expect.poll(async () => (await call<{ agents: Array<{ carpetas: string[] }> }>(`/vaults/${vault}/agent-access`, owner.cookie)).agents[0].carpetas).toEqual(["Docs", "Proyectos"]);
    await expect(card.getByText("(ya no existe)")).toHaveCount(0);
    await shot(page, `h064c-${label}-2-guardado`);

    // Toda la bóveda.
    await card.getByRole("radio", { name: "Toda la bóveda" }).check({ force: true });
    await expect(card.getByText("Escribe en todas las carpetas, salvo las del sistema.")).toBeVisible();
    await shot(page, `h064c-${label}-3-toda`);
    await card.getByRole("button", { name: "Guardar aira" }).click();
    await expect.poll(async () => (await call<{ agents: Array<{ carpetas: string[] }> }>(`/vaults/${vault}/agent-access`, owner.cookie)).agents[0].carpetas).toEqual(["*"]);

    // Ninguna.
    await card.getByRole("radio", { name: "Ninguna" }).check({ force: true });
    await card.getByRole("button", { name: "Guardar aira" }).click();
    await expect.poll(async () => (await call<{ agents: Array<{ carpetas: string[] }> }>(`/vaults/${vault}/agent-access`, owner.cookie)).agents[0].carpetas).toEqual([]);

    await check();
    expect(errors).toEqual([]);
    await context.close();
  });
}
