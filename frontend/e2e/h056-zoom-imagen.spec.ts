// H-056: el visor de imagen a pantalla completa tiene zoom: botones, rueda, pellizco táctil real (CDP), arrastre y doble toque.
import type { Page } from "@playwright/test";
import { expect, MOBILE, newSession, shot, test, waitForSynced, waitForVaults } from "./fixtures";

const origin = () => process.env.BASE_URL ?? "http://127.0.0.1:8010";

async function session(user: { email: string; password: string }) {
  const login = await fetch(`${origin()}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: user.email, password: user.password }),
  });
  const cookie = login.headers.getSetCookie().map((line) => line.split(";")[0]).join("; ");
  return async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${origin()}${path}`, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, json: () => JSON.parse(text) as any };
  };
}

async function openDoc(page: Page, folder: string, name: string) {
  const tree = page.getByRole("tree", { name: "Notas" });
  await expect(async () => {
    const show = page.getByRole("button", { name: "Mostrar la barra de notas" });
    if (await show.isVisible()) await show.click();
    await expect(tree.getByRole("treeitem", { name: folder, exact: true })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await tree.getByRole("treeitem", { name: folder, exact: true }).click();
  const row = tree.getByRole("treeitem", { name, exact: true });
  await expect(async () => {
    const show = page.getByRole("button", { name: "Mostrar la barra de notas" });
    if (await show.isVisible()) await show.click();
    await expect(row).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });
  await row.focus();
  await page.keyboard.press("Enter");
}

const label = (page: Page) => page.locator(".image-viewer-zoom-reset").innerText();
const scaleOf = async (page: Page) => parseInt((await label(page)).replace(/\D/g, ""), 10) / 100;
const imgBox = async (page: Page) => (await page.locator(".image-viewer-img").boundingBox())!;

for (const { name, size, touch } of [{ name: "390 táctil", size: MOBILE, touch: true }, { name: "1280 ratón", size: { width: 1280, height: 900 }, touch: false }]) {
  test(`H-056: zoom en el visor de imagen (${name})`, async ({ browser, content }) => {
    const vault = content.vaults[0];
    const api = await session(content);
    const folder = `Zoom${touch ? "T" : "R"}`;
    const image = `${origin()}/icons/icon-512.png`;
    const created = await api("POST", `/vaults/${vault.id}/notes`, {
      path: `${folder}/Imagen.md`, content: `# Imagen\n\n![Logo](${image})\n`, frontmatter: { titulo: "Imagen", descripcion: "Prueba de zoom", tags: [], estado: "borrador" },
    });
    expect(created.status, created.text).toBe(201);

    const context = await newSession(browser, content, { theme: "dark", size, touch });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/vaults/${vault.id}`);
    await waitForVaults(page, content.vaults.length);
    await waitForSynced(page);
    await openDoc(page, folder, "Imagen");
    const reading = page.locator('.milkdown-view[data-mode="read"] .ProseMirror');
    await expect(reading.getByRole("heading", { name: "Imagen", level: 1 })).toBeVisible();
    await reading.locator(".md-img").first().hover();
    await reading.locator(".md-img-fullscreen").first().click();

    const viewer = page.locator(".image-viewer");
    await expect(viewer).toBeVisible();
    await expect(page.locator(".image-viewer-img")).toBeVisible();
    expect(await label(page)).toBe("100 %");
    const base = await imgBox(page);
    expect(base.width).toBeGreaterThan(100);

    // Los controles táctiles miden al menos 44 px y caben en la pantalla
    for (const button of await page.locator(".image-viewer-btn").all()) {
      const box = (await button.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(size.width);
    }
    await shot(page, `h056-visor-${touch ? "390" : "1280"}`);

    // Botones
    await page.getByRole("button", { name: "Acercar" }).click();
    expect(await label(page)).toBe("150 %");
    await expect(async () => expect((await imgBox(page)).width).toBeCloseTo(base.width * 1.5, 0)).toPass({ timeout: 3000 });
    await page.getByRole("button", { name: "Alejar" }).click();
    await expect(page.getByRole("button", { name: "Alejar" })).toBeDisabled();
    expect(await label(page)).toBe("100 %");

    if (touch) {
      // Pellizco real con dos dedos (eventos táctiles del navegador): se separan y la imagen se amplía.
      const cdp = await context.newCDPSession(page);
      const cx = size.width / 2;
      const cy = size.height / 2;
      const touchAt = (a: number, b: number) => [{ x: cx - a, y: cy, id: 1 }, { x: cx + b, y: cy, id: 2 }];
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: touchAt(40, 40) });
      for (const d of [60, 80, 100, 120]) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: touchAt(d, d) });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      const zoomed = await scaleOf(page);
      expect(zoomed).toBeGreaterThan(2.5); // de 80 a 240 px entre dedos ≈ ×3
      expect(zoomed).toBeLessThanOrEqual(3.2);
      const big = await imgBox(page);
      expect(big.width).toBeCloseTo(base.width * zoomed, -1);
      await shot(page, "h056-visor-pellizco-390");

      // Arrastre con un dedo estando ampliada: la imagen se mueve
      const before = await imgBox(page);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cx, y: cy, id: 1 }] });
      for (const dx of [10, 30, 60]) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: cx + dx, y: cy, id: 1 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      expect((await imgBox(page)).x).toBeGreaterThan(before.x + 20);

      // Pellizco hacia adentro: vuelve al 100 %
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: touchAt(150, 150) });
      for (const d of [100, 60, 30, 10]) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: touchAt(d, d) });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      expect(await label(page)).toBe("100 %");

      // Doble toque en la imagen acerca al 250 %
      await page.touchscreen.tap(cx, cy);
      await page.touchscreen.tap(cx, cy);
      await expect(page.locator(".image-viewer-zoom-reset")).toHaveText("250 %");
    } else {
      // Rueda con el cursor sobre la imagen
      const box = await imgBox(page);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, -400);
      await expect.poll(() => scaleOf(page)).toBeGreaterThan(1.5);
      await shot(page, "h056-visor-rueda-1280");

      // Arrastre con el ratón: solo hay a dónde arrastrar cuando la imagen ampliada ya es más ancha que la pantalla (512 px × 3 > 1280)
      await page.mouse.wheel(0, -1500);
      await expect.poll(() => scaleOf(page)).toBeGreaterThan(2.6);
      const before = await imgBox(page);
      await page.mouse.move(size.width / 2, size.height / 2); // la imagen ampliada se sale de la pantalla: se agarra por el centro
      await page.mouse.down();
      await page.mouse.move(size.width / 2 + 60, size.height / 2 + 30, { steps: 5 });
      await page.mouse.up();
      expect((await imgBox(page)).x).toBeGreaterThan(before.x + 20);
      expect(await page.locator(".image-viewer").count()).toBe(1); // arrastrar no cierra

      // Teclas
      await page.keyboard.press("0");
      expect(await label(page)).toBe("100 %");
      await page.keyboard.press("+");
      expect(await label(page)).toBe("150 %");
    }

    // El botón × y el toque limpio en el fondo cierran
    await page.getByRole("button", { name: "Cerrar pantalla completa" }).click();
    await expect(viewer).toHaveCount(0);
    expect(errors, "sin errores de página").toEqual([]);

    // Limpieza
    await api("DELETE", `/vaults/${vault.id}/notes/${created.json().id}`);
    await context.close();
  });
}
