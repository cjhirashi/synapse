// H-064 F7d: un invitado con escritura en `Docs` y solo lectura en `Pub` crea y edita notas por la interfaz (también sin conexión);
// lo escrito llega al propietario y nada se escribe donde no hay concesión. La interfaz no ofrece lo que se rechazaría.
import type { Page } from "@playwright/test";
import { createUser, createVault, expect, newSession, shot, test } from "./fixtures";

const base = () => process.env.BASE_URL ?? "http://127.0.0.1:8010";

async function call<T = unknown>(path: string, cookie: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(base() + path, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

interface Summary { id: string; path: string }
interface Note { id: string; path: string; content: string }

async function ownerNote(cookie: string, vault: string, path: string): Promise<Note | null> {
  const { items } = await call<{ items: Summary[] }>(`/vaults/${vault}/notes?limit=200`, cookie);
  const found = items.find((n) => n.path === path);
  return found ? call<Note>(`/vaults/${vault}/notes/${found.id}`, cookie) : null;
}

/** Entra en edición, pasa a la vista de código, reemplaza el contenido y guarda. */
async function overwrite(page: Page, content: string) {
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByRole("button", { name: "Código", exact: true }).click();
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(content);
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("button", { name: "Guardar" })).toBeDisabled();
}

test("H-064 F7d: el invitado escribe solo donde su concesión lo permite", async ({ browser }) => {
  const owner = await createUser();
  const guest = await createUser();
  const vault = await createVault(owner.cookie, "Plan con escritura parcial");
  for (const [path, content] of [["Docs/a.md", "# A\n\noriginal A"], ["Docs/Sub/b.md", "# B\n\noriginal B"], ["Pub/p.md", "# P\n\noriginal P"]]) {
    await call(`/vaults/${vault}/notes`, owner.cookie, "POST", { path, content });
  }
  const member = await call<{ id: string }>(`/vaults/${vault}/members`, owner.cookie, "POST", { email: guest.email, grants: [{ folder: "Pub", level: "lectura" }, { folder: "Docs", level: "escritura" }] });
  await call(`/invitations/${member.id}/accept`, guest.cookie, "POST");

  const context = await newSession(browser, guest, { theme: "dark", size: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`/compartidas/${vault}`);

  const tree = page.getByRole("tree", { name: "Notas" });
  await expect(tree.getByRole("treeitem", { name: /Docs/ }).first()).toBeVisible({ timeout: 20_000 });
  const open = async (folder: string, note: string) => {
    const row = tree.getByRole("treeitem", { name: new RegExp(`^${note}$|^${note}\\.md`) }).first();
    if (!(await row.isVisible())) await tree.getByRole("treeitem", { name: new RegExp(folder) }).first().click();
    await row.click();
  };

  // --- Donde solo lee: ni editar, ni borrar, ni crear, ni atajos ---
  await tree.getByRole("treeitem", { name: /Pub/ }).first().click();
  await expect(page.getByRole("button", { name: "Nueva nota en Pub" })).toBeDisabled();
  await open("Pub", "p");
  await expect(page.getByText("original P")).toBeVisible();
  await expect(page.getByRole("button", { name: "Editar", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Opciones de la nota" }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["Copiar ruta"]);
  await page.keyboard.press("Escape");
  await tree.getByRole("treeitem", { name: /^p$|^p\.md/ }).first().click();
  await page.keyboard.press("Delete");
  await page.keyboard.press("F2");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Nueva carpeta/ })).toHaveCount(0);
  await shot(page, "h064-f7d-1-solo-lectura");

  // --- Donde escribe: edita una nota existente ---
  await open("Docs", "a");
  await expect(page.getByText("original A")).toBeVisible();
  await page.getByRole("button", { name: "Opciones de la nota" }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["Copiar ruta", "Ver en Código", "Borrar"]);
  await page.keyboard.press("Escape");
  await overwrite(page, "# A\n\neditada por el invitado");
  await expect.poll(async () => (await ownerNote(owner.cookie, vault, "Docs/a.md"))?.content, { timeout: 30_000 }).toBe("# A\n\neditada por el invitado");
  await shot(page, "h064-f7d-2-editada");

  // --- Crea una nota nueva en su carpeta ---
  await tree.getByRole("treeitem", { name: /^Docs/ }).first().click();
  await page.getByRole("button", { name: /^Nueva nota en Docs/ }).click();
  await page.getByLabel("Título de la nota nueva (opcional)").fill("Del invitado");
  await page.getByRole("button", { name: "Crear nota", exact: true }).click();
  await page.getByRole("button", { name: "Código", exact: true }).click();
  await page.locator(".cm-content").click();
  await page.keyboard.insertText("# Del invitado\n\ncreada desde su navegador");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("button", { name: "Guardar" })).toBeDisabled();
  await expect.poll(async () => (await ownerNote(owner.cookie, vault, "Docs/Del invitado.md"))?.content, { timeout: 30_000 }).toContain("creada desde su navegador");
  await shot(page, "h064-f7d-3-creada");

  // --- Sin conexión: edita, y al volver llega ---
  await page.getByRole("button", { name: "Leer" }).click().catch(() => undefined);
  await tree.getByRole("treeitem", { name: /^Sub/ }).first().click();
  await open("Docs", "b");
  await expect(page.getByText("original B")).toBeVisible();
  await context.setOffline(true);
  await overwrite(page, "# B\n\neditada sin conexión");
  expect((await ownerNote(owner.cookie, vault, "Docs/Sub/b.md"))?.content).toBe("# B\n\noriginal B");
  await context.setOffline(false);
  await expect.poll(async () => (await ownerNote(owner.cookie, vault, "Docs/Sub/b.md"))?.content, { timeout: 40_000 }).toBe("# B\n\neditada sin conexión");

  // --- Lo que no debía pasar no pasó ---
  expect((await ownerNote(owner.cookie, vault, "Pub/p.md"))?.content).toBe("# P\n\noriginal P");
  const { items } = await call<{ items: Summary[] }>(`/vaults/${vault}/notes?limit=200`, owner.cookie);
  const content = items.map((n) => n.path).filter((p) => !/INDICE\.md$|^(BITACORA|AG - |PLANTILLAS)/.test(p)).sort();
  expect(content).toEqual(["Docs/Del invitado.md", "Docs/Sub/b.md", "Docs/a.md", "Pub/p.md"]);
  // La autoría consta a nombre del invitado en la BITACORA del propietario.
  const log = items.find((n) => n.path.startsWith("BITACORA/") && !n.path.endsWith("INDICE.md"));
  const day = await call<Note>(`/vaults/${vault}/notes/${log!.id}`, owner.cookie);
  const byGuest = day.content.split("\n").filter((line) => line.startsWith("- ") && line.includes(`${guest.email} (usuario)`) && /· (edición|creación) /.test(line));
  expect(byGuest.some((line) => line.includes("`Docs/a.md`") && line.includes("edición"))).toBe(true);
  expect(byGuest.some((line) => line.includes("`Docs/Del invitado.md`") && line.includes("creación"))).toBe(true);
  expect(byGuest.some((line) => line.includes("`Docs/Sub/b.md`") && line.includes("edición"))).toBe(true);
  expect(byGuest.filter((line) => line.includes("`Pub/"))).toEqual([]);
  await expect(page.getByText(/rechaz|No se pudo/i)).toHaveCount(0);
  expect(errors.filter((e) => !/favicon|net::ERR|Failed to load resource/.test(e))).toEqual([]);
  await context.close();
});
