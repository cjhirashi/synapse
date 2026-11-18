// H-059: capturas de los capítulos 11 (PDF) y 12 (Publicar en la web) del Manual de Operación.
import { expect, test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { DESKTOP, MANUAL_DIR, PHONE, makeCapture } from "./helpers";
import { seedDemo } from "./demo";

test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const origin = () => process.env.BASE_URL ?? "http://127.0.0.1:8010";
let demo: Awaited<ReturnType<typeof seedDemo>>;
const tokens: Record<string, string> = {};
let imageUrl = "";

const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

test.beforeAll(async () => {
  demo = await seedDemo();
  const cookie = demo.cookie;
  const v = demo.vaultId;
  const raw = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(`${origin()}${path}`, { method, headers: { "Content-Type": "application/json", Cookie: cookie, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    expect(res.status, `${method} ${path}: ${text}`).toBeLessThan(300);
    return { res, json: text ? JSON.parse(text) : {} };
  };

  const bytes = new Uint8Array(await (await fetch(`${origin()}/icons/icon-192.png`)).arrayBuffer());
  const upload = async (name: string, visibility: "private" | "public") => {
    const form = new FormData();
    form.set("vault_id", v);
    form.set("visibility", visibility);
    form.set("file", new Blob([bytes], { type: "image/png" }), name);
    const res = await fetch(`${origin()}/files`, { method: "POST", headers: { Cookie: cookie }, body: form });
    expect(res.status, await res.clone().text()).toBe(201);
    return (await res.json()).id as string;
  };
  const publicId = await upload("logo-cafe.png", "public");
  const privA = await upload("receta-secreta.png", "private");
  const privB = await upload("proveedor-exclusivo.png", "private");
  imageUrl = `${origin()}/files/${publicId}`;

  await raw("POST", `/vaults/${v}/notes`, {
    path: "PLANTILLAS/plantilla-informe.md",
    content: "# Resumen\n",
    frontmatter: {
      titulo: "plantilla-informe", descripcion: "Informe semanal de ventas.", tags: ["plantilla"], alcance: ["Ventas"], atributos: [],
      estados: [{ nombre: "borrador", color: "gris" }, { nombre: "aprobado", color: "verde" }],
      estilo: {
        publicar: { activo: true },
        pdf: { activo: true, pagina: { tamano: "carta", margenes_mm: { superior: 25, inferior: 20, izquierdo: 20, derecho: 20 } }, encabezado: { izquierda: "Café Aurora", derecha: "{{titulo}}" }, pie: { derecha: "Página {{pagina}} de {{paginas}}" } },
      },
    },
  });

  const body = (extra: string) => [
    '<!-- pdf:portada -->', "", "# Informe de ventas", "", "Café Aurora · noviembre 2026", "", '<!-- /pdf:portada -->', "",
    '<!-- pdf:indice -->', "",
    "## Resumen", "", "Las ventas de la semana crecieron un 12.5 % frente a la anterior.", "",
    `![Café premium](${imageUrl})`, "",
    '<!-- pdf:salto -->', "",
    "## Cifras", "", "- Café premium: 150 unidades", "- Pastelería: 120 unidades", "",
    "## Pendientes", "", "Confirmar el pedido de leche y revisar la cotización del proveedor.", "", extra,
  ].join("\n");
  const html = (title: string) => `<h1>${title}</h1><h2 id="resumen">Resumen</h2><p>Las ventas de la semana crecieron un 12.5 %.</p><img src="${imageUrl}" alt="Café premium"><h2 id="cifras">Cifras</h2><ul><li>Café premium: 150 unidades</li><li>Pastelería: 120 unidades</li></ul><h2 id="pendientes">Pendientes</h2><p>Confirmar el pedido de leche.</p>`;
  const fm = (titulo: string, estado = "aprobado") => ({ titulo, descripcion: "Informe semanal de ventas", tags: ["ventas"], estado, plantilla: "informe" });
  const create = async (name: string, extra: string, estado?: string) => (await raw("POST", `/vaults/${v}/notes`, { path: `Ventas/${name}.md`, content: body(extra), frontmatter: fm(name, estado) }));

  await create("Informe de ventas", "");
  const pubNote = await create("Informe publicado", "");
  const expNote = await create("Informe temporal", "");
  const changed = await create("Informe con cambios", "");
  await create("Informe con archivos privados", `![Receta](${origin()}/files/${privA})\n\n![Proveedor](${origin()}/files/${privB})\n`);

  const publish = async (id: string, title: string, unpublishAt?: string) => {
    const r = await raw("POST", `/vaults/${v}/notes/${id}/publication`, { html: html(title), ...(unpublishAt ? { unpublish_at: unpublishAt } : {}) });
    return r.json;
  };
  const p1 = await publish(pubNote.json.id, "Informe publicado");
  tokens.publicado = p1.token ?? p1.url?.split("/p/")[1];
  const p2 = await publish(expNote.json.id, "Informe temporal", iso(3));
  tokens.temporal = p2.token ?? p2.url?.split("/p/")[1];
  const p3 = await publish(changed.json.id, "Informe con cambios");
  tokens.cambios = p3.token ?? p3.url?.split("/p/")[1];
  // Cambia el documento después de publicarlo: queda «con cambios sin republicar».
  const etag = changed.res.headers.get("etag") ?? `"${changed.json.version ?? 1}"`;
  await raw("PATCH", `/vaults/${v}/notes/${changed.json.id}`, { content: body("\nSe añadió un apartado nuevo después de publicar.\n") }, { "If-Match": etag });

  // Un documento publicado y luego despublicado: su enlace ya no funciona.
  const gone = await create("Informe retirado", "");
  const p4 = await publish(gone.json.id, "Informe retirado");
  tokens.retirado = p4.token ?? p4.url?.split("/p/")[1];
  await raw("DELETE", `/vaults/${v}/notes/${gone.json.id}/publication`);
  writeFileSync(`${MANUAL_DIR}/_tokens.json`, JSON.stringify(tokens));
});

async function session(browser: Browser, size = DESKTOP, touch = false) {
  const context = await browser.newContext({ baseURL: origin(), viewport: size, reducedMotion: "reduce", hasTouch: touch, acceptDownloads: true });
  for (const cookie of demo.cookie.split("; ")) {
    const [name, ...rest] = cookie.split("=");
    await context.addCookies([{ name, value: rest.join("="), url: origin() }]);
  }
  await context.addInitScript((theme) => localStorage.setItem("synapse-theme", theme), "light");
  const page = await context.newPage();
  await page.goto(`/vaults/${demo.vaultId}`);
  await expect(page.getByRole("tree", { name: "Notas" })).toBeVisible({ timeout: 30_000 });
  return { context, page };
}

async function openDoc(page: Page, name: string) {
  const tree = page.getByRole("tree", { name: "Notas" });
  const folder = tree.getByRole("treeitem", { name: "Ventas", exact: true });
  await expect(folder).toBeVisible({ timeout: 20_000 });
  const row = tree.getByRole("treeitem", { name, exact: true });
  if (!(await row.isVisible())) await folder.click();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".milkdown-view")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1200);
}

test("MANUAL cap 11", async ({ browser }) => {
  const capture = makeCapture(demo.email);
  const { context, page } = await session(browser);
  await openDoc(page, "Informe de ventas");
  const pdf = page.getByRole("button", { name: "Descargar como PDF" });
  await expect(pdf).toBeVisible({ timeout: 15_000 });
  await capture(page, "11-01-boton-pdf", { clip: { x: 296, y: 132, width: 724, height: 50 }, marks: [{ target: pdf, n: 1, dx: 0, dy: 20 }] });

  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), pdf.click()]);
  await download.saveAs(`${MANUAL_DIR}/_informe.pdf`);
  await context.close();
});

test("MANUAL cap 12", async ({ browser }) => {
  const capture = makeCapture(demo.email);
  const { context, page } = await session(browser);

  // 12-01 y 12-02: el botón y el diálogo de publicar (documento sin publicar y sin recursos privados)
  await openDoc(page, "Informe de ventas");
  const globe = page.getByRole("button", { name: "Publicar en la web" });
  await expect(globe).toBeVisible({ timeout: 15_000 });
  await capture(page, "12-01-boton-publicar", { clip: { x: 296, y: 132, width: 724, height: 50 }, marks: [{ target: globe, n: 1, dx: 0, dy: 20 }] });
  await globe.click();
  const dialog = page.getByRole("dialog").first();
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  await capture(page, "12-02-dialogo-publicar", {
    marks: [
      { target: dialog.getByRole("checkbox", { name: /Entiendo que cualquier persona/ }), n: 1, dx: -34, dy: -2 },
      { target: dialog.getByRole("button", { name: /^Publicar$/ }), n: 2, dx: 0, dy: -30 },
    ],
  });

  // 12-04: fecha de despublicación
  const expiry = dialog.getByRole("checkbox", { name: /Despublicar automáticamente en una fecha/ });
  await expiry.check();
  await page.waitForTimeout(600);
  await capture(page, "12-04-fecha", { marks: [{ target: expiry, n: 1, dx: -34, dy: -2 }, { target: dialog.locator('input[type="datetime-local"]'), n: 2, dx: -34, dy: -2 }] });
  await page.keyboard.press("Escape");

  // 12-03: recursos privados
  await openDoc(page, "Informe con archivos privados");
  await page.getByRole("button", { name: "Publicar en la web" }).click();
  const review = page.getByRole("dialog").first();
  await expect(review.getByText("Hay recursos que no se verán")).toBeVisible({ timeout: 20_000 });
  await capture(page, "12-03-recursos-privados", {
    marks: [
      { target: review.getByText("Hay recursos que no se verán"), n: 1, dx: -34, dy: -2 },
      { target: review.getByRole("button", { name: /Hacer públicos todos/ }), n: 2, dx: 0, dy: -30 },
    ],
  });
  await page.keyboard.press("Escape");

  // 12-05: documento publicado
  await openDoc(page, "Informe temporal");
  await page.getByRole("button", { name: "Publicado en la web: ver el enlace" }).click();
  const pub = page.getByRole("dialog").first();
  await expect(pub.getByText("Documento publicado")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);
  await capture(page, "12-05-publicado", {
    marks: [
      { target: pub.getByText("Enlace público"), n: 1, dx: -34, dy: -2 },
      { target: pub.getByText("Despublicación automática"), n: 2, dx: -34, dy: -2 },
    ],
  });
  await page.keyboard.press("Escape");

  // 12-06: con cambios sin republicar
  await openDoc(page, "Informe con cambios");
  const amber = page.getByRole("button", { name: /Publicado, con cambios sin republicar|Publicado en la web/ }).first();
  await expect(amber).toBeVisible({ timeout: 15_000 });
  await amber.click();
  const changed = page.getByRole("dialog").first();
  await expect(changed).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);
  await capture(page, "12-06-cambios", { marks: [{ target: changed.getByText(/cambió desde la última publicación/), n: 1, dx: -34, dy: -2 }, { target: changed.getByRole("button", { name: "Republicar", exact: true }), n: 2, dx: 0, dy: -30 }] });
  await page.keyboard.press("Escape");

  // 12-07: pestaña Publicados
  await page.goto(`/vaults/${demo.vaultId}?tab=publicados`);
  await page.waitForTimeout(2500);
  await capture(page, "12-07-publicados", { marks: [{ target: page.getByText("Ventas/Informe temporal.md"), n: 1, dx: -34, dy: -2 }, { target: page.getByRole("button", { name: /Despublicar/ }).nth(1), n: 2, dx: 0, dy: -30 }] });
  await context.close();

  // 12-08, 12-09, 12-10: la página pública
  const anon = await browser.newContext({ baseURL: origin(), viewport: DESKTOP, reducedMotion: "reduce" });
  const pageDesk = await anon.newPage();
  await pageDesk.goto(`/p/${tokens.publicado}`);
  await pageDesk.waitForTimeout(1500);
  await capture(pageDesk, "12-08-pagina-publica", { marks: [{ target: pageDesk.locator(".toc-side"), n: 1, dx: -34, dy: 0 }] });
  await anon.close();

  const phone = await browser.newContext({ baseURL: origin(), viewport: PHONE, reducedMotion: "reduce", hasTouch: true });
  const pagePhone = await phone.newPage();
  await pagePhone.goto(`/p/${tokens.publicado}`);
  await pagePhone.waitForTimeout(1500);
  await capture(pagePhone, "12-09-publica-celular", { marks: [{ target: pagePhone.getByRole("link", { name: "Abrir el índice" }), n: 1, dx: -34, dy: 0 }] });
  await pagePhone.goto(`/p/${tokens.publicado}#indice`);
  await pagePhone.waitForTimeout(1200);
  await capture(pagePhone, "12-09b-publica-indice", { marks: [{ target: pagePhone.getByRole("link", { name: "Cerrar el índice" }), n: 1, dx: -34, dy: 0 }, { target: pagePhone.getByText("Resumen", { exact: true }).first(), n: 2, dx: -34, dy: -4 }] });
  await pagePhone.goto(`/p/${tokens.retirado}`);
  await pagePhone.waitForTimeout(1000);
  await capture(pagePhone, "12-10-no-disponible", {});
  await phone.close();
});
