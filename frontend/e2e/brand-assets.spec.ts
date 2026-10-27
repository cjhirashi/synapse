// Iconos y archivos de marca servidos por el backend real, medidos en Chromium (SPEC-0011;
// PLAN-0011 §5.3: A-1…A-4). Los PNG se decodifican en el navegador (`decodePng`) tal como los ve un
// cliente. Cada prueba lleva su RF en el título (Art. 9). Capturas y medidas en VISUAL_OUT_DIR.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { decodePng, expectAtLeast } from "./brand-support";
import { contrast, hexToRgb, luminance, type Rgb } from "../src/test-utils/wcag";
import { expect, shot, test } from "./fixtures";

/** --bg-primary oscuro (D-10): el fondo opaco de apple-touch y maskable. */
const BG = [0x12, 0x12, 0x1a] as const;

// A-2 · apple-touch (180) y maskable (512): opacos y con la silueta dentro de la zona segura (RF-003, RF-006)
for (const { path, side } of [
  { path: "/apple-touch-icon.png", side: 180 },
  { path: "/icons/icon-maskable-512.png", side: 512 },
]) {
  test(`A-2 ${path}: ${side}×${side}, todos los píxeles opacos y silueta dentro del círculo del 80 % (RF-003, RF-006)`, async ({ browser, request }) => {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    const page = await browser.newPage();
    const px = await decodePng(page, Buffer.from(await res.body()));
    await page.close();
    expect([px.w, px.h]).toEqual([side, side]);

    let transparent = 0;
    let maxRadius = 0;
    for (let y = 0; y < px.h; y++) {
      for (let x = 0; x < px.w; x++) {
        const i = (y * px.w + x) * 4;
        if (px.data[i + 3] !== 255) transparent++;
        const diff = Math.abs(px.data[i] - BG[0]) + Math.abs(px.data[i + 1] - BG[1]) + Math.abs(px.data[i + 2] - BG[2]);
        if (diff > 12) maxRadius = Math.max(maxRadius, Math.hypot(x + 0.5 - side / 2, y + 0.5 - side / 2));
      }
    }
    expect(transparent, "píxeles con alfa < 255").toBe(0);
    // Zona segura de RF-006: círculo de diámetro 80 % del lado = radio 0,4·lado.
    expect(maxRadius, `radio máximo ${maxRadius.toFixed(1)} px`).toBeLessThanOrEqual(0.4 * side);
    expectAtLeast(`RF-006 holgura ${side}`, "margen entre la silueta y el borde de la zona segura (px)", 0.4 * side - maxRadius, 0);
  });
}

// A-4 · cada archivo de marca contra el backend real: 200 y tipo MIME (RF-001…RF-005)
const FILES: Record<string, string> = {
  "/favicon.svg": "image/svg+xml",
  "/favicon.ico": "image/vnd.microsoft.icon",
  "/apple-touch-icon.png": "image/png",
  "/icons/icon-192.png": "image/png",
  "/icons/icon-512.png": "image/png",
  "/icons/icon-maskable-512.png": "image/png",
  "/logo-synapse-dark.svg": "image/svg+xml",
  "/logo-synapse-light.svg": "image/svg+xml",
  "/manifest.webmanifest": "application/manifest+json",
};
for (const [path, type] of Object.entries(FILES)) {
  test(`A-4 ${path} responde 200 con ${type} (RF-001…RF-005)`, async ({ request }) => {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"].split(";")[0]).toBe(type);
  });
}

// A-1 · silueta = la del original (RF-011, RF-015; PLAN-0011 P-1)
const PUBLIC = resolve(process.cwd(), "public");
const ORIGINAL = resolve(process.cwd(), "scripts/brand/source/logo-synapse.original.svg");
/** Recorte de RF-011 (D-7): el viewBox que usan las variantes publicadas; se aplica al original para comparar a igual encuadre. */
const CROP_VIEWBOX = "146 213 1205 1073";
const SIDE = 256;
/** Alto del recorte a 256 px de ancho: 256 × 1073 / 1205 = 227,9. */
const HEIGHT = Math.round((SIDE * 1073) / 1205);

/** Máscara de opacidad (alfa > 0, P-1) de un SVG pintado a 256 px de ancho, como bytes 0/1 por píxel. */
async function alphaMask(page: Page, svg: string): Promise<number[]> {
  return page.evaluate(
    async ({ svg, side, height }) => {
      const img = new Image();
      img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = side;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, side, height);
      const data = ctx.getImageData(0, 0, side, height).data;
      return Array.from({ length: side * height }, (_, p) => (data[p * 4 + 3] > 0 ? 1 : 0));
    },
    { svg, side: SIDE, height: HEIGHT },
  );
}

/** El original con su viewBox sustituido por el recorte y sin tamaño intrínseco (se dibuja a 256 px). */
function croppedOriginal(): string {
  return readFileSync(ORIGINAL, "utf8")
    .replace(/viewBox="[^"]*"/, `viewBox="${CROP_VIEWBOX}"`)
    .replace(/\s(width|height)="[^"]*"/g, "");
}

const SHAPES: Array<{ name: string; file: string; scheme?: "light" | "dark" }> = [
  { name: "variante oscura", file: "logo-synapse-dark.svg" },
  { name: "variante clara", file: "logo-synapse-light.svg" },
  { name: "favicon con esquema claro", file: "favicon.svg", scheme: "light" },
  { name: "favicon con esquema oscuro", file: "favicon.svg", scheme: "dark" },
];

test("A-1 la silueta de cada SVG publicado difiere ≤ 1 % de la del original y mide 256×228 (RF-011, RF-015)", async ({ browser }) => {
  const page = await browser.newPage();
  const reference = await alphaMask(page, croppedOriginal());
  const total = reference.length;
  expect(reference.some((v) => v === 1), "el original recortado pinta algo").toBe(true);

  for (const shape of SHAPES) {
    await page.emulateMedia({ colorScheme: shape.scheme ?? "light" });
    const mask = await alphaMask(page, readFileSync(resolve(PUBLIC, shape.file), "utf8"));
    const different = mask.reduce((n, v, p) => n + (v !== reference[p] ? 1 : 0), 0);
    const percent = (100 * different) / total;
    expectAtLeast(`RF-015 ${shape.name}`, `1 - diferencia de máscara (%; medido ${percent.toFixed(3)} %, tope 1 %)`, 1 - percent / 100, 0.99);

    // RF-011: la silueta ocupa todo el ancho de 256 px y ≈ 228 px de alto (sin el margen del original).
    const rows = Array.from({ length: HEIGHT }, (_, y) => mask.slice(y * SIDE, (y + 1) * SIDE));
    const cols = Array.from({ length: SIDE }, (_, x) => rows.some((r) => r[x] === 1));
    const filledRows = rows.filter((r) => r.includes(1)).length;
    expect(cols.filter(Boolean).length, `${shape.name}: ancho de la silueta`).toBeGreaterThanOrEqual(SIDE - 2);
    expect(filledRows, `${shape.name}: alto de la silueta`).toBeGreaterThanOrEqual(HEIGHT - 2);
  }
  await page.close();
});

// A-3 · pestaña simulada (RF-007, RNF-002; PLAN-0011 P-13). Chromium sin interfaz no tiene barra de pestañas:
// se pinta `favicon.svg` a 16 y 32 px (DPR 2) sobre el fondo de pestaña de referencia de cada esquema (#ffffff
// claro, #202124 oscuro) con el esquema emulado, que es justo lo que evalúa `prefers-color-scheme` dentro del SVG.
const TABS = [
  { scheme: "light", bg: "#ffffff", fg: "#202124" },
  { scheme: "dark", bg: "#202124", fg: "#e8eaed" },
] as const;

test("A-3 favicon en pestaña simulada: contraste ≥ 3:1 en cada esquema y paleta distinta entre esquemas (RF-007, RNF-002)", async ({ browser, baseURL }) => {
  const meanLuminance: Record<string, number> = {};
  for (const tab of TABS) {
    const context = await browser.newContext({ deviceScaleFactor: 2, colorScheme: tab.scheme, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.setContent(
      `<body style="margin:0;background:${tab.bg};font:13px system-ui;color:${tab.fg}">` +
        `<div id="strip" style="display:flex;align-items:center;gap:8px;padding:10px 12px;width:260px">` +
        `<img id="f16" src="${baseURL}/favicon.svg" width="16" height="16"><span>Synapse</span>` +
        `<img id="f32" src="${baseURL}/favicon.svg" width="32" height="32" style="margin-left:auto"></div></body>`,
    );
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));

    const bg = hexToRgb(tab.bg);
    for (const id of ["f16", "f32"]) {
      const px = await decodePng(page, await page.locator(`#${id}`).screenshot());
      // Píxeles sólidos (≥ 90 % de la distancia máxima al fondo): los del borde antialiasado se mezclan con él.
      const diffs = Array.from({ length: px.data.length / 4 }, (_, p) => Math.abs(px.data[p * 4] - bg[0]) + Math.abs(px.data[p * 4 + 1] - bg[1]) + Math.abs(px.data[p * 4 + 2] - bg[2]));
      const farthest = Math.max(...diffs);
      const solid: Rgb[] = [];
      diffs.forEach((d, p) => d >= 0.9 * farthest && solid.push([px.data[p * 4], px.data[p * 4 + 1], px.data[p * 4 + 2]]));
      expectAtLeast(`RF-007 ${tab.scheme} ${id}`, `contraste mínimo de los píxeles sólidos del favicon vs ${tab.bg}`, Math.min(...solid.map((c) => contrast(c, bg))), 3);
      if (id === "f32") meanLuminance[tab.scheme] = luminance([0, 1, 2].map((k) => solid.reduce((n, c) => n + c[k], 0) / solid.length) as Rgb);
    }
    await shot(page, `tab-${tab.scheme}`, { selector: "#strip" });
    await context.close();
  }
  // El color pintado es el de la paleta del esquema: la de `favicon-dark` es más clara que la `light`.
  expect(meanLuminance.dark, "luminancia media del favicon en oscuro > en claro").toBeGreaterThan(meanLuminance.light);
});
