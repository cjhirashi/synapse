// RF-040, RNF-004 (SPEC-0010; PLAN-0010 §5.5, ADR-006): los tokens nuevos existen en ambos temas, los
// pares de color de los componentes de contenido cumplen WCAG 2.x (texto ≥ 4,5:1; no texto ≥ 3:1) y
// `--text-muted`/`--accent` no se usan como color de texto en los estilos nuevos.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8");
const tokens = read("../styles/tokens.css");

/** Variables de un tema de `tokens.css` más las de `:root` (valores sin tema). */
function theme(name: "light" | "dark"): Record<string, string> {
  const block = (selector: string) => {
    const start = tokens.indexOf(selector);
    const body = tokens.slice(tokens.indexOf("{", start) + 1, tokens.indexOf("}", start));
    return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  };
  return { ...block(":root {"), ...block(`:root[data-theme="${name}"]`) };
}

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
/** `top` (con su alfa) compuesto sobre `bottom` opaco. */
const over = (top: Rgba, bottom: Rgba): Rgba => [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3])).concat(1) as Rgba;
function luminance([r, g, b]: Rgba): number {
  const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const MODES = ["dark", "light"] as const;
const SURFACES = ["bg-primary", "bg-secondary", "bg-tertiary"] as const;

const NEW_TOKENS = ["success-text", "warning-text", "info-text", "danger-text", "border-control", "radius-xs"];

test.each(NEW_TOKENS)("RF-040: el token --%s está definido en claro y en oscuro (ADR-006)", (name) => {
  for (const mode of MODES) expect(theme(mode)[name], `${mode}: --${name}`).toBeTruthy();
});

/** Texto (≥ 4,5:1) sobre las superficies indicadas. */
const TEXT_PAIRS: Array<[string, string, readonly string[]]> = [
  ["success-text", "cadenas del resaltado", ["bg-tertiary"]],
  ["warning-text", "números del resaltado", ["bg-tertiary"]],
  ["info-text", "tipos y enlaces", SURFACES],
  ["danger-text", "errores y «Borrar»", SURFACES],
  ["accent-hover", "keyword y código en línea", ["bg-tertiary"]],
  ["text-secondary", "claves, etiquetas y comentarios", SURFACES],
  ["text-primary", "valores y texto", SURFACES],
];

test.each(TEXT_PAIRS)("RNF-004: --%s (%s) tiene contraste ≥ 4,5:1 en ambos temas", (token, _use, surfaces) => {
  for (const mode of MODES) {
    const vars = theme(mode);
    for (const surface of surfaces) {
      expect(ratio(parse(vars[token]), parse(vars[surface])), `${mode}: --${token} sobre --${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test("RNF-004: texto sobre fondos translúcidos (chips, cita, errores, nodo de Mermaid) ≥ 4,5:1", () => {
  for (const mode of MODES) {
    const vars = theme(mode);
    const chip = over(parse(vars["accent-soft"]), parse(vars["bg-tertiary"]));
    expect(ratio(parse(vars["text-primary"]), chip), `${mode}: chip`).toBeGreaterThanOrEqual(4.5);
    // H-014 C-7: la cita perdió el relleno --accent-soft; su texto --text-secondary (cursiva) va ahora
    // sobre el fondo neutro del documento (--bg-primary) y debe seguir legible (≥ 4,5:1).
    expect(ratio(parse(vars["text-secondary"]), parse(vars["bg-primary"])), `${mode}: cita`).toBeGreaterThanOrEqual(4.5);
    const error = over(parse(vars["danger-bg"]), parse(vars["bg-primary"]));
    expect(ratio(parse(vars["text-primary"]), error), `${mode}: aviso de error`).toBeGreaterThanOrEqual(4.5);
    const node = over(parse(vars["accent-soft"]), parse(vars["bg-secondary"]));
    expect(ratio(parse(vars["text-primary"]), node), `${mode}: nodo de Mermaid`).toBeGreaterThanOrEqual(4.5);
  }
});

test("RNF-004: bordes de controles nuevos, casillas y foco (no texto) ≥ 3:1", () => {
  for (const mode of MODES) {
    const vars = theme(mode);
    for (const surface of SURFACES) {
      for (const token of ["border-control", "text-secondary"]) {
        expect(ratio(parse(vars[token]), parse(vars[surface])), `${mode}: --${token} sobre --${surface}`).toBeGreaterThanOrEqual(3);
      }
    }
    // `--accent` como foco/borde (no como texto): sobre superficies claras u oscuras del tema.
    expect(ratio(parse(vars["accent"]), parse(vars["bg-tertiary"])), `${mode}: foco`).toBeGreaterThanOrEqual(3);
  }
});

/** Selectores previos a SPEC-0010 que ya usaban estos tokens en íconos decorativos (no texto de contenido). */
const LEGACY = [".note-tree-icon-note", ".vault-workspace-header", ".vault-workspace-empty"];

test.each([["editor/editor.css"], ["editor/syntax.css"], ["notes/notes.css"]])(
  "RNF-004: %s no usa --text-muted ni --accent como color de texto (P-2)",
  (file) => {
    const css = read(`../${file}`).replace(/\/\*[\s\S]*?\*\//g, "");
    const offenders = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter(([, selector, body]) => /(?:^|[;\s])color:\s*var\(--(?:text-muted|accent)\)/.test(body) && !LEGACY.some((l) => selector.includes(l)))
      .map(([, selector]) => selector.trim());
    expect(offenders).toEqual([]);
  },
);
