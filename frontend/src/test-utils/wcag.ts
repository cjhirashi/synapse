// Utilidades de color para los tests de marca (SPEC-0011; PLAN-0011 §5.2): luminancia relativa y
// contraste WCAG 2.x, tono HSL y lectura de tokens desde `tokens.css`. Sólo para tests: no entra
// al bundle (`vite.config.ts` excluye `src/test-utils` de la cobertura).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type Rgb = [number, number, number];

/** `#rrggbb` → [r, g, b] (0–255). Sólo acepta la forma de seis dígitos que usan los assets. */
export function hexToRgb(hex: string): Rgb {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`color hexadecimal no válido: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Luminancia relativa WCAG 2.x (0 negro … 1 blanco). */
export function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Razón de contraste WCAG 2.x entre dos colores (1 … 21). */
export function contrast(a: Rgb | string, b: Rgb | string): number {
  const la = luminance(typeof a === "string" ? hexToRgb(a) : a);
  const lb = luminance(typeof b === "string" ? hexToRgb(b) : b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Tono HSL en grados (0–360). */
export function hue([r, g, b]: Rgb): number {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const d = max - Math.min(R, G, B);
  if (d === 0) return 0;
  const h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return (h * 60 + 360) % 360;
}

/** Valor de un token de `src/styles/tokens.css` para un tema (`:root` y `:root[data-theme]`). */
export function token(theme: "dark" | "light", name: string): string {
  const css = readFileSync(resolve(__dirname, "../styles/tokens.css"), "utf8");
  const read = (selector: string) => {
    const start = css.indexOf(selector);
    if (start < 0) return {} as Record<string, string>;
    const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
    return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  };
  const value = { ...read(":root {"), ...read(`:root[data-theme="${theme}"]`) }[name];
  if (!value) throw new Error(`tokens.css: sin ${name} para ${theme}`);
  return value;
}
