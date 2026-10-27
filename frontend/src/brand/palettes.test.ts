// Paletas del logo (SPEC-0011; PLAN-0011 §5.2): `frontend/scripts/brand/palettes.json` es el único
// canon y lo leen el generador de assets y estos tests.
// RF-013 (familia cian, sin navy del original), RF-014 y RF-007 (contraste ≥ 3:1 contra el fondo
// donde se pinta cada paleta).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { contrast, hexToRgb, hue, token } from "../test-utils/wcag";

interface Palette {
  front: [string, string];
  back: [string, string];
}
const palettes = JSON.parse(readFileSync(resolve(__dirname, "../../scripts/brand/palettes.json"), "utf8")) as Record<string, Palette>;
const stops = (name: string) => [...palettes[name].front, ...palettes[name].back];

/** Mínimo contraste de las 4 paradas de la paleta contra un fondo. */
const minContrast = (name: string, bg: string) => Math.min(...stops(name).map((c) => contrast(c, bg)));

describe("paletas del logo", () => {
  test("RF-013: hay exactamente las cuatro paletas del plan", () => {
    expect(Object.keys(palettes).sort()).toEqual(["dark", "favicon-dark", "light", "neutral"]);
  });

  test.each(["dark", "light", "favicon-dark", "neutral"])("RF-013: %s — tono HSL entre 180° y 200° y sin los azules del original", (name) => {
    for (const color of stops(name)) {
      const h = hue(hexToRgb(color));
      expect(h, `${name} ${color}`).toBeGreaterThanOrEqual(180);
      expect(h, `${name} ${color}`).toBeLessThanOrEqual(200);
      expect(["#001430", "#0f3ab5", "#2643d4"]).not.toContain(color.toLowerCase());
    }
  });

  test("RF-013: cada capa es un degradado de dos paradas distintas", () => {
    for (const p of Object.values(palettes)) {
      expect(p.front[0]).not.toBe(p.front[1]);
      expect(p.back[0]).not.toBe(p.back[1]);
    }
  });

  test("RF-014: dark ≥ 3:1 contra --bg-secondary oscuro (tokens.css) y contra #12121a", () => {
    expect(minContrast("dark", token("dark", "--bg-secondary"))).toBeGreaterThanOrEqual(3);
    expect(minContrast("dark", "#12121a")).toBeGreaterThanOrEqual(3);
  });

  test("RF-014: light ≥ 3:1 contra --bg-secondary claro (tokens.css) y contra #ffffff", () => {
    expect(minContrast("light", token("light", "--bg-secondary"))).toBeGreaterThanOrEqual(3);
    expect(minContrast("light", "#ffffff")).toBeGreaterThanOrEqual(3);
  });

  test("RF-007: favicon-dark ≥ 3:1 contra #202124 (barra de pestañas oscura)", () => {
    expect(minContrast("favicon-dark", "#202124")).toBeGreaterThanOrEqual(3);
  });

  test("RF-007: neutral ≥ 3:1 contra pestañas clara y oscura y contra ambos --bg-secondary", () => {
    for (const bg of ["#ffffff", "#202124", token("light", "--bg-secondary"), token("dark", "--bg-secondary")]) {
      expect(minContrast("neutral", bg), `neutral vs ${bg}`).toBeGreaterThanOrEqual(3);
    }
  });
});
