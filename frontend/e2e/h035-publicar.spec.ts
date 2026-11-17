// H-035 fase 3: publicar un documento desde la app en navegador real (celular y escritorio): botón, revisión de recursos, confirmación, enlace,
// página pública sin sesión, «desactualizada» y republicar con la misma URL, y despublicar (el enlace muere; al volver a publicar es otro).
import type { Page } from "@playwright/test";
import { expect, MOBILE, newSession, shot, test, waitForSynced, waitForVaults } from "./fixtures";

const origin = () => process.env.BASE_URL ?? "http://127.0.0.1:8010";

// API REST con la sesión del usuario (las cookies seguras no viajan por `context.request` sobre http).
async function session(user: { email: string; password: string }) {
  const login = await fetch(`${origin()}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: user.email, password: user.password }),
  });
  const cookie = login.headers.getSetCookie().map((line) => line.split(";")[0]).join("; ");
  return async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(`${origin()}${path}`, {
      method, headers: { "Content-Type": "application/json", Cookie: cookie, ...headers }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, etag: res.headers.get("etag"), text, json: () => JSON.parse(text) as any };
  };
}

async function openDoc(page: Page, folder: string, name: string) {
  const show = page.getByRole("button", { name: "Mostrar la barra de notas" });
  if (await show.isVisible()) await show.click();
  const tree = page.getByRole("tree", { name: "Notas" });
  await expect(async () => {
    const again = page.getByRole("button", { name: "Mostrar la barra de notas" });
    if (await again.isVisible()) await again.click();
    await expect(tree.getByRole("treeitem", { name: folder, exact: true })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await tree.getByRole("treeitem", { name: folder, exact: true }).click();
  const row = tree.getByRole("treeitem", { name, exact: true });
  // En celular elegir una carpeta cierra la barra: se vuelve a abrir hasta ver el documento.
  await expect(async () => {
    const again = page.getByRole("button", { name: "Mostrar la barra de notas" });
    if (await again.isVisible()) await again.click();
    await expect(row).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });
  await row.focus();
  await page.keyboard.press("Enter");
}

for (const { label, size } of [{ label: "1280", size: { width: 1280, height: 900 } }, { label: "390", size: MOBILE }]) {
  test(`H-035: publicar, republicar y despublicar a ${label} px`, async ({ browser, content }) => {
    const vault = content.vaults[0];
    const api = await session(content);
    const base = `/vaults/${vault.id}`;
    const folder = `Pub${label}`;

    const template = await api("POST", `${base}/notes`, {
      path: "PLANTILLAS/plantilla-pub.md", content: "# Estructura",
      frontmatter: { titulo: "Pub", descripcion: "Plantilla de prueba", alcance: ["*"], atributos: [], estados: [{ nombre: "borrador", color: "azul" }], estilo: { publicar: { activo: true }, pdf: {} } },
    });
    expect([201, 409]).toContain(template.status); // la segunda corrida (otro tamaño) ya la encuentra
    const created = await api("POST", `${base}/notes`, {
      path: `${folder}/Informe.md`, content: "# Informe\n\nTexto del informe publicado.\n\n## Detalle\n\nMás texto.",
      frontmatter: { titulo: `Informe ${label}`, descripcion: "Prueba de publicación", tags: [], estado: "borrador", plantilla: "pub" },
    });
    expect(created.status, created.text).toBe(201);
    const noteId = created.json().id as string;

    const context = await newSession(browser, content, { theme: "dark", size, touch: label === "390" });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await waitForVaults(page, content.vaults.length);
    await waitForSynced(page);
    await openDoc(page, folder, "Informe");
    await expect(page.getByRole("heading", { name: "Informe", level: 1 })).toBeVisible();

    // El botón aparece en Lectura, sin publicar.
    const trigger = page.getByRole("button", { name: "Publicar en la web" });
    await expect(trigger).toBeVisible({ timeout: 15_000 });
    await expect(trigger).toHaveAttribute("data-state", "idle");
    await trigger.click();
    const dialog = page.getByRole("dialog"); // su nombre cambia de «Publicar documento» a «Documento publicado»
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Los archivos del documento ya son públicos.")).toHaveCount(0); // sin archivos no se dice
    const publish = dialog.getByRole("button", { name: "Publicar", exact: true });
    await expect(publish).toBeDisabled();
    await dialog.getByRole("checkbox", { name: /Entiendo que cualquier persona/ }).check();
    await expect(publish).toBeEnabled({ timeout: 15_000 });
    await shot(page, `h035-publicar-${label}`);
    await publish.click();
    await expect(dialog.getByText("Publicado. Copia el enlace para compartirlo.")).toBeVisible();
    const url = await dialog.getByRole("textbox", { name: "Enlace público" }).inputValue();
    expect(url).toMatch(new RegExp(`^${origin().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/p/[A-Za-z0-9_-]{32,}$`));
    await shot(page, `h035-publicado-${label}`);

    // La página pública responde sin sesión, con sus cabeceras y su contenido.
    const first = await fetch(url);
    const html = await first.text();
    expect(first.status).toBe(200);
    expect(html).toContain("Texto del informe publicado.");
    expect(html).toContain("Prueba de publicación");
    expect(first.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(first.headers.get("set-cookie")).toBeNull();

    // Cambiar el documento lo deja «desactualizado» y ofrece republicar con la MISMA dirección.
    await dialog.getByRole("button", { name: "Cerrar" }).click();
    const current = await api("GET", `${base}/notes/${noteId}`);
    const changed = await api("PATCH", `${base}/notes/${noteId}`, { content: "# Informe\n\nTexto NUEVO del informe.\n\n## Detalle\n\nMás texto." }, { "If-Match": current.etag! });
    expect(changed.ok, changed.text).toBeTruthy();
    const stale = page.getByRole("button", { name: "Publicado, con cambios sin republicar" });
    await expect(stale).toBeVisible({ timeout: 30_000 });
    await expect(stale).toHaveAttribute("data-state", "stale");
    await stale.click();
    await expect(page.getByText("El documento cambió desde la última publicación.")).toBeVisible();
    await expect((await fetch(url)).text()).resolves.toContain("Texto del informe publicado."); // la copia sigue siendo la vieja
    await page.getByRole("button", { name: /^Republicar/ }).click();
    await expect(page.getByText("Republicado. La página pública ya tiene los cambios.")).toBeVisible();
    expect(await page.getByRole("textbox", { name: "Enlace público" }).inputValue()).toBe(url);
    await expect((await fetch(url)).text()).resolves.toContain("Texto NUEVO del informe.");

    // Despublicar: pide confirmar, el enlace muere y el siguiente es otro.
    await page.getByRole("button", { name: "Despublicar" }).click();
    await expect(page.getByText("Se elimina la copia y el enlace deja de funcionar. Si vuelves a publicar, el enlace será otro.")).toBeVisible();
    await shot(page, `h035-despublicar-${label}`);
    await page.getByRole("button", { name: "Despublicar" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await fetch(url)).status).toBe(404);
    await page.getByRole("button", { name: "Publicar en la web" }).click();
    await page.getByRole("checkbox", { name: /Entiendo que cualquier persona/ }).check();
    await expect(page.getByRole("button", { name: "Publicar", exact: true })).toBeEnabled({ timeout: 15_000 });
    await page.getByRole("button", { name: "Publicar", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Enlace público" })).toBeVisible();
    expect(await page.getByRole("textbox", { name: "Enlace público" }).inputValue()).not.toBe(url);

    // Limpieza: despublicar la de esta prueba.
    await page.getByRole("button", { name: "Despublicar" }).click();
    await page.getByRole("button", { name: "Despublicar" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(errors, "sin errores de página").toEqual([]);
    await context.close();
  });
}
