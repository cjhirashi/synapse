// VU-3 (PLAN-0008 §13): hoja base de ProseMirror en el chunk del editor; árbol con scroll propio.
// SPEC-0009 RF-009 (PLAN-0009 P-5): el marco de la app es de altura fija y cada columna tiene su
// scroll; esto SUSTITUYE explícitamente las aserciones de U-7 (riel `sticky` + `max-height: 100vh`,
// icono de 38 px y columna lateral `sticky`), que eran el parche del marco de altura libre (RF-007).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8");

/** Cuerpo de la regla cuyo selector es exactamente `selector` (sin comentarios). */
function rule(css: string, selector: string): string {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const escaped = selector.replace(/[.[\]"=()*]/g, "\\$&");
  const match = source.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`sin la regla ${selector}`);
  return match[1];
}

test("RF-007: MilkdownView importa la hoja base de ProseMirror (white-space: pre-wrap)", () => {
  expect(read("../editor/MilkdownView.tsx")).toContain('import "prosemirror-view/style/prosemirror.css"');
});

test("RNF-001: el árbol de notas tiene scroll vertical propio", () => {
  expect(rule(read("notes.css"), ".note-tree")).toMatch(/overflow-y: auto/);
});

test("RF-009: el marco de la app mide el viewport y cada columna hace su propio scroll", () => {
  const layout = read("../layout/AppLayout.css");
  expect(rule(layout, ".app-shell")).toMatch(/height: 100dvh/);
  expect(rule(layout, ".app-shell")).toMatch(/flex-direction: column/);
  expect(rule(layout, ".app-body")).toMatch(/flex: 1/);
  // Sin `min-height: 0` el cuerpo crece con su contenido y el scroll pasaría a la ventana.
  expect(rule(layout, ".app-body")).toMatch(/min-height: 0/);
  expect(rule(layout, ".app-main")).toMatch(/overflow-y: auto/);
  expect(rule(read("notes.css"), ".vault-rail")).toMatch(/overflow-y: auto/);
});

test("RF-009: el riel ya no usa sticky ni max-height de viewport (parche de U-7 retirado)", () => {
  const notes = read("notes.css");
  expect(rule(notes, ".vault-rail")).not.toMatch(/position: sticky/);
  expect(rule(notes, ".vault-rail")).not.toMatch(/max-height/);
  expect(rule(notes, ".vault-workspace-side")).not.toMatch(/position: sticky|max-height/);
});

test("RF-009: los chips del riel no se encogen al llenarse el riel", () => {
  expect(rule(read("notes.css"), ".vault-rail-icon")).toMatch(/flex-shrink: 0/);
  const chip = rule(read("../vaults/VaultChip.css"), ".vault-chip");
  expect(chip).toMatch(/flex-shrink: 0/);
  expect(chip).toMatch(/width: 34px/);
  expect(chip).toMatch(/height: 34px/);
});

test("RF-003: el formulario «Nueva nota» y el panel del árbol tienen fondos de tokens distintos", () => {
  const notes = read("notes.css");
  expect(rule(notes, ".note-sidebar-new")).toMatch(/background: var\(--bg-tertiary\)/);
  expect(rule(notes, ".note-tree-panel")).toMatch(/background: var\(--bg-secondary\)/);
  expect(rule(notes, ".vault-workspace-side")).toMatch(/width: 240px/);
});

test("RF-010: el nombre de una fila se recorta con elipsis en una sola línea", () => {
  const name = rule(read("notes.css"), ".note-tree-name");
  expect(name).toMatch(/text-overflow: ellipsis/);
  expect(name).toMatch(/white-space: nowrap/);
  expect(name).toMatch(/min-width: 0/);
});

test("RF-005: el contenido del editor va en una columna centrada de 780 px sin tarjeta", () => {
  const editor = read("../editor/editor.css");
  const column = rule(editor, ".note-editor-column");
  expect(column).toMatch(/max-width: 780px/);
  expect(column).toMatch(/margin-inline: auto/);
  expect(column).toMatch(/padding: var\(--space-8\) var\(--space-16\)/);
  expect(rule(editor, ".note-editor-header")).toMatch(/background: var\(--bg-secondary\)/);
  // Sin marco de tarjeta: el cuerpo es sólo el área de scroll.
  expect(rule(editor, ".note-editor-body")).not.toMatch(/border|background/);
});

// SPEC-0010 RF-037…RF-039: cita, código en línea, tablas y casillas de tarea (PLAN-0010 §2.3-g; R-5, R-6, R-7, R-10).
test("RF-037: la cita lleva barra de 3 px en --accent, relleno --accent-soft y cursiva --text-secondary", () => {
  const quote = rule(read("../editor/editor.css"), ".milkdown-view .ProseMirror blockquote");
  expect(quote).toMatch(/border-left: 3px solid var\(--accent\)/);
  expect(quote).toMatch(/background: var\(--accent-soft\)/);
  expect(quote).toMatch(/color: var\(--text-secondary\)/);
  expect(quote).toMatch(/font-style: italic/);
  expect(quote).toMatch(/border-radius: 0 var\(--radius-sm\) var\(--radius-sm\) 0/);
  expect(quote).toMatch(/padding: var\(--space-2\) var\(--space-4\)/);
});

test("RF-038: el código en línea usa --bg-tertiary, --accent-hover y --radius-xs, y no toca el de los bloques", () => {
  const inline = rule(read("../editor/editor.css"), ".milkdown-view .ProseMirror :not(pre) > code");
  expect(inline).toMatch(/background: var\(--bg-tertiary\)/);
  expect(inline).toMatch(/color: var\(--accent-hover\)/);
  expect(inline).toMatch(/border-radius: var\(--radius-xs\)/);
  expect(inline).toMatch(/padding: 2px 6px/);
  expect(inline).toMatch(/font-size: 0\.857em/);
});

test("RF-026: el párrafo de una celda no tiene margen (causa de las filas de ~62 px) y la tabla va en un envoltorio con scroll", () => {
  const css = read("../editor/editor.css").replace(/\/\*[\s\S]*?\*\//g, "");
  expect(css).toMatch(/td > p,\s*[^{}]*th > p\s*\{[^}]*margin: 0/);
  const table = rule(read("../editor/editor.css"), ".milkdown-view .ProseMirror table");
  expect(table).toMatch(/width: max-content/);
  expect(table).toMatch(/min-width: 100%/);
  const scroll = rule(read("../editor/editor.css"), ".note-table-scroll");
  expect(scroll).toMatch(/overflow-x: auto/);
  expect(scroll).toMatch(/max-width: 100%/);
});

test("RF-039: la casilla de tarea mide 16 × 16 con borde de 2 px en --text-secondary y radio --radius-xs", () => {
  const mark = rule(read("../editor/editor.css"), ".note-task-mark");
  expect(mark).toMatch(/width: 16px/);
  expect(mark).toMatch(/height: 16px/);
  expect(mark).toMatch(/border: 2px solid var\(--text-secondary\)/);
  expect(mark).toMatch(/border-radius: var\(--radius-xs\)/);
});

// SPEC-0010 RNF-001 (PLAN-0010 §10.2): `content-visibility: auto` saca del pintado los bloques fuera
// de pantalla (−56 ms en la nota de 181 KiB). SÓLO en lectura: en Visual el caret, la selección y
// `coordsAtPos` sobre bloques omitidos serían un riesgo sin beneficio medido.
test("RNF-001: content-visibility sólo en los bloques del documento en lectura, nunca en Visual", () => {
  const css = read("../editor/editor.css");
  const body = rule(css, '.milkdown-view[data-mode="read"] .ProseMirror > *');
  expect(body).toMatch(/content-visibility: auto/);
  expect(body).toMatch(/contain-intrinsic-size: /);
  // La única aparición de `content-visibility` es esa regla (extraída arriba por su selector de
  // lectura): no hay ninguna versión para Visual (`data-mode="edit"` ni el selector sin `data-mode`).
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  expect(clean.match(/content-visibility/g)).toHaveLength(1);
});

// Los colores salen sólo de tokens (`var(--…)` o `color-mix` de tokens), nunca de literales.
test.each([
  ["notes/notes.css", "notes.css"],
  ["editor/editor.css", "../editor/editor.css"],
  ["vaults/VaultChip.css", "../vaults/VaultChip.css"],
  // SPEC-0010 RF-040: el resaltado también sale sólo de tokens (alias `--syntax-*`).
  ["editor/syntax.css", "../editor/syntax.css"],
])("RF-006: %s no tiene literales de color", (_name, path) => {
  const css = read(path).replace(/\/\*[\s\S]*?\*\//g, "");
  expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|hwb\(|(?<![-\w])(?:white|black)(?![-\w])/);
});
