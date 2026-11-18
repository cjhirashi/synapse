// H-059: capturas restantes de los capítulos 05 y 06 (imagen, visor, comentario, enlace, bloques, propiedades, tags).
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { DESKTOP, PHONE, makeCapture } from "./helpers";
import { seedDemo } from "./demo";

test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const origin = () => process.env.BASE_URL ?? "http://127.0.0.1:8010";
let demo: Awaited<ReturnType<typeof seedDemo>>;
let imageNote = "Informe con imagen";

test.beforeAll(async () => {
  demo = await seedDemo();
  const cookie = demo.cookie;
  const bytes = new Uint8Array(await (await fetch(`${origin()}/icons/icon-192.png`)).arrayBuffer());
  const form = new FormData();
  form.set("vault_id", demo.vaultId);
  form.set("visibility", "public");
  form.set("file", new Blob([bytes], { type: "image/png" }), "cafe-premium.png");
  const up = await fetch(`${origin()}/files`, { method: "POST", headers: { Cookie: cookie }, body: form });
  expect(up.status).toBe(201);
  const fileId = (await up.json()).id as string;
  const body = [
    "# Informe con imagen",
    "",
    "Vista previa del producto estrella.",
    "",
    `![Café premium](${origin()}/files/${fileId})`,
    "",
    '<div class="comentario" data-autor="aira" data-fecha="2026-11-18">',
    "",
    "Ana, revisa las cifras de la semana antes de publicar.",
    "",
    "</div>",
    "",
    "Mira también a los [[Proveedores]].",
    "",
    "| Producto | Unidades |",
    "| --- | --- |",
    "| Café premium | 150 |",
    "| Pastelería | 120 |",
    "",
  ].join("\n");
  const res = await fetch(`${origin()}/vaults/${demo.vaultId}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      path: `Ventas/${imageNote}.md`,
      frontmatter: { titulo: imageNote, descripcion: "Informe con imagen, comentario y enlace", tags: ["ventas", "informe"], estado: "borrador" },
      content: body,
    }),
  });
  expect(res.status, await res.clone().text()).toBe(201);
});

async function session(browser: import("@playwright/test").Browser, size: { width: number; height: number }, touch = false) {
  const context = await browser.newContext({ baseURL: origin(), viewport: size, reducedMotion: "reduce", hasTouch: touch });
  for (const cookie of demo.cookie.split("; ")) {
    const [name, ...rest] = cookie.split("=");
    await context.addCookies([{ name, value: rest.join("="), url: origin() }]);
  }
  await context.addInitScript((theme) => localStorage.setItem("synapse-theme", theme), "light");
  const page = await context.newPage();
  await page.goto(`/vaults/${demo.vaultId}`);
  await expect(page.getByRole("tree", { name: "Notas" }).or(page.getByRole("button", { name: "Mostrar la barra de notas" }))).toBeVisible({ timeout: 30_000 });
  return { context, page };
}

async function openNote(page: Page, name: string) {
  const tree = page.getByRole("tree", { name: "Notas" });
  await expect(async () => {
    const show = page.getByRole("button", { name: "Mostrar la barra de notas" });
    if (await show.isVisible()) await show.click();
    await expect(tree.getByRole("treeitem", { name: "Ventas", exact: true })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await tree.getByRole("treeitem", { name: "Ventas", exact: true }).click();
  const row = tree.getByRole("treeitem", { name, exact: true });
  await expect(async () => {
    const show = page.getByRole("button", { name: "Mostrar la barra de notas" });
    if (await show.isVisible()) await show.click();
    await expect(row).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".milkdown-view")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);
}

test("MANUAL cap 05b", async ({ browser }) => {
  const capture = makeCapture(demo.email);
  const { context, page } = await session(browser, DESKTOP);
  await openNote(page, imageNote);

  const image = page.locator(".milkdown-view img[src*=\"/files/\"]").first();
  await expect(image).toBeVisible({ timeout: 15_000 });
  await image.scrollIntoViewIfNeeded();
  await image.hover();
  const fullBtn = page.getByRole("button", { name: "Ver imagen en pantalla completa" }).first();

  // 05-05: imagen y botón de pantalla completa
  await capture(page, "05-05-imagen", {
    marks: [
      { target: image, n: 1 },
      { target: fullBtn, n: 2 },
    ],
  });

  // 05-06: visor con zoom
  await fullBtn.click();
  const controls = page.getByRole("toolbar", { name: "Zoom de la imagen" });
  await expect(controls).toBeVisible({ timeout: 10_000 });
  await capture(page, "05-06-zoom", { marks: [{ target: controls, n: 1, dy: -26, dx: 0 }] });
  await page.keyboard.press("Escape");

  // 05-08: comentario de revisión
  const comment = page.locator(".milkdown-view .comentario, .milkdown-view [class*='comment']").first();
  await comment.scrollIntoViewIfNeeded();
  await capture(page, "05-08-comentario", { marks: [{ target: comment, n: 1 }] });

  // 05-10: enlace entre notas y su vista previa
  const wikilink = page.locator(".milkdown-view a, .milkdown-view [data-wikilink]").filter({ hasText: "Proveedores" }).first();
  await wikilink.scrollIntoViewIfNeeded();
  await wikilink.hover();
  await page.waitForTimeout(1200);
  await capture(page, "05-10-enlace", { marks: [{ target: wikilink, n: 1, dy: -26, dx: 0 }] });

  // 05-09: columnas, alineación y bloques (menú «Insertar» en edición)
  await page.getByRole("button", { name: "Editar" }).click();
  await expect(page.getByRole("button", { name: "Visual" })).toBeVisible({ timeout: 15_000 });
  await capture(page, "05-09-bloques", { marks: [] });

  // 06-02: «Añadir propiedad»
  const addProp = page.getByRole("button", { name: "Añadir propiedad" });
  await addProp.scrollIntoViewIfNeeded();
  await addProp.click();
  await page.waitForTimeout(500);
  const propsGroup = page.getByRole("group", { name: "Propiedades" });
  await expect(propsGroup).toBeVisible({ timeout: 5000 });
  await capture(page, "06-02-tipos-propiedad", {
    marks: [
      { target: propsGroup.getByRole("combobox").last(), n: 1 },
      { target: addProp, n: 2 },
    ],
  });
  await page.keyboard.press("Escape");
  await context.close();

  // 05-07: visor en celular
  const phone = await session(browser, PHONE, true);
  await openNote(phone.page, imageNote);
  const imagePhone = phone.page.locator(".milkdown-view img[src*=\"/files/\"]").first();
  await imagePhone.scrollIntoViewIfNeeded();
  await imagePhone.hover();
  await phone.page.getByRole("button", { name: "Ver imagen en pantalla completa" }).first().click();
  const controlsPhone = phone.page.getByRole("toolbar", { name: "Zoom de la imagen" });
  await expect(controlsPhone).toBeVisible({ timeout: 10_000 });
  await capture(phone.page, "05-07-visor-celular", { marks: [{ target: controlsPhone, n: 1, dy: -26, dx: 0 }] });
  await phone.context.close();
});

test("MANUAL cap 06b", async ({ browser }) => {
  const capture = makeCapture(demo.email);
  const { context, page } = await session(browser, DESKTOP);
  await openNote(page, "Informe mensual");

  // 06-01: panel de propiedades en lectura
  await capture(page, "06-01-propiedades", {
    marks: [
      { target: page.getByText("Descripción", { exact: true }).first(), n: 1, dx: -34, dy: -2 },
      { target: page.getByText("Etiquetas", { exact: true }).first(), n: 2, dx: -34, dy: -2 },
      { target: page.getByText("Estado", { exact: true }).first(), n: 3, dx: -34, dy: -2 },
      { target: page.getByText("Plantilla", { exact: true }).first(), n: 4, dx: -34, dy: -2 },
    ],
  });

  // 06-03: filtro por tags
  await page.getByRole("tab", { name: "Filtro por tags" }).or(page.getByRole("button", { name: "Filtro por tags" })).first().click();
  const panel = page.getByRole("complementary", { name: "Filtro por tags" });
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await expect(panel.locator(".tag-filter-toggle")).toBeVisible({ timeout: 30_000 });
  await panel.locator(".tag-filter-toggle").click();
  const chip = page.locator(".tag-filter-chips .tag-chip").filter({ hasText: "ventas" }).first();
  await expect(chip).toBeVisible({ timeout: 30_000 });
  await chip.click();
  await page.waitForTimeout(800);
  await capture(page, "06-03-filtro-tags", { marks: [{ target: chip, n: 1, dy: -24, dx: 0 }, { target: page.getByRole("listbox", { name: "Documentos que cumplen el filtro" }), n: 2 }] });
  await context.close();
});

test("MANUAL cap 05c", async ({ browser }) => {
  const capture = makeCapture(demo.email);
  const { context, page } = await session(browser, DESKTOP);

  // 05-03: modo Código con el Markdown a la vista
  await openNote(page, "Informe mensual");
  await page.getByRole("button", { name: "Editar" }).click();
  const codigo = page.getByRole("button", { name: "Código", exact: true });
  await expect(codigo).toBeVisible({ timeout: 15_000 });
  await codigo.click();
  const cm = page.locator(".cm-editor").first();
  await expect(cm).toBeVisible({ timeout: 15_000 });
  await cm.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(500);
  await capture(page, "05-03-codigo", { marks: [{ target: codigo, n: 1, dy: -26, dx: 0 }, { target: cm, n: 2, dx: 0, dy: -26 }] });
  await context.close();

  // 05-04 y 05-09: tabla con contenido y barra de formato
  const second = await session(browser, DESKTOP);
  await openNote(second.page, imageNote);
  await second.page.getByRole("button", { name: "Editar" }).click();
  await expect(second.page.getByRole("button", { name: "Visual" })).toBeVisible({ timeout: 15_000 });
  const table = second.page.locator(".milkdown-view table").first();
  await table.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await second.page.waitForTimeout(500);
  await capture(second.page, "05-04-tabla", { marks: [{ target: table, n: 1, dx: -34, dy: -2 }] });

  const pdfGroup = second.page.getByRole("group", { name: "Páginas del PDF" });
  await pdfGroup.scrollIntoViewIfNeeded();
  await second.page.evaluate(() => window.scrollTo(0, 0));
  await capture(second.page, "05-09-bloques", {
    around: second.page.getByRole("group", { name: "Estilo de texto" }).locator(".."),
    pad: 10,
    marks: [
      { target: second.page.getByRole("group", { name: "Columnas", exact: true }), n: 1, dx: 0, dy: -4 },
      { target: second.page.getByRole("group", { name: "Insertar", exact: true }), n: 2, dx: 0, dy: -4 },
      { target: second.page.getByRole("group", { name: "Páginas del PDF", exact: true }), n: 3, dx: 0, dy: -4 },
    ],
  });
  await second.context.close();
});
