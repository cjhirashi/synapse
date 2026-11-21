// H-064 F7e: el propietario cambia lo que el invitado puede ver o escribir mientras éste tiene la bóveda abierta (ampliar, reducir,
// mover una nota fuera de lo legible, quitar el acceso, salir) y la copia local del invitado se pone al día o se destruye.
import type { Page } from "@playwright/test";
import { createUser, createVault, expect, newSession, shot, test } from "./fixtures";

const base = () => process.env.BASE_URL ?? "http://127.0.0.1:8010";

async function call<T = unknown>(path: string, cookie: string, method = "GET", body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(base() + path, { method, headers: { "Content-Type": "application/json", Cookie: cookie, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

interface Summary { id: string; path: string }
interface Note { id: string; path: string; content: string }
const listNotes = async (cookie: string, vault: string) => (await call<{ items: Summary[] }>(`/vaults/${vault}/notes?limit=200`, cookie)).items;
async function ownerNote(cookie: string, vault: string, path: string): Promise<Note | null> {
  const found = (await listNotes(cookie, vault)).find((n) => n.path === path);
  return found ? call<Note>(`/vaults/${vault}/notes/${found.id}`, cookie) : null;
}

/** Bases locales de este navegador que son réplicas de bóvedas compartidas. */
const sharedReplicas = (page: Page) =>
  page.evaluate(async () => ((await indexedDB.databases?.()) ?? []).map((d) => d.name ?? "").filter((n) => n.includes("synapse-shared-")));

/** Hace que la página compruebe su acceso ya, sin esperar al sondeo de 30 s. */
const recheck = (page: Page) => page.evaluate(() => void window.dispatchEvent(new Event("focus")));

async function seed() {
  const owner = await createUser({ canShare: true });
  const guest = await createUser();
  const vault = await createVault(owner.cookie, "Plan que cambia de permisos");
  const notes: Record<string, Summary> = {};
  for (const [path, content] of [["Docs/a.md", "# A\n\noriginal A"], ["Pub/p.md", "# P\n\noriginal P"], ["Priv/x.md", "# X\n\noriginal X"]]) {
    notes[path] = await call<Summary>(`/vaults/${vault}/notes`, owner.cookie, "POST", { path, content });
  }
  const grants = (extra: Array<{ folder: string; level: string }> = [], docs = "escritura") => [{ folder: "Pub", level: "lectura" }, { folder: "Docs", level: docs }, ...extra];
  const member = await call<{ id: string }>(`/vaults/${vault}/members`, owner.cookie, "POST", { email: guest.email, grants: grants() });
  await call(`/invitations/${member.id}/accept`, guest.cookie, "POST");
  const setGrants = (list: Array<{ folder: string; level: string }>) => call(`/vaults/${vault}/members/${member.id}/grants`, owner.cookie, "PUT", { grants: list });
  return { owner, guest, vault, notes, member, grants, setGrants };
}

test("H-064 F7e: ampliar, reducir y mover mientras el invitado tiene la bóveda abierta", async ({ browser }) => {
  const { owner, guest, vault, notes, grants, setGrants } = await seed();
  const context = await newSession(browser, guest, { theme: "dark", size: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`/compartidas/${vault}`);
  const tree = page.getByRole("tree", { name: "Notas" });
  const row = (name: string) => tree.getByRole("treeitem", { name: new RegExp(`^${name}`) }).first();
  await expect(row("Docs")).toBeVisible({ timeout: 20_000 });
  await expect(row("Pub")).toBeVisible();
  await expect(row("Priv")).toHaveCount(0);

  // Ampliar: lo que ya existía en `Priv` llega aunque nadie lo haya cambiado (el feed de cambios no lo emitiría).
  await setGrants(grants([{ folder: "Priv", level: "lectura" }]));
  await recheck(page);
  await expect(row("Priv")).toBeVisible({ timeout: 40_000 });
  await shot(page, "h064-f7e-1-ampliado");

  // Reducir: lo que ya no puede leer desaparece de su copia local.
  await setGrants(grants());
  await recheck(page);
  await expect(row("Priv")).toHaveCount(0, { timeout: 40_000 });
  await expect(row("Pub")).toBeVisible();

  // Mover una nota legible a una carpeta que no lee: su copia vieja no se queda.
  await row("Pub").click();
  await expect(tree.getByRole("treeitem", { name: /^p$|^p\.md/ })).toBeVisible();
  const etag = (await fetch(`${base()}/vaults/${vault}/notes/${notes["Pub/p.md"].id}`, { headers: { Cookie: owner.cookie } })).headers.get("ETag")!;
  await call(`/vaults/${vault}/notes/${notes["Pub/p.md"].id}`, owner.cookie, "PATCH", { path: "Priv/p.md" }, { "If-Match": etag });
  await recheck(page);
  await expect(tree.getByRole("treeitem", { name: /^p$|^p\.md/ })).toHaveCount(0, { timeout: 40_000 });
  await shot(page, "h064-f7e-2-movida");

  expect(errors.filter((e) => !/favicon|net::ERR|Failed to load resource/.test(e))).toEqual([]);
  await context.close();
});

test("H-064 F7e: lo que el invitado editó sin conexión y ya no puede escribir se descarta con aviso, sin tocar al propietario", async ({ browser }) => {
  const { owner, guest, vault, grants, setGrants } = await seed();
  const context = await newSession(browser, guest, { theme: "dark", size: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`/compartidas/${vault}`);
  const tree = page.getByRole("tree", { name: "Notas" });
  await expect(tree.getByRole("treeitem", { name: /^Docs/ }).first()).toBeVisible({ timeout: 20_000 });
  await tree.getByRole("treeitem", { name: /^Docs/ }).first().click();
  await tree.getByRole("treeitem", { name: /^a$|^a\.md/ }).first().click();
  await expect(page.getByText("original A")).toBeVisible();

  // Edita sin conexión…
  await context.setOffline(true);
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByRole("button", { name: "Código", exact: true }).click();
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText("# A\n\neditada sin conexión, antes de perder el permiso");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("button", { name: "Guardar" })).toBeDisabled();
  // …mientras el propietario le quita la escritura en `Docs`.
  await setGrants(grants([], "lectura"));
  await context.setOffline(false);
  await recheck(page);

  // Se avisa de lo descartado (o, si el replicador llegó antes, queda a la vista como rechazado) y el propietario no recibe nada.
  const notice = page.getByText(/Se descartó 1 cambio tuyo/).or(page.getByRole("link", { name: /rechazad/i })).or(page.getByText(/rechazad/i)).first();
  await expect(notice).toBeVisible({ timeout: 40_000 });
  // Tras reconstruir, la bóveda vuelve a mostrarse completa (sin «no existe» pegado) y con lo del propietario.
  await expect(page.getByText("Esta bóveda no existe")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByRole("tree", { name: "Notas" }).getByRole("treeitem", { name: /^Docs/ }).first()).toBeVisible({ timeout: 30_000 });
  await shot(page, "h064-f7e-3-descartado");
  expect((await ownerNote(owner.cookie, vault, "Docs/a.md"))?.content).toBe("# A\n\noriginal A");
  await context.close();
});

test("H-064 F7e: si el propietario le quita el acceso, el invitado lo ve y su copia local se destruye", async ({ browser }) => {
  const { guest, vault, owner, member } = await seed();
  const context = await newSession(browser, guest, { theme: "dark", size: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`/compartidas/${vault}`);
  await expect(page.getByRole("tree", { name: "Notas" }).getByRole("treeitem", { name: /^Docs/ }).first()).toBeVisible({ timeout: 20_000 });
  expect(await sharedReplicas(page)).toHaveLength(1);

  await call(`/vaults/${vault}/members/${member.id}`, owner.cookie, "DELETE");
  await recheck(page);
  await expect(page.getByText(/Esta bóveda ya no está disponible/)).toBeVisible({ timeout: 40_000 });
  await expect.poll(() => sharedReplicas(page), { timeout: 40_000 }).toEqual([]);
  await shot(page, "h064-f7e-4-revocada");
  await page.getByRole("link", { name: "Volver a Compartidas conmigo" }).click();
  await expect(page.getByText("Plan que cambia de permisos")).toHaveCount(0);
  await context.close();
});

test("H-064 F7e: al salir de una bóveda compartida su copia local se destruye", async ({ browser }) => {
  const { guest, vault } = await seed();
  const context = await newSession(browser, guest, { theme: "dark", size: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`/compartidas/${vault}`);
  await expect(page.getByRole("tree", { name: "Notas" }).getByRole("treeitem", { name: /^Docs/ }).first()).toBeVisible({ timeout: 20_000 });
  expect(await sharedReplicas(page)).toHaveLength(1);

  await page.goto("/compartidas");
  await page.getByRole("button", { name: "Salir de «Plan que cambia de permisos»" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Salir", exact: true }).click();
  await expect(page.getByText(/Saliste de/)).toBeVisible();
  await expect.poll(() => sharedReplicas(page), { timeout: 40_000 }).toEqual([]);
  await context.close();
});
