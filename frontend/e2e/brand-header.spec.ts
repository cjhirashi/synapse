// Identidad de marca en Chromium real: cabecera y login (SPEC-0011; PLAN-0011 §5.3).
// Cada prueba lleva en el título su id (B-n) y el RF que cubre (Art. 9). Capturas y medidas van a
// VISUAL_OUT_DIR (/tmp/s11/e2e), fuera del repo, para la aprobación de Carlos (RNF-002).
import { mkdirSync, writeFileSync } from "node:fs";
import { contrast } from "../src/test-utils/wcag";
import { decodePng, expectAtLeast, parseRgb, silhouetteBox, svgStops } from "./brand-support";
import { expect, expectMeasure, measure, MOBILE, openWorkspace, shot, SIZES, test, THEMES, tokens, type Size, type Theme } from "./fixtures";
import { OUT_DIR } from "./out-dir";

/** Anchos de la verificación: los dos de escritorio del mockup más el móvil. */
const WIDTHS: Size[] = [MOBILE, SIZES[1], SIZES[0]];

/**
 * Alto de `.app-header` ANTES de tocar `AppLayout` (B-0, RF-010), medido sobre el HEAD previo al
 * logo. 1024/1440 miden 71 (70 de contenido + 1 de borde inferior; dentro de 70 ± 1); a 390 px la cabecera se envuelve y su alto es el que fija
 * esta línea base. Clave: `${tema}-${ancho}`.
 */
export const HEADER_BASELINE: Record<string, number> = {
  "dark-390": 112,
  "dark-1024": 71,
  "dark-1440": 71,
  "light-390": 112,
  "light-1024": 71,
  "light-1440": 71,
};

// B-0 · línea base de la cabecera (RF-010)
test("B-0 línea base del alto de la cabecera antes del logo (RF-010)", async ({ browser, seeded }) => {
  const heights: Record<string, number> = {};
  for (const theme of THEMES) {
    for (const size of WIDTHS) {
      const { context, page } = await openWorkspace(browser, seeded, { theme, size });
      heights[`${theme}-${size.width}`] = (await page.locator(".app-header").boundingBox())!.height;
      await context.close();
    }
  }
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/header-baseline.json`, JSON.stringify(heights, null, 1));
});

// B-1 · cabecera con el logo (RF-008, RF-009, RF-010)
for (const theme of THEMES) {
  for (const size of WIDTHS) {
    test(`B-1 cabecera con logo, ${theme} ${size.width} (RF-008, RF-009, RF-010)`, async ({ browser, seeded }) => {
      const { context, page } = await openWorkspace(browser, seeded, { theme, size });
      const key = `${theme}-${size.width}`;

      // RF-008: el bloque de marca es lo primero de la cabecera, con el logo antes del texto.
      await expect(page.locator(".app-header > :first-child")).toHaveClass(/app-brand/);
      await expect(page.locator(".app-brand-mark")).toHaveCount(0);
      const logo = await measure(page, ".app-brand .brand-logo");
      const text = await page.locator(".app-brand").evaluate((el) => {
        const node = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim() === "Synapse")!;
        const range = document.createRange();
        range.selectNodeContents(node);
        const b = range.getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      });
      expect(logo.x + logo.w, `RF-008 ${key}: el logo termina antes del texto`).toBeLessThanOrEqual(text.x + 0.5);
      expect(logo.x, `RF-008 ${key}: borde izquierdo`).toBeLessThanOrEqual(32);

      // RF-009: caja cuadrada de 28 px (24–32) centrada en vertical con el texto.
      expectMeasure(`RF-009 ancho ${key}`, "ancho del logo", logo.w, 28, 0.5);
      expectMeasure(`RF-009 alto ${key}`, "alto del logo", logo.h, 28, 0.5);
      expectMeasure(`RF-009 centrado ${key}`, "|centro del logo - centro del texto|", Math.abs(logo.y + logo.h / 2 - (text.y + text.h / 2)), 0, 1);

      // RF-010: alto de la cabecera y sin scroll horizontal.
      const header = await measure(page, ".app-header");
      const expected = size.width === MOBILE.width ? HEADER_BASELINE[key] : 70;
      expectMeasure(`RF-010 alto ${key}`, "alto de .app-header", header.h, expected, 1);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `RF-010 ${key}: sin scroll horizontal`).toBeLessThanOrEqual(0);

      await shot(page, `header-${key}`, { selector: ".app-header" });
      await shot(page, `header-full-${key}`);
      await context.close();
    });
  }
}

// B-2 · silueta (RF-011) y B-3 · color en uso (RF-014)
for (const theme of THEMES) {
  test(`B-2/B-3 silueta y contraste del logo de cabecera, ${theme} (RF-011, RF-014)`, async ({ browser, seeded }) => {
    const { context, page } = await openWorkspace(browser, seeded, { theme, size: SIZES[1] });
    const bg = parseRgb((await measure(page, ".app-header")).bg);

    // B-2: la silueta ocupa ≥ 90 % del lado mayor de la caja de 28 px (el original deja un 20 % de margen).
    const px = await decodePng(page, await page.locator(".app-brand .brand-logo").screenshot());
    const box = silhouetteBox(px, bg)!;
    expectAtLeast(`RF-011 silueta ${theme}`, "lado mayor de la silueta / lado de la caja (28 px)", Math.max(box.x1 - box.x0, box.y1 - box.y0) / 28, 0.9);

    // B-3: el SVG que se está pintando (según el tema) y sus paradas contra el fondo computado de la cabecera.
    const url = await page.locator(".app-brand .brand-logo").evaluate((el) => /url\("?([^")]+)"?\)/.exec(getComputedStyle(el).backgroundImage)![1]);
    expect(url, `variante usada en ${theme}`).toContain(`logo-synapse-${theme}.svg`);
    const svg = await (await page.request.get(url)).text();
    const stops = svgStops(svg);
    expect(stops.length).toBeGreaterThanOrEqual(4);
    const worst = Math.min(...stops.map((c) => contrast(c, bg)));
    expectAtLeast(`RF-014 contraste ${theme}`, "mínimo de las paradas vs fondo computado de .app-header", worst, 3);
    await context.close();
  });
}

// B-8 · login con el logo (RF-017)
for (const theme of THEMES) {
  for (const size of [MOBILE, SIZES[0]]) {
    test(`B-8 login con logo, ${theme} ${size.width} (RF-017)`, async ({ browser }) => {
      const key = `${theme}-${size.width}`;
      const context = await browser.newContext({ baseURL: process.env.BASE_URL, viewport: size, reducedMotion: "reduce" });
      await context.addInitScript((mode) => localStorage.setItem("synapse-theme", mode), theme);
      const page = await context.newPage();
      await page.goto("/login");
      await expect(page.getByLabel("Correo")).toBeVisible();

      // El logo precede a «Synapse», es decorativo y no hay `.auth-logo-mark`.
      await expect(page.locator(".auth-logo-mark")).toHaveCount(0);
      const logo = await measure(page, ".auth-logo .brand-logo");
      const text = await measure(page, ".auth-logo-text");
      expect(logo.x + logo.w, `RF-017 ${key}: el logo va antes del texto`).toBeLessThanOrEqual(text.x + 0.5);
      expectMeasure(`RF-017 tamaño ${key}`, "lado del logo del login", logo.w, 32, 0.5);
      expect(await page.locator(".auth-logo .brand-logo").getAttribute("aria-hidden")).toBe("true");
      await expect(page.locator(".auth-logo")).toHaveText("Synapse");

      // RF-014 aplicado al login: paradas del SVG en uso contra el fondo computado de `.auth-card`.
      const bg = parseRgb((await measure(page, ".auth-card")).bg);
      const url = await page.locator(".auth-logo .brand-logo").evaluate((el) => /url\("?([^")]+)"?\)/.exec(getComputedStyle(el).backgroundImage)![1]);
      expect(url).toContain(`logo-synapse-${theme}.svg`);
      const worst = Math.min(...svgStops(await (await page.request.get(url)).text()).map((c) => contrast(c, bg)));
      expectAtLeast(`RF-017 contraste ${key}`, "mínimo de las paradas vs fondo computado de .auth-card", worst, 3);

      await shot(page, `login-${key}`);
      await context.close();
    });
  }
}

// B-9 · una sola marca por pantalla privada (RF-018)
test("B-9 el bloque de marca aparece una sola vez por pantalla privada (RF-018)", async ({ browser, seeded }) => {
  const { context, page } = await openWorkspace(browser, seeded, { theme: "dark", size: SIZES[0] });
  const routes = ["/vaults", `/vaults/${seeded.vaults[0].id}`, "/vaults/trash", "/settings/password"];
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator(".app-header")).toBeVisible();
    await expect(page.locator(".app-brand"), `${route}: bloques de marca`).toHaveCount(1);
    await expect(page.locator(".brand-logo"), `${route}: logos`).toHaveCount(1);
    await expect(page.locator(".app-header .brand-logo"), `${route}: el logo vive en la cabecera`).toHaveCount(1);
  }
  await context.close();
});

/** Color del `<meta name="theme-color">` del documento. */
const themeColor = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content ?? null);

// B-4 · cambio de tema sin recarga (RF-016)
for (const [from, to, label] of [
  ["dark", "light", "Tema claro"],
  ["light", "dark", "Tema oscuro"],
] as const) {
  test(`B-4 cambio de tema ${from}→${to} sin recargar: logo y theme-color (RF-016)`, async ({ browser, seeded }) => {
    const { context, page } = await openWorkspace(browser, seeded, { theme: from, size: SIZES[0] });
    const logoUrl = () => page.locator(".app-brand .brand-logo").evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(await logoUrl()).toContain(`logo-synapse-${from}.svg`);
    expect(await themeColor(page)).toBe(tokens(from)["--bg-secondary"]);

    // La marca sobrevive sólo si no hay recarga de la página.
    await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));
    await page.getByRole("button", { name: label }).click();

    // El efecto de `useTheme` se aplica tras el clic, no dentro de él: se espera (≤ 500 ms) en lugar de leer al instante.
    await expect.poll(logoUrl, { timeout: 500 }).toContain(`logo-synapse-${to}.svg`);
    await expect.poll(() => themeColor(page), { timeout: 500 }).toBe(tokens(to)["--bg-secondary"]);
    // El logo de la otra variante (no precargada, P-12) vuelve a estar pintado en ≤ 500 ms.
    const header = parseRgb((await measure(page, ".app-header")).bg);
    await expect
      .poll(async () => silhouetteBox(await decodePng(page, await page.locator(".app-brand .brand-logo").screenshot()), header) !== null, { timeout: 500 })
      .toBe(true);
    expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload), "la página no se recargó").toBe(true);
    await context.close();
  });
}

// B-5 · theme-color al cargar = --bg-secondary del tema resuelto (RF-016)
const CASES: Array<{ name: string; theme: Theme | "system" | null; colorScheme?: "light" | "dark"; expected: Theme }> = [
  { name: "sin preferencia (defecto oscuro)", theme: null, expected: "dark" },
  { name: "synapse-theme=light", theme: "light", expected: "light" },
  { name: "synapse-theme=dark", theme: "dark", expected: "dark" },
  { name: "sistema con SO claro", theme: "system", colorScheme: "light", expected: "light" },
  { name: "sistema con SO oscuro", theme: "system", colorScheme: "dark", expected: "dark" },
];
for (const c of CASES) {
  test(`B-5 theme-color al cargar, ${c.name} (RF-016)`, async ({ browser, seeded }) => {
    const { context, page } = await openWorkspace(browser, seeded, { theme: c.theme as Theme | null, colorScheme: c.colorScheme, size: SIZES[0] });
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe(c.expected);
    expect(await themeColor(page)).toBe(tokens(c.expected)["--bg-secondary"]);
    await context.close();
  });
}

// B-6 · forced-colors: logo monocromo y visible (RF-019)
for (const theme of THEMES) {
  test(`B-6 forced-colors activo, ${theme}: logo monocromo con contraste ≥ 3:1 y «Synapse» visible (RF-019)`, async ({ browser, seeded }) => {
    const { context, page } = await openWorkspace(browser, seeded, { theme, size: SIZES[0] });
    await page.emulateMedia({ forcedColors: "active" });
    await expect(page.locator(".app-brand")).toHaveText("Synapse");
    await expect(page.locator(".app-brand")).toBeVisible();
    // La captura va antes de las aserciones: si una falla, hay algo que leer.
    await shot(page, `forced-${theme}`, { selector: ".app-header" });

    const bg = parseRgb((await measure(page, ".app-header")).bg);
    const px = await decodePng(page, await page.locator(".app-brand .brand-logo").screenshot());
    // Píxeles sólidos del logo: los del borde antialiasado se mezclan con el fondo y no son "el color del logo",
    // así que sólo cuentan los que están a ≥ 90 % de la distancia máxima al fondo.
    const diffs = Array.from({ length: px.data.length / 4 }, (_, p) => Math.abs(px.data[p * 4] - bg[0]) + Math.abs(px.data[p * 4 + 1] - bg[1]) + Math.abs(px.data[p * 4 + 2] - bg[2]));
    const farthest = Math.max(...diffs);
    const solid: Array<[number, number, number]> = [];
    diffs.forEach((d, p) => d >= 0.9 * farthest && solid.push([px.data[p * 4], px.data[p * 4 + 1], px.data[p * 4 + 2]]));
    expect(solid.length, "píxeles sólidos del logo").toBeGreaterThan(20);
    // Monocromo: ningún tono (los canales de cada píxel sólido coinciden) y todos del mismo color.
    for (const [r, g, b] of solid) expect(Math.max(r, g, b) - Math.min(r, g, b), "sin tono").toBeLessThanOrEqual(8);
    expectAtLeast(`RF-019 contraste ${theme}`, "contraste del logo forzado vs Canvas", Math.min(...solid.map((c) => contrast(c, bg))), 3);
    const textColor = parseRgb(await page.locator(".app-brand").evaluate((el) => getComputedStyle(el).color));
    expectAtLeast(`RF-019 texto ${theme}`, "contraste de «Synapse» vs Canvas", contrast(textColor, bg), 3);

    await context.close();
  });
}

// B-7 · el asset del logo no carga: cabecera íntegra y sin icono roto (RF-020)
for (const theme of THEMES) {
  test(`B-7 logo que no carga, ${theme}: «Synapse» visible, caja y alto intactos, sin marco de imagen rota (RF-020)`, async ({ browser, seeded }) => {
    const { context, page } = await openWorkspace(browser, seeded, { theme, size: SIZES[0] });
    await context.route("**/logo-synapse-*.svg", (route) => route.abort());
    await page.reload();
    await expect(page.locator(".app-brand")).toHaveText("Synapse");

    const logo = await measure(page, ".app-brand .brand-logo");
    expectMeasure(`RF-020 ancho ${theme}`, "caja del logo sin asset", logo.w, 28, 0.5);
    expectMeasure(`RF-020 alto ${theme}`, "caja del logo sin asset", logo.h, 28, 0.5);
    expectMeasure(`RF-020 cabecera ${theme}`, "alto de .app-header sin asset", (await measure(page, ".app-header")).h, 70, 1);
    // Sin alternativa visible y sin <img> roto: el bloque sólo contiene el span y el texto.
    expect(await page.locator(".app-brand img").count()).toBe(0);
    expect(await page.locator(".app-brand").innerText()).toBe("Synapse");
    // Sin marco gris: todos los píxeles de la caja tienen el color del fondo de la cabecera.
    const bg = parseRgb((await measure(page, ".app-header")).bg);
    const px = await decodePng(page, await page.locator(".app-brand .brand-logo").screenshot());
    expect(silhouetteBox(px, bg, 6), "la caja vacía no pinta nada").toBeNull();

    await shot(page, `broken-${theme}`, { selector: ".app-header" });
    await context.close();
  });
}
