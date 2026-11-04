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

/**
 * H-014 (2026-11-04): secundario y terciario son el primario girado +30° y +60° en OKLCH (`editor.css`,
 * `oklch(from … l c calc(h + 30))`); aquí se repite esa rotación con el mapeo de gama del navegador
 * (se reduce el croma hasta caber en sRGB) para medir contraste y separación con los 17 colores.
 */
const s2l = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const l2s = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function toOklch([r8, g8, b8]: Rgba): [number, number, number] {
  const [r, g, b] = [r8, g8, b8].map((x) => s2l(x / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, Math.hypot(a, bb), ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360];
}
function fromOklch(L: number, C: number, H: number): number[] {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
const inGamut = (v: number[]) => v.every((x) => x >= -1e-4 && x <= 1 + 1e-4);
function rotateHue(color: Rgba, degrees: number): Rgba {
  const [L, C, H] = toOklch(color);
  const target = (H + degrees) % 360;
  let chroma = C;
  if (!inGamut(fromOklch(L, C, target))) {
    let [lo, hi] = [0, C];
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(fromOklch(L, mid, target))) lo = mid;
      else hi = mid;
    }
    chroma = lo;
  }
  const rgb = fromOklch(L, chroma, target).map((x) => Math.min(1, Math.max(0, l2s(Math.max(0, x)))) * 255);
  return [rgb[0], rgb[1], rgb[2], 1];
}

test("H-014 (2026-11-04): el secundario (+30°) y el terciario (+60°) son vecinos del primario y conservan su luminosidad", () => {
  for (const mode of ["light", "dark"] as const) {
    const vars = theme(mode);
    for (const key of PALETTE) {
      const base = parse(vars[tokenOf(key)]);
      const [L0, , H0] = toOklch(base);
      for (const [shift, rotated] of [[30, rotateHue(base, 30)], [60, rotateHue(base, 60)]] as const) {
        const [L1, , H1] = toOklch(rotated);
        const diff = (((H1 - H0 + 540) % 360) - 180 + 360) % 360;
        expect(Math.abs(L1 - L0), `${mode} ${key} +${shift} luminosidad`).toBeLessThan(0.02);
        // Un color casi gris no tiene matiz fiable; los 17 de la paleta son cromáticos.
        expect(Math.abs(diff - shift), `${mode} ${key} +${shift} matiz`).toBeLessThan(2);
      }
    }
  }
});

test("H-014 C-4/C-9 (2026-11-04): los encabezados (H1 primario 600, H2 secundario 600, H3 primario 400, H4 secundario 400) se leen, los 17, claro y oscuro", () => {
  // Rotar en OKLCH conserva la luminosidad: el piso de 2,7:1 de H1-H2 (títulos ≥ 24 px) es el del propio tono 600
  // (índigo en oscuro 2,96; amarillo en claro 2,94, menos la pérdida de croma al caber en sRGB). H3 y H4: 400 tal cual
  // en oscuro (≥ 6:1); en claro, 400 mezclado 60/40 con el texto (≥ 3,5:1; el 400 puro da 1,5:1 en amarillo).
  const shade = (key: (typeof PALETTE)[number], n: 400 | 600) => parse(tokens.match(new RegExp(`--shade-${n}-${key}:\\s*(#[0-9a-f]{6})`, "i"))![1]);
  for (const mode of ["light", "dark"] as const) {
    const vars = theme(mode);
    const bg = parse(vars["bg-primary"]);
    const ink = parse(vars["text-primary"]);
    const lightMix = (c: Rgba) => ([0, 1, 2].map((i) => c[i] * 0.6 + ink[i] * 0.4).concat(1) as Rgba);
    for (const key of PALETTE) {
      const primary600 = shade(key, 600);
      for (const [name, color] of [["h1", primary600], ["h2", rotateHue(primary600, 30)]] as const) {
        expect(ratio(color, bg), `${mode} ${key} ${name}`).toBeGreaterThanOrEqual(2.7);
      }
      const primary400 = shade(key, 400);
      for (const [name, color] of [["h3", primary400], ["h4", rotateHue(primary400, 30)]] as const) {
        const shown = mode === "dark" ? color : lightMix(color);
        expect(ratio(shown, bg), `${mode} ${key} ${name}`).toBeGreaterThanOrEqual(mode === "dark" ? 6 : 3.4);
      }
    }
  }
});

/**
 * H-014 (2026-11-04): tonos de énfasis, los mismos `color-mix` de `editor.css`. Piso de contraste 3,4:1 (texto
 * de énfasis, no de párrafo) y separación mínima entre los tonos de cada familia (negrita / negrita-cursiva /
 * cursiva y enlace / wikilink / código) para los 17 colores, claro y oscuro.
 */
test("H-014 (2026-11-04): negrita, cursiva, negrita-cursiva, enlace, wikilink y código se distinguen por tono y se leen (17 colores, claro y oscuro)", () => {
  const mix = (a: Rgba, pa: number, b: Rgba): Rgba => [0, 1, 2].map((i) => a[i] * pa + b[i] * (1 - pa)).concat(1) as Rgba;
  const dist = (a: Rgba, b: Rgba) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const MIN_CONTRAST = 3.4;
  const MIN_SEPARATION = 20;
  for (const mode of ["light", "dark"] as const) {
    const vars = theme(mode);
    const bg = parse(vars["bg-primary"]);
    const bgCode = parse(vars["bg-tertiary"]);
    const ink = parse(vars["text-primary"]);
    for (const key of PALETTE) {
      const primary = parse(vars[tokenOf(key)]);
      const secondary = rotateHue(primary, 30);
      const tertiary = rotateHue(secondary, 30);
      const dark = mode === "dark";
      const tones = {
        strong: dark ? secondary : mix(secondary, 0.85, ink),
        em: mix(secondary, 0.4, ink),
        strongEm: mix(secondary, dark ? 0.7 : 0.6, ink),
        link: dark ? tertiary : mix(tertiary, 0.65, ink),
        wiki: mix(tertiary, dark ? 0.6 : 0.8, ink),
        code: mix(tertiary, dark ? 0.9 : 0.45, dark ? bg : ink),
      };
      for (const [name, tone] of Object.entries(tones)) {
        expect(ratio(tone, name === "code" ? bgCode : bg), `${mode} ${key} ${name}`).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }
      for (const family of [["strong", "strongEm", "em"], ["link", "wiki", "code"]] as const) {
        for (let i = 0; i < family.length; i++) {
          for (let j = i + 1; j < family.length; j++) {
            expect(dist(tones[family[i]], tones[family[j]]), `${mode} ${key} ${family[i]}/${family[j]}`).toBeGreaterThanOrEqual(MIN_SEPARATION);
          }
        }
      }
    }
  }
});
