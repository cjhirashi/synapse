// H-064 F7c-2: la interfaz de un invitado que solo lee no ofrece nada que el servidor rechazaría. Recorre cada pestaña de la bóveda
// compartida y falla listando cualquier control de escritura o del propietario que siga visible.
import type { Page } from "@playwright/test";
import { createUser, createVault, expect, newSession, shot, test } from "./fixtures";

const base = () => process.env.BASE_URL ?? "http://127.0.0.1:8010";

async function call<T = unknown>(path: string, cookie: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(base() + path, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** Nombres que no debe ofrecer un lector (de escritura o del propietario). */
const FORBIDDEN = /^(nueva|nuevo|compartir|editar|renombrar|borrar|eliminar|papelera|publicar|exportar|pdf|subir|guardar|mover|añadir|agregar|crear|duplicar|restaurar|cambiar)/i;

/** Controles visibles con nombre accesible (botones, enlaces, ítems de menú, campos de texto) que un lector no debería ver. */
async function writeControls(page: Page): Promise<string[]> {
  return page.evaluate((source: string) => {
    const forbidden = new RegExp(source, "i");
    const visible = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      const style = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const name = (el: Element) => (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim().replace(/\s+/g, " ");
    const found: string[] = [];
    for (const el of document.querySelectorAll("button, a[href], [role=menuitem], [role=tab], input:not([type=hidden]), textarea, [contenteditable=true]")) {
      if (!visible(el)) continue;
      // La navegación global de la app (riel y barra superior) es de todos.
      if (el.closest("nav[aria-label='Bóvedas abiertas'], header, [role=banner], .vault-rail")) continue;
      const label = name(el);
      if (el.matches("input, textarea, [contenteditable=true]")) {
        if (!["checkbox", "radio", "range", "file", "button"].includes((el as HTMLInputElement).type) && !(el as HTMLInputElement).readOnly && !(el as HTMLInputElement).disabled && !el.closest("[role=search], .tag-filter")) found.push(`${el.tagName.toLowerCase()}[${el.getAttribute("type") ?? ""}] editable «${label || el.getAttribute("placeholder") || el.id}» .${el.className}`);
      } else if (label && forbidden.test(label)) {
        found.push(`${el.tagName.toLowerCase()} «${label.slice(0, 60)}»`);
      }
    }
    return found;
  }, FORBIDDEN.source);
}

test("H-064 F7c-2: un invitado que solo lee no ve controles de escritura en ninguna pestaña", async ({ browser }) => {
  const owner = await createUser({ canShare: true });
  const guest = await createUser();
  const vault = await createVault(owner.cookie, "Plan compartido de solo lectura");
  await call(`/vaults/${vault}/notes`, owner.cookie, "POST", { path: "Pub/a.md", content: "# Pública A\n\nTexto para leer." });
  await call(`/vaults/${vault}/notes`, owner.cookie, "POST", { path: "Pub/sub/b.md", content: "# Pública B" });
  await call(`/vaults/${vault}/tasks`, owner.cookie, "POST", { title: "Tarea visible para el lector", path: "Pub" });
  const member = await call<{ id: string }>(`/vaults/${vault}/members`, owner.cookie, "POST", { email: guest.email, grants: [{ folder: "Pub", level: "lectura" }] });
  await call(`/invitations/${member.id}/accept`, guest.cookie, "POST");

  const context = await newSession(browser, guest, { theme: "dark", size: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`/compartidas/${vault}`);

  const tree = page.getByRole("tree", { name: "Notas" });
  await expect(tree.getByRole("treeitem", { name: /Pub/ }).first()).toBeVisible({ timeout: 20_000 });
  await tree.getByRole("treeitem", { name: /Pub/ }).first().click();
  await tree.getByRole("treeitem", { name: /^a$|a\.md/ }).first().click();
  await expect(page.getByText("Texto para leer.")).toBeVisible();

  const leaks: Record<string, string[]> = {};
  const check = async (label: string) => {
    await shot(page, `h064-f7c2-${label}`);
    const found = await writeControls(page);
    if (found.length) leaks[label] = found;
  };
  await check("1-nota");

  // El índice de una carpeta.
  await page.getByText("Índice de Pub", { exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Índice de Pub" })).toBeVisible();
  await check("2-indice");

  // Cada pestaña de la barra lateral.
  const tabs = page.getByRole("tablist", { name: "Contenido de la bóveda" });
  await expect(tabs.getByRole("tab", { name: "Publicados" })).toHaveCount(0);
  for (const name of ["Filtro por tags", "Archivos", "Tareas", "Documentos"]) {
    await tabs.getByRole("tab", { name }).click();
    await page.waitForTimeout(600);
    await check(`3-${name.toLowerCase().replace(/ /g, "-")}`);
    // Sin invitaciones a subir ni cuadros vacíos que invitan a escribir.
    await expect(page.getByText(/Súbelos|arrástralos aquí/)).toHaveCount(0);
    await expect(page.locator("#index-description")).toHaveCount(0);
  }

  // La tarea se ve (lectura) pero no se puede tocar.
  await tabs.getByRole("tab", { name: "Tareas" }).click();
  await expect(page.getByText("Tarea visible para el lector").first()).toBeVisible();

  expect(leaks).toEqual({});
  expect(errors.filter((e) => !/favicon|net::ERR|Failed to load resource/.test(e))).toEqual([]);
  await context.close();
});
