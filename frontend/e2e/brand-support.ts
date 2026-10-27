// Utilidades compartidas por `brand-header.spec.ts` y `brand-assets.spec.ts` (SPEC-0011). Sin pruebas
// propias: este archivo no casa con `**/*.spec.ts`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { hexToRgb, type Rgb } from "../src/test-utils/wcag";
import { OUT_DIR } from "./out-dir";

/**
 * Comprueba un mínimo (`got ≥ min`) y lo deja en `measurements.json` con la misma forma que las
 * medidas de `fixtures.ts` (que no se modifica, PLAN-0011 R-6): contrastes y proporciones de RF-011/RF-014.
 */
export function expectAtLeast(key: string, label: string, got: number, min: number): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = `${OUT_DIR}/measurements.json`;
  const all: Record<string, unknown> = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  all[key] = { label, got, target: `>= ${min}`, tolerance: 0, ok: got >= min };
  writeFileSync(file, JSON.stringify(all, null, 1));
  expect(got, `${key} ${label}: medido ${got}, mínimo ${min}`).toBeGreaterThanOrEqual(min);
}

export interface Pixels {
  w: number;
  h: number;
  /** RGBA, 4 bytes por píxel, fila a fila. */
  data: number[];
}

/** Decodifica un PNG en el propio navegador (canvas): evita una dependencia de decodificación en Node. */
export async function decodePng(page: Page, png: Buffer): Promise<Pixels> {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    return { w: canvas.width, h: canvas.height, data: Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data) };
  }, png.toString("base64"));
}

/** `rgb(r, g, b)` / `rgba(r, g, b, a)` de `getComputedStyle` → [r, g, b]. */
export function parseRgb(css: string): Rgb {
  const m = /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/.exec(css);
  if (!m) throw new Error(`color no reconocido: ${css}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Paradas (`stop-color` fuera de `<style>`) de un SVG como colores RGB. */
export function svgStops(svg: string): Rgb[] {
  const noStyle = svg.replace(/<style[\s\S]*?<\/style>/g, "");
  return [...noStyle.matchAll(/stop-color[=:]"?(#[0-9a-f]{6})/gi)].map((m) => hexToRgb(m[1]));
}

/** Caja envolvente (en píxeles) de lo que difiere del fondo `bg` en más de `threshold` (suma de canales). */
export function silhouetteBox(px: Pixels, bg: Rgb, threshold = 40): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = px.w, y0 = px.h, x1 = -1, y1 = -1;
  for (let y = 0; y < px.h; y++) {
    for (let x = 0; x < px.w; x++) {
      const i = (y * px.w + x) * 4;
      const diff = Math.abs(px.data[i] - bg[0]) + Math.abs(px.data[i + 1] - bg[1]) + Math.abs(px.data[i + 2] - bg[2]);
      if (diff > threshold) {
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}
