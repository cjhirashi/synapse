// H-037: gráficos Plotly en HTML (línea SVG, WebGL 2D y 3D) subidos como archivo y embebidos en una nota.
// El HTML lo sirve el backend real con sus cabeceras; la prueba lo sirve en la URL pública que admite el saneador.
// Los HTML (~4,8 MB cada uno, generados con `include_plotlyjs=True`) viven en `e2e/.fixtures-h037/` fuera del repositorio.
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { CONTENT_NOTES, noteName } from "./content-notes";
import { expect, MOBILE, newSession, shot, test, waitForSynced, waitForVaults, type Seeded, type Size } from "./fixtures";

const KINDS = [
  { file: "svg-inline", label: "línea (SVG)" },
  { file: "gl-inline", label: "WebGL 2D" },
  { file: "3d-inline", label: "3D" },
];

async function openNoteInEdit(browser: Parameters<typeof newSession>[0], seeded: Seeded, size: Size) {
  const context = await newSession(browser, seeded, { theme: "dark", size });
  const page = await context.newPage();
  await page.goto(`/vaults/${seeded.vaults[0].id}`);
  await waitForVaults(page, seeded.vaults.length);
  await waitForSynced(page);
  const show = page.getByRole("button", { name: "Mostrar la barra de notas" });
  if (await show.isVisible()) await show.click();
  const note = CONTENT_NOTES.find((n) => n.key === "props-types")!;
  const tree = page.getByRole("tree", { name: "Notas" });
  for (const folder of note.path.split("/").slice(0, -1)) {
    const row = tree.getByRole("treeitem", { name: folder, exact: true });
    if ((await row.getAttribute("aria-expanded")) === "false") await row.click();
  }
  await tree.getByRole("treeitem", { name: noteName(note), exact: true }).click();
  await expect(page.getByRole("heading", { name: noteName(note), level: 2 })).toBeVisible();
  return { context, page };
}

/** Cookie de la sesión como cabecera: la cookie `Secure` no viaja por http en el cliente de API de Playwright. */
async function sessionCookie(page: Page): Promise<string> {
  return (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
}

async function upload(page: Page, vaultId: string, file: string): Promise<string> {
  const buffer = readFileSync(`e2e/.fixtures-h037/${file}.html`);
  const res = await page.context().request.post("/files", {
    headers: { Cookie: await sessionCookie(page) },
    multipart: { vault_id: vaultId, file: { name: `${file}.html`, mimeType: "text/html", buffer } },
  });
  expect(res.status(), `subida de ${file}`).toBe(201);
  return (await res.json()).id as string;
}

for (const { label, size } of [{ label: "1280", size: { width: 1280, height: 900 } }, { label: "390", size: MOBILE }]) {
  test(`H-037: Plotly (línea, WebGL 2D y 3D) se ve dentro de la nota a ${label} px`, async ({ browser, content }) => {
    const { context, page } = await openNoteInEdit(browser, content, size);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 150)));

    // Misma respuesta (cuerpo y cabeceras) que daría el backend, en la URL pública que acepta el saneador.
    const ids = {} as Record<string, string>;
    for (const { file } of KINDS) ids[file] = await upload(page, content.vaults[0].id, file);
    const cookie = await sessionCookie(page);
    await page.route("https://synapse.cjhirashi.com/files/*", async (route) => {
      const id = route.request().url().split("/files/")[1];
      const res = await context.request.get(`/files/${id}`, { headers: { Cookie: cookie } });
      await route.fulfill({ status: res.status(), headers: res.headers(), body: await res.body() });
    });
    const csp = (await context.request.get(`/files/${ids["svg-inline"]}`, { headers: { Cookie: cookie } })).headers()["content-security-policy"];
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).not.toContain("allow-same-origin");

    await page.getByRole("button", { name: "Editar", exact: true }).click();
    await page.getByRole("button", { name: "Código", exact: true }).click();
    await page.locator(".cm-content").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.insertText(KINDS.map(({ file }) => `\n\n<iframe src="https://synapse.cjhirashi.com/files/${ids[file]}"></iframe>\n`).join(""));
    await page.getByRole("button", { name: "Visual", exact: true }).click();

    const frames = page.locator('.milkdown-view iframe[src^="https://synapse.cjhirashi.com/files/"]');
    await expect(frames).toHaveCount(3);
    await expect(frames.first()).toHaveAttribute("sandbox", "allow-scripts");
    for (let i = 0; i < 3; i++) {
      const inner = (await (await frames.nth(i).elementHandle())!.contentFrame())!;
      await expect.poll(() => inner.evaluate(() => (typeof (window as any).Plotly === "object" ? document.querySelectorAll(".main-svg, canvas").length : 0)).catch(() => 0), {
        message: `${KINDS[i].label}: Plotly debe pintar su gráfico`,
        timeout: 30_000,
      }).toBeGreaterThan(0);
      expect(await inner.locator("body").innerText(), `${KINDS[i].label}: sin aviso de WebGL`).not.toMatch(/WebGL is not supported/i);
      await frames.nth(i).scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      await shot(page, `h037-${label}-${KINDS[i].file}`, { selector: `.milkdown-view iframe[src$="${ids[KINDS[i].file]}"]` });
    }
    // Plotly intenta leer `localStorage`; el iframe aislado (sin allow-same-origin) lo rechaza y Plotly lo ignora: es el aislamiento funcionando.
    const own = errors.filter((e) => !/Failed to load resource.*(favicon|manifest)/.test(e) && !/'localStorage' property.*sandboxed/.test(e));
    expect(own, "sin errores de consola propios").toEqual([]);
    await context.close();
  });
}
