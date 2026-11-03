// Verificación en navegador real de H-025 (paso 8): pegado de enlaces, aviso «Deshacer», captura
// pegada y diálogo «Subir o pegar URL». Los eventos de pegado se simulan (el portapapeles del sistema
// operativo no es accesible); la reproducción real del video queda para el checkpoint de Carlos.
import type { Page } from "@playwright/test";
import { CONTENT_NOTES, noteName } from "./content-notes";
import { expect, MOBILE, newSession, shot, test, waitForSynced, waitForVaults, type Seeded, type Size } from "./fixtures";

const YT = "https://youtu.be/jNQXAC9IVRw?t=90";
const IMG = "https://example.com/foto.png";
const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** Errores propios (los del documento de YouTube dentro del iframe son de un tercero: se registran, no fallan). */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const origin = msg.location().url;
    if (/youtube|google|gstatic|doubleclick/.test(origin)) console.log(`H025 consola de tercero (${origin}): ${msg.text().slice(0, 140)}`);
    else errors.push(`${msg.text()} [${origin}]`);
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

/** Cursor al final del documento (Control+End no es fiable en la emulación móvil). */
async function cursorToEnd(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(".milkdown-view .ProseMirror")!;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
}

/** La barra de notas arranca oculta: se abre antes de usar el árbol. */
async function openWorkspaceWithSidebar(browser: Parameters<typeof newSession>[0], seeded: Seeded, size: Size) {
  const context = await newSession(browser, seeded, { theme: "dark", size });
  const page = await context.newPage();
  await page.goto(`/vaults/${seeded.vaults[0].id}`);
  await waitForVaults(page, seeded.vaults.length);
  await waitForSynced(page);
  const show = page.getByRole("button", { name: "Mostrar la barra de notas" });
  if (await show.isVisible()) await show.click();
  await expect(page.getByRole("complementary", { name: "Notas de la bóveda" })).toBeVisible();
  return { context, page };
}

/** Edita la primera nota con contenido y deja el cursor en un párrafo vacío al final. */
async function emptyParagraph(page: Page): Promise<void> {
  const note = CONTENT_NOTES.find((n) => n.key === "props-types")!;
  // A 390 px la barra de notas se cierra al abrir la nota: un solo clic por fila, sin reintentos.
  const tree = page.getByRole("tree", { name: "Notas" });
  const segments = note.path.split("/");
  for (const folder of segments.slice(0, -1)) {
    const row = tree.getByRole("treeitem", { name: folder, exact: true });
    if ((await row.getAttribute("aria-expanded")) === "false") await row.click();
  }
  await tree.getByRole("treeitem", { name: noteName(note), exact: true }).click();
  await expect(page.getByRole("heading", { name: noteName(note), level: 2 })).toBeVisible();
  await expect(page.locator(".milkdown-view .ProseMirror")).toBeVisible();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const editor = page.locator(".milkdown-view .ProseMirror");
  await editor.click();
  await cursorToEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  // ProseMirror agrupa en un solo paso de historial lo que ocurre en menos de 500 ms: una persona tarda más.
  await page.waitForTimeout(700);
}

/** Dispara un `paste` con `text/plain` y, si se pide, un archivo PNG. */
async function paste(page: Page, text: string, file = false): Promise<void> {
  await page.evaluate(
    ({ text, file, png }) => {
      const dt = new DataTransfer();
      if (text) dt.setData("text/plain", text);
      if (file) {
        const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
        dt.items.add(new File([bytes], "screenshot.png", { type: "image/png" }));
      }
      const target = document.querySelector(".milkdown-view .ProseMirror")!;
      target.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    },
    { text, file, png: PNG_1PX },
  );
}

const SIZE_LIST: Array<{ label: string; size: Size }> = [
  { label: "1280", size: { width: 1280, height: 800 } },
  { label: "390", size: MOBILE },
];

for (const { label, size } of SIZE_LIST) {
  test(`H-025 paso 8: YouTube, imagen, deshacer, captura y diálogo a ${label} px`, async ({ browser, content }) => {
    const { context, page } = await openWorkspaceWithSidebar(browser, content, size);
    const errors = trackErrors(page);
    await emptyParagraph(page);

    // 1. Enlace de YouTube → reproductor 16:9 con pantalla completa y «Abrir en YouTube».
    await paste(page, YT);
    const frame = page.locator('.milkdown-view iframe[src^="https://www.youtube-nocookie.com/embed/jNQXAC9IVRw"]');
    await expect(frame).toHaveCount(1);
    await expect(frame).toHaveAttribute("src", /start=90/);
    await expect(frame).toHaveAttribute("allow", /fullscreen/);
    await expect(frame).not.toHaveAttribute("allow", /autoplay/);
    const box = (await frame.boundingBox())!;
    expect(box.width / box.height, "proporción 16:9").toBeGreaterThan(1.7);
    expect(box.width / box.height, "proporción 16:9").toBeLessThan(1.85);
    await expect(page.getByRole("link", { name: /Abrir en YouTube/ })).toBeVisible();
    await expect(page.getByText("Enlace convertido en reproductor de YouTube.")).toBeVisible();
    // El iframe carga de verdad el reproductor de YouTube (se lee su documento, no solo su atributo).
    const inner = (await (await frame.elementHandle())!.contentFrame())!;
    await inner.waitForLoadState("load", { timeout: 20_000 }).catch(() => undefined);
    await page.waitForTimeout(3_000);
    console.log(`H025 iframe ${label}: url=${inner.url()} referrerpolicy=${await frame.getAttribute("referrerpolicy")} texto=${JSON.stringify((await inner.locator("body").innerText().catch(() => "")).slice(0, 160))}`);
    expect(inner.url()).toContain("youtube-nocookie.com/embed/jNQXAC9IVRw");
    expect(await inner.locator("body").innerText().catch(() => ""), "el reproductor carga con su título, sin Error 153").toMatch(/Me at the zoo/);
    await shot(page, `h025-${label}-1-youtube`);

    // 2. «Deshacer» del aviso devuelve el enlace normal (no borra lo pegado).
    await page.getByRole("button", { name: "Deshacer" }).click();
    await expect(frame).toHaveCount(0);
    await expect(page.locator(".milkdown-view .ProseMirror a", { hasText: "youtu.be/jNQXAC9IVRw" })).toHaveCount(1);
    await expect(page.getByText(/Enlace convertido/)).toHaveCount(0);
    await shot(page, `h025-${label}-2-deshecho`);

    // 3. Ctrl+Z: de nuevo pega, un undo deja el enlace y un segundo lo quita.
    await emptyParagraphAgain(page);
    await paste(page, YT);
    await expect(frame).toHaveCount(1);
    await page.locator(".milkdown-view .ProseMirror").focus();
    await page.keyboard.press("Control+z");
    await expect(frame).toHaveCount(0);
    const links = page.locator(".milkdown-view .ProseMirror a", { hasText: "youtu.be/jNQXAC9IVRw" });
    await expect(links, "el undo deja el enlace pegado y el del paso 2").toHaveCount(2);
    await page.keyboard.press("Control+z");
    await expect(links, "el segundo undo lo quita; el del paso 2 sigue").toHaveCount(1);

    // 4. Un enlace normal no se convierte; una imagen por enlace sí.
    await paste(page, "https://example.com/pagina");
    await expect(page.getByText(/Enlace convertido/)).toHaveCount(0);
    await emptyParagraphAgain(page);
    await paste(page, IMG);
    await expect(page.locator(`.milkdown-view .ProseMirror img[src="${IMG}"]`)).toHaveCount(1);
    await expect(page.getByText("Enlace convertido en imagen.")).toBeVisible();
    await shot(page, `h025-${label}-3-imagen`);

    // 5. Captura pegada: sube a «Varios» con nombre captura-AAAAMMDD-HHMMSS.png e inserta la imagen.
    let upload: { body: string } | null = null;
    await page.route("**/files", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      upload = { body: route.request().postData() ?? "" };
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", vault_id: content.vaults[0].id, name: "captura.png", content_type: "image/png", size: 70, visibility: "private", created_at: "2026-11-02T20:00:00Z" }),
      });
    });
    await emptyParagraphAgain(page);
    await paste(page, "", true);
    await expect.poll(() => upload !== null, { timeout: 10_000 }).toBe(true);
    expect(upload!.body).toMatch(/name="folder"\r\n\r\nVarios/);
    expect(upload!.body).toMatch(/filename="captura-\d{8}-\d{6}\.png"/);
    await expect(page.locator('.milkdown-view .ProseMirror img[src$="/files/11111111-1111-4111-8111-111111111111"]')).toHaveCount(1);
    await shot(page, `h025-${label}-4-captura`);

    // 6. Diálogo «Subir o pegar URL»: dos opciones, foco, URL de YouTube en automático.
    const attach = page.getByRole("button", { name: "Adjuntar archivo" });
    await emptyParagraphAgain(page);
    await attach.click();
    const dialog = page.getByRole("dialog", { name: "Adjuntar" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Subir archivo" })).toBeFocused();
    await shot(page, `h025-${label}-5-dialogo`);
    await dialog.getByRole("button", { name: "Pegar URL" }).click();
    await dialog.getByLabel("URL").fill("javascript:alert(1)");
    await dialog.getByRole("button", { name: "Insertar" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Escribe una dirección web válida.");
    await dialog.getByLabel("URL").fill(YT);
    await dialog.getByRole("button", { name: "Insertar" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(frame).toHaveCount(1);
    await shot(page, `h025-${label}-6-dialogo-youtube`);
    await attach.click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Adjuntar" })).toHaveCount(0);
    await expect(attach).toBeFocused();

    expect(errors, "sin errores de consola ni excepciones").toEqual([]);
    await context.close();
  });
}

/** Cursor en un párrafo vacío nuevo al final del documento. */
async function emptyParagraphAgain(page: Page): Promise<void> {
  await page.locator(".milkdown-view .ProseMirror").focus();
  await cursorToEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
}
