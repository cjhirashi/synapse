// Núcleo de presentación del ícono de bóveda (SPEC-0009 RF-001, RF-006; PLAN-0009 §2.1, P-1, P-2).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@testing-library/react";
import { createElement } from "react";
import { expect, test } from "vitest";
import { initials as initialsFromRail } from "../notes/VaultRail";
import {
  COLOR_LABELS,
  colorVar,
  SECONDARY,
  derivedColor,
  formatIcon,
  ICON_LABELS,
  ICON_SET,
  initials,
  PALETTE,
  parseIcon,
} from "./vaultIcon";

const GLYPHS = [
  "folder", "folder-heart", "book", "book-open", "notebook", "brain", "briefcase", "code",
  "flask-conical", "graduation-cap", "heart", "house", "lightbulb", "music", "palette", "pen-tool",
  "rocket", "star", "target", "users", "camera", "globe", "leaf", "dumbbell",
];

test("RF-001: ICON_SET es el set curado de 24 glifos y todos son componentes que dibujan un svg", () => {
  expect(Object.keys(ICON_SET)).toEqual(GLYPHS);
  for (const [id, Icon] of Object.entries(ICON_SET)) {
    const { container, unmount } = render(createElement(Icon));
    expect(container.querySelector("svg"), id).not.toBeNull();
    unmount();
  }
});

test("RF-011: cada glifo y cada color tiene su nombre accesible en español", () => {
  expect(Object.keys(ICON_LABELS)).toEqual(GLYPHS);
  expect(Object.values(ICON_LABELS).every((label) => label.length > 0)).toBe(true);
  expect(new Set(Object.values(ICON_LABELS)).size, "nombres únicos").toBe(GLYPHS.length);
  expect(ICON_LABELS.star).toBe("Estrella");
  // H-008 C-11: las 5 claves de siempre más las 12 familias Tailwind nuevas, cada una con su etiqueta única.
  expect(COLOR_LABELS).toEqual({
    accent: "Cian", info: "Azul", success: "Verde", warning: "Ámbar", danger: "Rojo",
    orange: "Naranja", yellow: "Amarillo", lime: "Lima", emerald: "Esmeralda", teal: "Verde azulado",
    blue: "Azul real", indigo: "Índigo", violet: "Violeta", purple: "Púrpura", fuchsia: "Fucsia",
    pink: "Rosa", rose: "Rosado",
  });
  expect(new Set(Object.values(COLOR_LABELS)).size, "etiquetas de color únicas").toBe(PALETTE.length);
});

const tokens = readFileSync(resolve(__dirname, "../styles/tokens.css"), "utf8");

/** Variables de un tema de `tokens.css` (mismo método que `notes/accentContrast.test.ts`). */
function theme(name: "light" | "dark"): Record<string, string> {
  const block = tokens.match(new RegExp(`:root\\[data-theme="${name}"\\]\\s*\\{([^}]*)\\}`))![1];
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

/** Token CSS al que apunta `colorVar(key)` (p. ej. `var(--vault-orange)` → `vault-orange`). */
const tokenOf = (key: (typeof PALETTE)[number]) => colorVar(key).match(/var\((--[\w-]+)\)/)![1].slice(2);

test("RF-006 (H-008 C-10): PALETTE son 17 claves que existen como tokens hex en los dos temas", () => {
  expect([...PALETTE]).toEqual([
    "accent", "info", "success", "warning", "danger",
    "orange", "yellow", "lime", "emerald", "teal",
    "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose",
  ]);
  for (const mode of ["light", "dark"] as const) {
    for (const key of PALETTE) expect(theme(mode)[tokenOf(key)], `${mode} ${key}`).toMatch(/^#[0-9a-f]{6}$/i);
  }
});

test("H-014 C-5/C-10: SECONDARY mapea cada color de la paleta a su vecino análogo (cambio 2026-10-30)", () => {
  // El secundario es el color de la MISMA paleta a ~20-40° (el siguiente en la rueda), no el opuesto:
  // cambio sutil respecto al color de la bóveda. Nunca inventa un color fuera de la paleta.
  expect(SECONDARY).toEqual({
    danger: "orange", orange: "yellow", warning: "lime", yellow: "lime", lime: "success",
    success: "teal", emerald: "accent", teal: "info", accent: "blue", info: "indigo",
    blue: "indigo", indigo: "violet", violet: "fuchsia", purple: "fuchsia", fuchsia: "pink",
    pink: "rose", rose: "orange",
  });
  // Cobertura total y cierre: cada clave de la paleta tiene secundario, y todo secundario es a su vez
  // una clave válida distinta de la propia (así `colorVar(SECONDARY[k])` siempre resuelve a un token).
  expect(Object.keys(SECONDARY).sort()).toEqual([...PALETTE].sort());
  for (const key of PALETTE) {
    expect(PALETTE).toContain(SECONDARY[key]);
    expect(SECONDARY[key], key).not.toBe(key);
  }
});

test("RF-001: parseIcon lee «glifo[:color]» y degrada lo desconocido sin lanzar", () => {
  expect(parseIcon("folder-heart:accent")).toEqual({ glyph: "folder-heart", color: "accent" });
  expect(parseIcon("star")).toEqual({ glyph: "star", color: null });
  expect(parseIcon("initials:success")).toEqual({ glyph: null, color: "success" });
  expect(parseIcon("initials")).toEqual({ glyph: null, color: null });
  // Glifo desconocido → iniciales; color desconocido → derivado (nunca llega al estilo).
  expect(parseIcon("carpeta:accent")).toEqual({ glyph: null, color: "accent" });
  expect(parseIcon("star:fucsia")).toEqual({ glyph: "star", color: null });
  expect(parseIcon("star:accent:extra")).toEqual({ glyph: null, color: null });
  for (const raw of [null, undefined, "", "<svg onload=x>", "javascript:alert(1)", "a:b:c", "STAR"]) {
    expect(parseIcon(raw), String(raw)).toEqual({ glyph: null, color: null });
  }
});

test("RF-001: formatIcon es el inverso de parseIcon para todas las combinaciones", () => {
  expect(formatIcon("star", "accent")).toBe("star:accent");
  expect(formatIcon("star", null)).toBe("star");
  expect(formatIcon(null, "success")).toBe("initials:success");
  expect(formatIcon(null, null)).toBeNull();
  for (const glyph of [null, ...GLYPHS]) {
    for (const color of [null, ...PALETTE]) {
      const text = formatIcon(glyph, color);
      expect(parseIcon(text), `${glyph}/${color}`).toEqual({ glyph, color });
    }
  }
});

test("RF-001: derivedColor es estable, está en la paleta y reparte las bóvedas", () => {
  // UUID v4 sintéticos y deterministas (generador congruencial): hex «aleatorio» como los reales.
  let seed = 12345;
  const hex = (length: number) =>
    Array.from({ length }, () => ((seed = (seed * 1103515245 + 12345) % 2147483648), (seed >> 16) % 16).toString(16)).join("");
  const ids = Array.from({ length: 60 }, () => `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`);
  const colors = ids.map(derivedColor);
  expect(colors.every((color) => (PALETTE as readonly string[]).includes(color))).toBe(true);
  expect(ids.map(derivedColor)).toEqual(colors);
  expect(new Set(colors).size, "usa varios colores").toBeGreaterThanOrEqual(3);
  // `danger` lee como alerta: sólo se elige a mano, nunca se deriva (enmienda 1, A1-5).
  expect(colors).not.toContain("danger");
  expect(PALETTE).toContain("danger");
});

test("RF-001: initials = primeras letras de las dos primeras palabras (o las dos de una sola)", () => {
  expect(initials("Trabajo Personal")).toBe("TP");
  expect(initials("Notas")).toBe("NO");
  expect(initials("  álvaro  núñez  ")).toBe("ÁN");
  expect(initials("")).toBe("?");
  // `VaultRail` la sigue exportando (su test actual la importa de ahí).
  expect(initialsFromRail).toBe(initials);
});

type Rgba = [number, number, number, number];
function parse(color: string): Rgba {
  const rgba = color.match(/rgba?\(([^)]+)\)/);
  if (rgba) {
    const [r, g, b, a = "1"] = rgba[1].split(",").map((x) => x.trim());
    return [Number(r), Number(g), Number(b), Number(a)];
  }
  const hex = color.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(1) as Rgba;
}
function luminance([r, g, b]: Rgba): number {
  const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * H-008 C-8: el chip ya no es tinte del 18 % + glifo en `--text-primary`, sino un relleno con
 * degradado del color de la bóveda y el glifo en `--bg-secondary` (el fondo que comparten las 3
 * superficies que montan VaultChip). El glifo debe mantener ≥ 4,5:1 contra el extremo MÁS CLARO del
 * degradado, que es donde el relleno menos contrasta. El degradado mezcla `--chip-color` hacia
 * `--text-primary` (la «tinta», opuesta al fondo), con el extremo más claro por tema (VaultChip.css):
 *   oscuro: color-mix(--chip-color 80%, --text-primary)   (tinta clara → aclara el relleno)
 *   claro:  color-mix(--chip-color 65%, --text-primary)   (tinta oscura → oscurece el relleno)
 */
const LIGHTEST_STOP = { dark: 0.8, light: 0.65 } as const;

test("H-014 C-4/C-9: H4 (color-mix bóveda 30% + texto 70%) ≥ 4,5:1 sobre el fondo del editor, los 17, claro y oscuro", () => {
  // C-4 fija el único piso de contraste de la jerarquía: H4 es el tono más sutil (30% del color de la
  // bóveda) y aun así debe leerse ≥ 4,5:1 sobre `--bg-primary` (el fondo del documento) en ambos temas.
  // Mismo cálculo de `color-mix(in srgb, X 30%, --text-primary)` que usa `editor.css` (mezcla lineal sRGB).
  for (const mode of ["light", "dark"] as const) {
    const vars = theme(mode);
    const bg = parse(vars["bg-primary"]);
    const ink = parse(vars["text-primary"]);
    for (const key of PALETTE) {
      const color = parse(vars[tokenOf(key)]);
      const h4 = [0, 1, 2].map((i) => color[i] * 0.3 + ink[i] * 0.7).concat(1) as Rgba;
      expect(ratio(h4, bg), `${mode} ${key}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test("RF-006 (H-008 C-8): el glifo (--bg-secondary) sobre el extremo más claro del degradado da ≥ 4,5:1 para los 17, claro y oscuro", () => {
  for (const mode of ["light", "dark"] as const) {
    const vars = theme(mode);
    const glyph = parse(vars["bg-secondary"]);
    const ink = parse(vars["text-primary"]);
    const pct = LIGHTEST_STOP[mode];
    for (const key of PALETTE) {
      const color = parse(vars[tokenOf(key)]);
      // `color-mix(in srgb, var(--chip-color) pct%, var(--text-primary))`: mezcla lineal en sRGB.
      const lightest = [0, 1, 2].map((i) => color[i] * pct + ink[i] * (1 - pct)).concat(1) as Rgba;
      expect(ratio(glyph, lightest), `${mode} ${key}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});
