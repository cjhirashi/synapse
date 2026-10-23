// U-2 (PLAN-0008 §17): el texto sobre `--accent-soft` (fila seleccionada del árbol, botón activo
// Visual/Código) cumple 4,5:1 (WCAG 1.4.3) en claro y en oscuro; el acento va como indicador, no como texto.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8");
const tokens = read("../styles/tokens.css");

/** Variables de un tema de `tokens.css`. */
function theme(name: "light" | "dark"): Record<string, string> {
  const block = tokens.match(new RegExp(`:root\\[data-theme="${name}"\\]\\s*\\{([^}]*)\\}`))![1];
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
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

/** Variable de `color` que declara la regla con ese selector. */
function colorOf(css: string, selector: string): string {
  const rule = css.match(new RegExp(`${selector.replace(/[.[\]"=()]/g, "\\$&")}\\s*\\{([^}]*)\\}`))![1];
  return rule.match(/(?:^|[;\s])color:\s*var\(--([\w-]+)\)/)![1];
}

const cases = [
  ["fila seleccionada del árbol", read("notes.css"), '.note-tree-row[aria-selected="true"]'],
  ["botón activo Visual/Código", read("../editor/editor.css"), '.note-editor-views button[aria-pressed="true"]'],
] as const;

test.each(cases)("RF-019, RF-007: el texto de la %s tiene contraste ≥ 4,5:1 en claro y en oscuro", (_name, css, selector) => {
  const variable = colorOf(css, selector);
  for (const mode of ["light", "dark"] as const) {
    const vars = theme(mode);
    for (const base of ["bg-primary", "bg-secondary", "bg-tertiary"]) {
      const background = over(parse(vars["accent-soft"]), parse(vars[base]));
      expect(ratio(parse(vars[variable]), background), `${mode} sobre ${base}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});
