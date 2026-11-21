// H-064 F6, aceptación de punta a punta con tres cuentas y un agente en Chromium real: el propietario invita por el diálogo, el lector y el
// editor aceptan por «Compartidas conmigo», cada uno ve y escribe solo lo suyo, el agente del editor queda acotado a las concesiones de su
// persona, la BITACORA nombra a quien escribió, revocar corta el acceso y las bóvedas no compartidas siguen igual.
import type { Page } from "@playwright/test";
import { createUser, createVault, expect, MOBILE, newSession, shot, test, waitForSynced, type Size, type Theme } from "./fixtures";

const base = () => process.env.BASE_URL ?? "http://127.0.0.1:8010";

async function call<T = unknown>(path: string, cookie: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(base() + path, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** Petición con la clave de un agente (Bearer); devuelve el estado y el cuerpo sin lanzar. */
async function asAgent(key: string, path: string, method = "GET", body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(base() + path, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => null) };
}

interface Summary { id: string; path: string }
interface Note { id: string; path: string; content: string }

async function ownerNote(cookie: string, vault: string, path: string): Promise<Note | null> {
  const { items } = await call<{ items: Summary[] }>(`/vaults/${vault}/notes?limit=200`, cookie);
  const found = items.find((n) => n.path === path);
  return found ? call<Note>(`/vaults/${vault}/notes/${found.id}`, cookie) : null;
}

async function overwrite(page: Page, content: string) {
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByRole("button", { name: "Código", exact: true }).click();
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(content);
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("button", { name: "Guardar" })).toBeDisabled();
}

/** En celular la barra de notas está plegada: se muestra antes de usar el árbol. */
async function showTree(page: Page, mobile: boolean) {
  if (mobile) await page.getByRole("button", { name: /barra de notas/i }).first().click();
  return page.getByRole("tree", { name: "Notas" });
}

/** Abre una nota por el árbol; en celular el árbol se pliega al elegir y se vuelve a mostrar si hace falta. */
async function openIn(page: Page, mobile: boolean, folder: string, note: string) {
  const tree = page.getByRole("tree", { name: "Notas" });
  const reveal = async () => {
    if (mobile && !(await tree.isVisible())) await page.getByRole("button", { name: /barra de notas/i }).first().click();
  };
  await reveal();
  const row = tree.getByRole("treeitem", { name: new RegExp(`^${note}$|^${note}\\.md`) }).first();
  if (!(await row.isVisible())) {
    await tree.getByRole("treeitem", { name: new RegExp(`^${folder}`) }).first().click();
    await reveal();
  }
  await row.click();
}

const VAULT_NAME = "Acuerdo trimestral de operaciones";
const CASES: Array<{ label: string; size: Size; theme: Theme }> = [
  { label: "1280-dark", size: { width: 1280, height: 900 }, theme: "dark" },
  { label: "390-light", size: MOBILE, theme: "light" },
];

for (const { label, size, theme } of CASES) {
  test(`H-064 F6: aceptación con tres cuentas y un agente a ${label}`, async ({ browser }) => {
    test.setTimeout(180_000);
    const mobile = size.width <= 640;
    const owner = await createUser({ canShare: true });
    const reader = await createUser();
    const editor = await createUser();
    const vault = await createVault(owner.cookie, VAULT_NAME);
    for (const [path, content] of [["Docs/a.md", "# A\n\noriginal A"], ["Pub/p.md", "# P\n\noriginal P"], ["Priv/s.md", "# S\n\nsecreto del propietario"]]) {
      await call(`/vaults/${vault}/notes`, owner.cookie, "POST", { path, content });
    }
    const own = await createVault(owner.cookie, "Mi bóveda sin compartir");
    await call(`/vaults/${own}/notes`, owner.cookie, "POST", { path: "Diario/hoy.md", content: "# Hoy\n\nnadie más la ve" });

    // --- 1. El propietario invita a dos personas por el diálogo ---
    const ownerContext = await newSession(browser, owner, { theme, size, touch: mobile });
    const ownerPage = await ownerContext.newPage();
    const errors: string[] = [];
    for (const page of [ownerPage]) page.on("pageerror", (e) => errors.push(e.message));
    await ownerPage.goto(`/vaults/${vault}`);
    await waitForSynced(ownerPage);
    await ownerPage.getByRole("button", { name: "Compartir esta bóveda" }).click();
    const dialog = ownerPage.getByRole("dialog");
    const invite = dialog.locator(".share-invite-form");

    await dialog.getByLabel("Correo de la persona").fill(reader.email);
    await invite.getByRole("radio", { name: "Personalizado" }).check({ force: true });
    await invite.getByLabel("Carpeta").selectOption("Pub");
    await invite.getByLabel("Acceso").selectOption("lectura");
    await invite.getByRole("button", { name: "Invitar", exact: true }).click();
    await expect(dialog.getByRole("status")).toContainText(`Invitación enviada a ${reader.email}`);

    await dialog.getByLabel("Correo de la persona").fill(editor.email);
    await invite.getByRole("radio", { name: "Personalizado" }).check({ force: true });
    await invite.getByLabel("Carpeta").selectOption("Docs");
    await invite.getByLabel("Acceso").selectOption("escritura");
    await invite.getByRole("button", { name: "Agregar carpeta" }).click();
    await invite.getByLabel("Carpeta").nth(1).selectOption("Pub");
    await invite.getByLabel("Acceso").nth(1).selectOption("lectura");
    await invite.getByRole("button", { name: "Invitar", exact: true }).click();
    await expect(dialog.getByRole("status")).toContainText(`Invitación enviada a ${editor.email}`);
    await expect(dialog.locator(".share-member")).toHaveCount(2);
    await shot(ownerPage, `h064f6-${label}-1-invitados`);
    await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();

    // --- 2. Cada persona acepta por «Compartidas conmigo» ---
    const readerContext = await newSession(browser, reader, { theme, size, touch: mobile });
    const readerPage = await readerContext.newPage();
    const editorContext = await newSession(browser, editor, { theme, size, touch: mobile });
    const editorPage = await editorContext.newPage();
    for (const page of [readerPage, editorPage]) {
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => m.type() === "error" && !/favicon|net::ERR|Failed to load resource/.test(m.text()) && errors.push(m.text()));
      await page.goto("/compartidas");
      await page.getByRole("button", { name: `Aceptar invitación a «${VAULT_NAME}»` }).click();
      await expect(page.locator(".shared-page > p[role=status]")).toContainText("Aceptaste la invitación");
    }
    await shot(editorPage, `h064f6-${label}-2-aceptada`);

    // --- 3. El lector ve solo Pub y no puede escribir ---
    await readerPage.goto(`/compartidas/${vault}`);
    const readerTree = await showTree(readerPage, mobile);
    await expect(readerTree.getByRole("treeitem", { name: /Pub/ }).first()).toBeVisible({ timeout: 20_000 });
    await expect(readerTree.getByRole("treeitem", { name: /Docs/ })).toHaveCount(0);
    await expect(readerTree.getByRole("treeitem", { name: /Priv/ })).toHaveCount(0);
    await openIn(readerPage, mobile, "Pub", "p");
    await expect(readerPage.getByText("original P")).toBeVisible();
    await expect(readerPage.getByRole("button", { name: "Editar", exact: true })).toHaveCount(0);
    await shot(readerPage, `h064f6-${label}-3-lector`);
    // El servidor tampoco le deja escribir ni leer lo que no es suyo.
    const listed = await call<{ items: Summary[] }>(`/vaults/${vault}/notes?limit=200`, reader.cookie);
    expect(listed.items.map((n) => n.path).filter((p) => !/INDICE\.md$|^PLANTILLAS\//.test(p))).toEqual(["Pub/p.md"]); // PLANTILLAS la leen todos los miembros por diseño
    await expect(call(`/vaults/${vault}/notes`, reader.cookie, "POST", { path: "Pub/nuevo.md", content: "x" })).rejects.toThrow(/→ 40[34]/);

    // --- 4. El editor escribe en Docs y lo recibe el propietario ---
    await editorPage.goto(`/compartidas/${vault}`);
    const editorTree = await showTree(editorPage, mobile);
    await expect(editorTree.getByRole("treeitem", { name: /Docs/ }).first()).toBeVisible({ timeout: 20_000 });
    await expect(editorTree.getByRole("treeitem", { name: /Priv/ })).toHaveCount(0);
    await openIn(editorPage, mobile, "Docs", "a");
    await expect(editorPage.getByText("original A")).toBeVisible();
    await overwrite(editorPage, "# A\n\neditada por el editor");
    await expect.poll(async () => (await ownerNote(owner.cookie, vault, "Docs/a.md"))?.content, { timeout: 30_000 }).toBe("# A\n\neditada por el editor");
    await shot(editorPage, `h064f6-${label}-4-editor`);

    // --- 5. El agente del editor: techo = concesiones de su persona ---
    const created = await call<{ key: string }>("/auth/agent-keys", editor.cookie, "POST", { label: "op-aira", agent_id: "aira" });
    const invitations = await asAgent(created.key, "/invitations?status=activo");
    expect(invitations.status).toBe(200);
    expect(invitations.json.items.map((i: { vault_id: string }) => i.vault_id)).toEqual([vault]);
    expect((await asAgent(created.key, `/vaults/${vault}/notes`, "POST", { path: "Docs/agente.md", content: "# Agente\n\nescrita por el agente" })).status).toBe(201);
    for (const path of ["Pub/agente.md", "Priv/agente.md"]) {
      const denied = await asAgent(created.key, `/vaults/${vault}/notes`, "POST", { path, content: "no debe entrar" });
      expect(denied.status, path).toBeGreaterThanOrEqual(400);
    }
    expect((await asAgent(created.key, `/invitations/${(await call<{ items: Array<{ id: string }> }>("/invitations", editor.cookie)).items[0]?.id ?? "x"}/accept`, "POST")).status).toBeGreaterThanOrEqual(400);
    expect(await ownerNote(owner.cookie, vault, "Pub/agente.md")).toBeNull();
    expect(await ownerNote(owner.cookie, vault, "Priv/agente.md")).toBeNull();
    expect((await ownerNote(owner.cookie, vault, "Priv/s.md"))?.content).toContain("secreto del propietario");

    // --- 6. La BITACORA del propietario nombra a quien escribió ---
    const { items } = await call<{ items: Summary[] }>(`/vaults/${vault}/notes?limit=200`, owner.cookie);
    const log = items.find((n) => n.path.startsWith("BITACORA/") && !n.path.endsWith("INDICE.md"));
    const day = await call<Note>(`/vaults/${vault}/notes/${log!.id}`, owner.cookie);
    const lines = day.content.split("\n").filter((l) => l.startsWith("- "));
    expect(lines.some((l) => l.includes(`${editor.email} (usuario)`) && l.includes("`Docs/a.md`"))).toBe(true);
    expect(lines.some((l) => l.includes(`aira (de ${editor.email}) (agente)`) && l.includes("`Docs/agente.md`"))).toBe(true);
    expect(lines.some((l) => l.includes(`${reader.email} (usuario)`) && /· (edición|creación) /.test(l))).toBe(false);

    // --- 7. El propietario revoca al lector y la bóveda desaparece para él ---
    await ownerPage.getByRole("button", { name: "Compartir esta bóveda" }).click();
    const dialog2 = ownerPage.getByRole("dialog");
    const readerCard = dialog2.locator(".share-member", { hasText: reader.email });
    await readerCard.getByRole("button", { name: /Quitar acceso|Revocar/ }).click();
    await readerCard.getByRole("button", { name: "Quitar", exact: true }).click();
    await expect(dialog2.locator(".share-member", { hasText: reader.email })).toHaveCount(0);
    await shot(ownerPage, `h064f6-${label}-5-revocado`);
    await dialog2.getByRole("button", { name: "Cerrar", exact: true }).click();
    await expect(call(`/vaults/${vault}/notes`, reader.cookie)).rejects.toThrow(/→ 404/);
    await readerPage.goto("/compartidas");
    await expect(readerPage.getByRole("heading", { name: "Compartidas conmigo", level: 1 })).toBeVisible();
    await expect(readerPage.locator(".shared-title", { hasText: VAULT_NAME })).toHaveCount(0);
    await shot(readerPage, `h064f6-${label}-6-lector-sin-acceso`);

    // --- 8. Las bóvedas no compartidas siguen igual ---
    await expect(call(`/vaults/${own}/notes`, editor.cookie)).rejects.toThrow(/→ 404/);
    expect((await ownerNote(owner.cookie, own, "Diario/hoy.md"))?.content).toContain("nadie más la ve");
    const readersOwn = await createVault(reader.cookie, "Bóveda propia del lector");
    await call(`/vaults/${readersOwn}/notes`, reader.cookie, "POST", { path: "x.md", content: "# X" });
    expect((await ownerNote(reader.cookie, readersOwn, "x.md"))?.content).toBe("# X");
    await ownerPage.goto(`/vaults/${own}`);
    await waitForSynced(ownerPage);
    await expect(ownerPage.getByRole("heading", { name: "Mi bóveda sin compartir" }).first()).toBeVisible();

    expect(errors).toEqual([]);
    await Promise.all([ownerContext.close(), readerContext.close(), editorContext.close()]);
  });
}
