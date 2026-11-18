// H-059: capturas de los capítulos 07 (Plantillas) y 08 (Archivos) del Manual de Operación.
import { expect, test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";
import { DESKTOP, makeCapture } from "./helpers";
import { seedDemo } from "./demo";

test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const origin = () => process.env.BASE_URL ?? "http://127.0.0.1:8010";
let demo: Awaited<ReturnType<typeof seedDemo>>;

test.beforeAll(async () => {
  demo = await seedDemo();
  const cookie = demo.cookie;
  const api = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${origin()}${path}`, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    expect(res.status, `${method} ${path}: ${text}`).toBeLessThan(300);
    return JSON.parse(text);
  };

  const bytes = new Uint8Array(await (await fetch(`${origin()}/icons/icon-192.png`)).arrayBuffer());
  const upload = async (name: string, visibility: "private" | "public", folder?: string) => {
    const form = new FormData();
    form.set("vault_id", demo.vaultId);
    form.set("visibility", visibility);
    if (folder) form.set("folder", folder);
    form.set("file", new Blob([bytes], { type: "image/png" }), name);
    const res = await fetch(`${origin()}/files`, { method: "POST", headers: { Cookie: cookie }, body: form });
    expect(res.status, await res.clone().text()).toBe(201);
    return (await res.json()).id as string;
  };
  await upload("logo-cafe-aurora.png", "public");
  await upload("menu-de-la-semana.png", "public", "Marca");
  await upload("factura-proveedor.png", "private");
  const contrato = await upload("contrato-local.png", "private", "Compras");

  await api("POST", `/vaults/${demo.vaultId}/notes`, {
    path: "PLANTILLAS/plantilla-informe.md",
    content: "# Resumen\n\n## Cifras\n\n## Pendientes\n",
    frontmatter: {
      titulo: "plantilla-informe",
      descripcion: "Informe semanal de ventas del negocio.",
      tags: ["plantilla"],
      alcance: ["Ventas"],
      atributos: [{ nombre: "responsable", tipo: "texto" }, { nombre: "semana", tipo: "numero" }],
      estados: [{ nombre: "borrador", color: "gris" }, { nombre: "revisión", color: "azul" }, { nombre: "aprobado", color: "verde" }],
      instrucciones: "Usa esta plantilla cada lunes. Llena las cifras con los datos del cierre de caja.",
      estilo: {
        publicar: { activo: true },
        pdf: {
          activo: true,
          pagina: { tamano: "carta", margenes_mm: { superior: 25, inferior: 20, izquierdo: 20, derecho: 20 } },
          encabezado: { izquierda: "Café Aurora", derecha: "{{titulo}}" },
          pie: { derecha: "Página {{pagina}} de {{paginas}}" },
        },
      },
    },
  });
  await api("POST", `/vaults/${demo.vaultId}/notes`, {
    path: "Ventas/Informe semanal.md",
    content: "# Informe semanal\n\nResumen de la semana.\n",
    frontmatter: { titulo: "Informe semanal", descripcion: "Cierre de la semana", tags: ["ventas"], estado: "revisión", plantilla: "informe", responsable: "Ana Torres", semana: 46 },
  });
  void contrato;
});

async function session(browser: Browser) {
  const context = await browser.newContext({ baseURL: origin(), viewport: DESKTOP, reducedMotion: "reduce" });
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

async function openIn(page: Page, folder: string, name: string) {
  const tree = page.getByRole("tree", { name: "Notas" });
  const folderRow = tree.getByRole("treeitem", { name: folder, exact: true });
  await expect(folderRow).toBeVisible({ timeout: 20_000 });
  await folderRow.click();
  const row = tree.getByRole("treeitem", { name, exact: true });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1000);
}

test("MANUAL cap 07", async ({ browser }) => {
  const capture = makeCapture(demo.email);
  const { context, page } = await session(browser);

  // 07-03: documento creado desde la plantilla
  await openIn(page, "Ventas", "Informe semanal");
  await expect(page.locator(".milkdown-view")).toBeVisible({ timeout: 15_000 });
  await capture(page, "07-03-documento-con-plantilla", {
    marks: [
      { target: page.getByText("Plantilla", { exact: true }).first(), n: 1, dx: -34, dy: -2 },
      { target: page.getByText("Estado", { exact: true }).first(), n: 2, dx: -34, dy: -2 },
    ],
  });

  // 07-01 a 07-05: la plantilla abierta
  await openIn(page, "PLANTILLAS", "plantilla-informe");
  const heading = (name: string) => page.getByRole("heading", { name, exact: true }).first();
  await expect(heading("Dónde se usa")).toBeVisible({ timeout: 15_000 });
  await capture(page, "07-01-plantilla", {
    marks: [
      { target: heading("Dónde se usa"), n: 1, dx: -34, dy: -2 },
      { target: heading("Atributos opcionales"), n: 2, dx: -34, dy: -2 },
    ],
  });

  const estados = page.getByRole("group", { name: "Estados del documento" });
  await estados.scrollIntoViewIfNeeded();
  await capture(page, "07-02-estados", { marks: [{ target: estados, n: 1, dx: -34, dy: -2 }] });

  const pdf = heading("Diseño del PDF");
  await pdf.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(400);
  await capture(page, "07-04-diseno-pdf", {
    marks: [
      { target: pdf, n: 1, dx: -34, dy: -2 },
      { target: page.getByRole("checkbox", { name: /Permitir descargar los documentos/ }), n: 2, dx: -34, dy: -2 },
    ],
  });

  const pub = heading("Publicación en la web");
  await pub.scrollIntoViewIfNeeded();
  await capture(page, "07-05-publicacion-web", {
    marks: [{ target: page.getByRole("checkbox", { name: /Permitir publicar los documentos/ }), n: 1, dx: -34, dy: -2 }],
  });
  await context.close();
});

test("MANUAL cap 08", async ({ browser }) => {
  const capture = makeCapture(demo.email);
  const { context, page } = await session(browser);
  await page.getByRole("tab", { name: "Archivos" }).or(page.getByRole("button", { name: "Archivos" })).first().click();
  const upload = page.getByRole("button", { name: "Subir archivo" });
  await expect(upload).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Abrir logo-cafe-aurora.png" }).or(page.getByText("logo-cafe-aurora.png")).first().waitFor({ timeout: 20_000 }).catch(() => undefined);

  // 08-01: pestaña Archivos
  await capture(page, "08-01-archivos", {
    marks: [
      { target: upload, n: 1, dy: -26, dx: 0 },
      { target: page.getByRole("complementary", { name: "Carpetas" }), n: 2, dx: 0, dy: -2 },
    ],
  });

  // 08-02: cambiar la visibilidad (diálogo de confirmación al hacerlo público)
  const vis = page.getByRole("button", { name: "Cambiar visibilidad de factura-proveedor.png" });
  await vis.scrollIntoViewIfNeeded();
  await vis.click();
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog")).first();
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await capture(page, "08-02-visibilidad", { marks: [{ target: dialog, n: 1, dx: -10, dy: -10 }] });
  await page.keyboard.press("Escape");

  // 08-03: acciones de un archivo
  const copy = page.getByRole("button", { name: "Copiar link de logo-cafe-aurora.png" });
  await copy.scrollIntoViewIfNeeded();
  await capture(page, "08-03-acciones", {
    marks: [
      { target: page.getByRole("button", { name: "Renombrar logo-cafe-aurora.png" }), n: 1, dy: -26, dx: 0 },
      { target: copy, n: 2, dy: -26, dx: 0 },
      { target: page.getByRole("button", { name: "Borrar logo-cafe-aurora.png" }), n: 3, dy: -26, dx: 0 },
    ],
  });
  await context.close();
});
