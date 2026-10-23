// Núcleo de presentación del ícono de bóveda (SPEC-0009 RF-001, RF-006; PLAN-0009 §2.1, P-1, P-2).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@testing-library/react";
import { createElement } from "react";
import { expect, test } from "vitest";
import { initials as initialsFromRail } from "../notes/VaultRail";
import {
  COLOR_LABELS,
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
  expect(COLOR_LABELS).toEqual({ accent: "Cian", info: "Azul", success: "Verde", warning: "Ámbar", danger: "Rojo" });
});

const tokens = readFileSync(resolve(__dirname, "../styles/tokens.css"), "utf8");

/** Variables de un tema de `tokens.css` (mismo método que `notes/accentContrast.test.ts`). */
function theme(name: "light" | "dark"): Record<string, string> {
  const block = tokens.match(new RegExp(`:root\\[data-theme="${name}"\\]\\s*\\{([^}]*)\\}`))![1];
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

test("RF-006: PALETTE son 5 claves que existen como tokens en los dos temas", () => {
  expect([...PALETTE]).toEqual(["accent", "info", "success", "warning", "danger"]);
  for (const mode of ["light", "dark"] as const) {
    for (const key of PALETTE) expect(theme(mode)[key], `${mode} --${key}`).toMatch(/^#[0-9a-f]{6}$/i);
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
  const ids = Array.from({ length: 60 }, (_, n) => `${String(n).padStart(8, "0")}-aaaa-4bbb-8ccc-${String(n * 7919).padStart(12, "0")}`);
  const colors = ids.map(derivedColor);
  expect(colors.every((color) => (PALETTE as readonly string[]).includes(color))).toBe(true);
  expect(ids.map(derivedColor)).toEqual(colors);
  expect(new Set(colors).size, "usa varios colores").toBeGreaterThanOrEqual(4);
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

test("RF-006: el glifo --text-primary sobre el tinte del 18 % de cada color da ≥ 4,5:1 en claro y oscuro", () => {
  for (const mode of ["light", "dark"] as const) {
    const vars = theme(mode);
    for (const key of PALETTE) {
      // `color-mix(in srgb, var(--key) 18%, var(--bg-tertiary))`: mezcla lineal en sRGB.
      const tint = parse(vars[key]);
      const base = parse(vars["bg-tertiary"]);
      const mixed = [0, 1, 2].map((i) => tint[i] * 0.18 + base[i] * 0.82).concat(1) as Rgba;
      expect(ratio(parse(vars["text-primary"]), mixed), `${mode} ${key}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});
