// H-022: las barras de desplazamiento de toda la app salen de UNA regla global (`global.css`) con los
// tokens del tema. Se parsea el CSS real (mismo patrón que `notes/layoutCss.test.ts`), no un snapshot
// visual: jsdom no pinta barras, así que lo comprobable es el contrato de las reglas.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8");
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Cuerpo de la regla cuyo selector es exactamente `selector` (sin comentarios). */
function rule(css: string, selector: string): string {
  const escaped = selector.replace(/[.[\]"=()*]/g, "\\$&");
  const match = strip(css).match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`sin la regla ${selector}`);
  return match[1];
}

const globalCss = () => read("global.css");

// C-1, C-2: Chromium/Edge/Safari. 8 px, sin flechas, pista transparente, pulgar redondeado con los
// colores del tema y estados de hover y arrastre.
test("C-1/C-2: la barra WebKit mide 8 px, sin flechas ni pista de color, con esquina transparente", () => {
  const css = globalCss();
  const bar = rule(css, "*::-webkit-scrollbar");
  expect(bar).toMatch(/width: 8px/);
  expect(bar).toMatch(/height: 8px/); // barra horizontal (tablas, bloques de código)
  expect(rule(css, "*::-webkit-scrollbar-button")).toMatch(/display: none/);
  // Pista y esquina comparten regla: ambas transparentes, así la barra toma la superficie que recorre.
  expect(rule(css, "*::-webkit-scrollbar-track,\n*::-webkit-scrollbar-corner")).toMatch(/background: transparent/);
});

test("C-2: el pulgar es redondeado en --border-control, pasa a --text-muted al hover y a --accent al arrastrar", () => {
  const css = globalCss();
  const thumb = rule(css, "*::-webkit-scrollbar-thumb");
  expect(thumb).toMatch(/background-color: var\(--border-control\)/);
  expect(thumb).toMatch(/border-radius: var\(--radius-xs\)/);
  expect(rule(css, "*::-webkit-scrollbar-thumb:hover")).toMatch(/background-color: var\(--text-muted\)/);
  expect(rule(css, "*::-webkit-scrollbar-thumb:active")).toMatch(/background-color: var\(--accent\)/);
});

/** Sección de barras de `global.css`: va al final del archivo, tras su encabezado. */
const scrollbarSection = () => strip(globalCss().split("/* --- Barras de desplazamiento")[1] ?? "");

test("C-2: la sección de barras sólo usa tokens (sin literales de color)", () => {
  const section = scrollbarSection();
  expect(section).toMatch(/--border-control/); // la sección existe: no se valida un vacío
  expect(section).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|hwb\(|(?<![-\w])(?:white|black)(?![-\w])/);
});
