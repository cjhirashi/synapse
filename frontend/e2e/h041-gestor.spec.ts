// H-041 E4: el gestor que sale. Quitar a un gestor que posee skills abre una ventana para resolver cada una (asignarla a un
// invitado, eliminarla o archivarla); las archivadas se asignan a un gestor desde «Skills sin propietario». En navegador
// real a 1280 y 390 px, con el estado sembrado por la API con la sesión del usuario.
import type { Page } from "@playwright/test";
import { expect, MOBILE, newSession, shot, test } from "./fixtures";

const origin = () => process.env.BASE_URL ?? "http://127.0.0.1:8010";

// La API REST con la sesión del usuario (las cookies seguras no viajan por `context.request` sobre http).
async function session(user: { email: string; password: string }) {
  const login = await fetch(`${origin()}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: user.email, password: user.password }),
  });
  const cookie = login.headers.getSetCookie().map((line) => line.split(";")[0]).join("; ");
  return async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${origin()}${path}`, {
      method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text: async () => text, json: async () => JSON.parse(text) as any };
  };
}

for (const { label, size } of [{ label: "1280", size: { width: 1280, height: 900 } }, { label: "390", size: MOBILE }]) {
  test(`H-041 E4: el gestor que sale a ${label} px`, async ({ browser, content }) => {
    const context = await newSession(browser, content, { theme: "dark", size });
    const vault = content.vaults[0];
    const api = await session(content);
    const base = `/vaults/${vault.id}`;

    // Siembra: tres gestores y dos skills de aira (una compartida con emma y otro, otra sin invitados).
    for (const agent of ["aira", "emma", "otro"]) {
      const put = await api("PUT", `${base}/agent-access/${agent}`, { carpetas: ["*"], estado: "activo" });
      expect(put.ok, `${put.status} ${await put.text()}`).toBeTruthy();
    }
    const create = async (name: string, extra: Record<string, unknown>) => {
      const res = await api("POST", `${base}/notes`, {
        path: `AG - SKILLS/${name}`, content: "# paso",
        frontmatter: { titulo: name, descripcion: "Al hacer algo.", tags: ["skill"], estado: "borrador", propietario: "aira", ...extra },
      });
      expect(res.ok, await res.text()).toBeTruthy();
      return (await res.json()).path as string;
    };
    const shared = (await create(`Compartida ${label}`, { agentes: ["emma", "otro"] })).split("/")[1].replace(".md", "");
    const alone = (await create(`Sola ${label}`, {})).split("/")[1].replace(".md", "");

    const page: Page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // El 404 del punto de control de la réplica (`/sync/db/_local/…`) es normal en la primera sincronización de un perfil nuevo.
    page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text().slice(0, 150)));
    page.on("response", (r) => r.status() >= 400 && !r.url().includes("/sync/db/_local/") && errors.push(`${r.status()} ${r.url()}`));
    await page.goto("/settings/agent-access");
    await page.getByLabel("Bóveda a asignar").selectOption({ label: vault.name });
    const aira = page.getByRole("listitem", { name: "Agente aira" });
    await expect(aira).toBeVisible({ timeout: 15_000 });
    await expect(aira.getByText(/Skills: posee 2 activas/)).toBeVisible();

    // 1. Quitar a aira abre la ventana; no se puede confirmar sin elegir qué pasa con cada skill.
    await aira.getByRole("button", { name: "Quitar aira" }).click();
    const dialog = page.getByRole("dialog", { name: "Quitar a aira" });
    await expect(dialog).toBeVisible();
    const confirm = dialog.getByRole("button", { name: "Confirmar y quitar" });
    await expect(confirm).toBeDisabled();
    const sharedItem = dialog.getByRole("listitem", { name: `Skill ${shared}` });
    const aloneItem = dialog.getByRole("listitem", { name: `Skill ${alone}` });
    await expect(sharedItem.getByRole("radio", { name: /Archivar/ })).toHaveCount(0); // con invitados no se archiva
    await expect(aloneItem.getByRole("radio", { name: /Asignar a/ })).toHaveCount(0); // sin invitados no hay a quién asignar
    await sharedItem.getByLabel(`Nuevo propietario de ${shared}`).selectOption("otro");
    await sharedItem.getByRole("radio", { name: /Asignar a/ }).check();
    await expect(confirm).toBeDisabled();
    await aloneItem.getByRole("radio", { name: /Archivar/ }).check();
    await expect(confirm).toBeEnabled();
    await shot(page, `h041-${label}-4-ventana-gestor-que-sale`);

    // 2. Confirmar: aira ya no está, la compartida es de otro y la sola quedó archivada y sin propietario.
    await confirm.click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("listitem", { name: "Agente aira" })).toHaveCount(0);
    const listed = async () => ((await (await api("GET", `${base}/skills`)).json()).skills as Array<Record<string, unknown>>);
    const byName = async (name: string) => (await listed()).find((s) => String(s.path).endsWith(`/${name}.md`))!;
    expect(await byName(shared)).toMatchObject({ propietario: "otro", agentes: ["emma"] });
    expect(await byName(alone)).toMatchObject({ estado: "archivado", propietario: null, agentes: [] });

    // 3. La archivada aparece en «Skills sin propietario» y se asigna a un gestor activo: vuelve a «en revisión».
    const orphans = page.getByRole("region", { name: "Skills sin propietario" });
    await expect(orphans.getByRole("listitem", { name: `Skill archivada ${alone}` })).toBeVisible();
    await orphans.scrollIntoViewIfNeeded();
    await shot(page, `h041-${label}-5-skills-sin-propietario`);
    await orphans.getByLabel(`Asignar ${alone} a`).selectOption("emma");
    await orphans.getByRole("button", { name: `Asignar ${alone}` }).click();
    await expect(orphans.getByRole("listitem", { name: `Skill archivada ${alone}` })).toHaveCount(0);
    expect(await byName(alone)).toMatchObject({ propietario: "emma", estado: "en revisión" });

    expect(errors, "sin errores de consola").toEqual([]);
    await context.close();
  });
}
