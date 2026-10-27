// Estilos del logo (SPEC-0011; PLAN-0011 §2.3a): se leen como texto, igual que `layoutCss.test.ts`,
// porque jsdom no pinta imágenes de fondo. Lo que depende del render real lo miden B-1…B-7 en Chromium.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

// Sin comentarios: los de brand.css nombran los selectores y confundirían a `rule`.
const css = readFileSync(resolve(__dirname, "brand.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Cuerpo de la primera regla cuyo selector es exactamente `selector` (fuera de `@media`). */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`brand.css: sin la regla ${selector}`);
  return m[1];
}

/** Tamaños de contexto (RF-009: la cabecera entre 24 y 32 px; el login, 32 px como el mockup 1.1.4.3). */
const sizeIn = (file: string, selector: string) => {
  const text = readFileSync(resolve(__dirname, file), "utf8");
  const m = new RegExp(`${selector.replace(".", "\\.")}\\s*\\{[^}]*--brand-logo-size:\\s*(\\d+)px`).exec(text);
  return m ? Number(m[1]) : null;
};

describe("brand.css", () => {
  test("RF-009: la cabecera pone el logo en 28 px (entre 24 y 32)", () => {
    const px = sizeIn("../layout/AppLayout.css", ".app-brand");
    expect(px).toBe(28);
    expect(px!).toBeGreaterThanOrEqual(24);
    expect(px!).toBeLessThanOrEqual(32);
  });


  test("RF-017: el login pone el logo en 32 px, como el .logo-mark del mockup 1.1.4.3", () => {
    expect(sizeIn("../auth/AuthShell.css", ".auth-logo")).toBe(32);
  });

  test("RF-014: por defecto (tema oscuro) el fondo es la variante oscura del logo", () => {
    expect(rule(".brand-logo")).toMatch(/background:\s*url\("\/logo-synapse-dark\.svg"\)/);
  });

  test("RF-016: bajo data-theme=light el fondo es la variante clara (el tema lo decide CSS, sin estado de React)", () => {
    expect(rule(':root[data-theme="light"] .brand-logo')).toMatch(/background-image:\s*url\("\/logo-synapse-light\.svg"\)/);
  });

  test("RF-009: el tamaño sale de --brand-logo-size con defecto 28px (dentro de 24–32) y la caja es cuadrada", () => {
    const body = rule(".brand-logo");
    expect(body).toMatch(/inline-size:\s*var\(--brand-logo-size,\s*28px\)/);
    expect(body).toMatch(/block-size:\s*var\(--brand-logo-size,\s*28px\)/);
    expect(body).toMatch(/flex-shrink:\s*0/);
  });
});
