// H-022: las barras de desplazamiento de toda la app salen de UNA regla global (`global.css`) con los
// tokens del tema. Se parsea el CSS real (mismo patrón que `notes/layoutCss.test.ts`), no un snapshot
// visual: jsdom no pinta barras, así que lo comprobable es el contrato de las reglas.
import { readdirSync, readFileSync } from "node:fs";
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

const SUPPORTS = "@supports not selector(::-webkit-scrollbar)";

/** Separa `global.css` (sin comentarios) en el cuerpo del `@supports` de barras y el resto. */
function splitSupports(css: string): { inside: string; outside: string } {
  const source = strip(css);
  const start = source.indexOf(SUPPORTS);
  if (start < 0) throw new Error(`sin ${SUPPORTS}`);
  const open = source.indexOf("{", start);
  let depth = 1;
  let end = open + 1;
  while (depth > 0 && end < source.length) depth += source[end++] === "{" ? 1 : source[end - 1] === "}" ? -1 : 0;
  return { inside: source.slice(open + 1, end - 1), outside: source.slice(0, start) + source.slice(end) };
}

// C-4: Firefox no entiende `::-webkit-scrollbar`; usa las propiedades estándar con los mismos tokens.
test("C-4: Firefox recibe scrollbar-width y scrollbar-color estándar, con los tokens del tema", () => {
  const { inside } = splitSupports(globalCss());
  expect(rule(inside, "*")).toMatch(/scrollbar-width: thin/);
  expect(rule(inside, "*")).toMatch(/scrollbar-color: var\(--border-control\) transparent/);
});

// Chromium ≥ 121 ignora `::-webkit-scrollbar` en cuanto un elemento declara las propiedades estándar:
// declararlas fuera del `@supports` le quitaría el hover y el arrastre del pulgar (C-2).
test("C-4: las propiedades estándar de barra NO se declaran fuera del @supports de Firefox", () => {
  expect(splitSupports(globalCss()).outside).not.toMatch(/scrollbar-(?:width|color)/);
});

// C-1: el estilo es único; ninguna hoja de componente lo redefine ni lo oculta.
test("C-1: sólo global.css declara estilo de barra (ninguna otra hoja de src/)", () => {
  const sheets = (readdirSync(resolve(__dirname, ".."), { recursive: true }) as string[]).filter((f) => f.endsWith(".css"));
  expect(sheets.length).toBeGreaterThan(5); // el recorrido encuentra las hojas: no se valida un vacío
  // `scrollbar-gutter` queda fuera: no pinta la barra, sólo reserva su espacio (lo usa el riel, C-5).
  const styling = /scrollbar-(?:width|color)|::-webkit-scrollbar/;
  const offenders = sheets.filter((f) => !f.endsWith("styles/global.css") && styling.test(strip(read(`../${f}`))));
  expect(offenders).toEqual([]);
});

// C-5: el riel (56 px) muestra su barra sin recortar ni descentrar los chips.
const px = (css: string, prop: string) => Number(css.match(new RegExp(`(?:^|[\\s;])${prop}:\\s*(-?\\d+)px`))?.[1]);

test("C-5: el riel ya no oculta su barra y reserva el gutter a ambos lados", () => {
  const rail = rule(read("../notes/notes.css"), ".vault-rail");
  expect(rail).not.toMatch(/scrollbar-width/);
  expect(rail).toMatch(/overflow-y: auto/);
  // Con `both-edges` el contenido queda centrado haya o no desborde; con barras overlay el gutter es 0.
  expect(rail).toMatch(/scrollbar-gutter: stable both-edges/);
});

test("C-5: con el gutter, el chip de 34 px cabe y la marca de la bóveda activa sigue dentro del riel colapsado", () => {
  const notes = read("../notes/notes.css");
  const gutter = px(rule(globalCss(), "*::-webkit-scrollbar"), "width");
  const content = px(rule(notes, ".vault-rail"), "width") - 2 * gutter; // 56 − 2 × 8
  const chip = px(rule(notes, ".vault-rail-icon"), "width");
  expect(content).toBeGreaterThanOrEqual(chip);
  // La marca nace a −10 px del chip (centrado en el contenido, desplazado por el gutter izquierdo).
  const chipLeft = gutter + (content - chip) / 2;
  const bar = chipLeft + px(rule(notes, '.vault-rail-icon[aria-current="page"]::before'), "left");
  expect(bar).toBeGreaterThanOrEqual(0); // no la recorta el borde del riel
});

// C-3: los controles nativos (barras, inputs, selects) heredan el esquema del tema elegido en la app,
// no el del sistema operativo; si no, un SO claro con la app en oscuro dibujaría controles claros.
test.each(["dark", "light"])("C-3: el tema %s declara su color-scheme en tokens.css", (name) => {
  expect(rule(read("tokens.css"), `:root[data-theme="${name}"]`)).toMatch(new RegExp(`color-scheme: ${name};`));
});
