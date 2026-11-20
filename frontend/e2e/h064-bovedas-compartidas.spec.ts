// H-064 F7c: un invitado abre una bóveda compartida en navegador real (PouchDB contra `/sync/shared/{id}`): solo ve lo que su
// concesión cubre, lee sin conexión y recibe lo que el propietario cambia.
import { createUser, createVault, expect, MOBILE, newSession, shot, test, type Size, type Theme } from "./fixtures";

const base = () => process.env.BASE_URL ?? "http://127.0.0.1:8010";

async function call<T = unknown>(path: string, cookie: string, method = "GET", body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(base() + path, { method, headers: { "Content-Type": "application/json", Cookie: cookie, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

const CASES: Array<{ label: string; size: Size; theme: Theme }> = [
  { label: "1280-dark", size: { width: 1280, height: 900 }, theme: "dark" },
  { label: "390-light", size: MOBILE, theme: "light" },
];

for (const { label, size, theme } of CASES) {
  test(`H-064 F7c: el invitado abre la bóveda compartida a ${label}`, async ({ browser }) => {
    const mobile = size.width <= 640;
    const owner = await createUser();
    const guest = await createUser();
    const vault = await createVault(owner.cookie, "Plan estratégico compartido");
    const notes: Record<string, { id: string }> = {};
    for (const [path, content] of [["Pub/a.md", "# Pública A\n\nTexto visible para el invitado."], ["Pub/sub/b.md", "# Pública B"], ["Priv/c.md", "# SECRETO PRIVADO"], ["raiz.md", "# SECRETO RAIZ"]]) {
      notes[path] = await call(`/vaults/${vault}/notes`, owner.cookie, "POST", { path, content });
    }
    const member = await call<{ id: string }>(`/vaults/${vault}/members`, owner.cookie, "POST", { email: guest.email, grants: [{ folder: "Pub", level: "lectura" }] });
    await call(`/invitations/${member.id}/accept`, guest.cookie, "POST");

    const context = await newSession(browser, guest, { theme, size, touch: mobile });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

    // Se abre desde «Compartidas conmigo».
    await page.goto("/compartidas");
    await page.getByRole("link", { name: "Abrir «Plan estratégico compartido»" }).click();
    await expect(page).toHaveURL(new RegExp(`/compartidas/${vault}$`));

    // Con la barra lateral abierta (en celular está plegada).
    if (mobile) await page.getByRole("button", { name: /barra de notas/i }).first().click();
    const tree = page.getByRole("tree", { name: "Notas" });
    await expect(tree.getByRole("treeitem", { name: /Pub/ }).first()).toBeVisible({ timeout: 20_000 });
    // Solo lo que cubre la concesión: ni `Priv`, ni la nota de la raíz, ni las zonas del sistema.
    await expect(tree.getByText("Priv", { exact: true })).toHaveCount(0);
    await expect(tree.getByText(/raiz/i)).toHaveCount(0);
    await expect(tree.getByText(/AG - |BITACORA/)).toHaveCount(0);
    await shot(page, `h064-f7c-${label}-1-arbol`);

    // Abre una nota y la lee.
    await tree.getByRole("treeitem", { name: /Pub/ }).first().click();
    // En celular, abrir una carpeta muestra su índice y pliega la barra lateral.
    if (mobile) await page.getByRole("button", { name: "Mostrar la barra de notas" }).click();
    await tree.getByRole("treeitem", { name: /a\.md|^a$/ }).first().click();
    await expect(page.getByText("Texto visible para el invitado.")).toBeVisible();
    await shot(page, `h064-f7c-${label}-2-nota`);

    // Lo que no puede leer no llega al navegador: ni en el DOM ni en la réplica local.
    expect(await page.content()).not.toContain("SECRETO");
    const replicated = await page.evaluate(async (id) => {
      const dbs = (await indexedDB.databases?.()) ?? [];
      return dbs.map((d) => d.name).filter((n): n is string => !!n && n.includes(`synapse-shared-${id}`));
    }, vault);
    expect(replicated.length).toBe(1);

    // Sin conexión sigue leyendo lo que ya tiene.
    await context.setOffline(true);
    await expect(page.getByText("Texto visible para el invitado.")).toBeVisible();
    await context.setOffline(false);

    // Lo que el propietario cambia llega a la réplica del invitado.
    const etag = (await fetch(`${base()}/vaults/${vault}/notes/${notes["Pub/a.md"].id}`, { headers: { Cookie: owner.cookie } })).headers.get("ETag")!;
    await call(`/vaults/${vault}/notes/${notes["Pub/a.md"].id}`, owner.cookie, "PATCH", { content: "# Pública A\n\nTexto NUEVO del propietario." }, { "If-Match": etag });
    await expect(page.getByText("Texto NUEVO del propietario.")).toBeVisible({ timeout: 30_000 });

    expect(errors.filter((e) => !/favicon|net::ERR|Failed to load resource/.test(e))).toEqual([]);
    await context.close();
  });
}
