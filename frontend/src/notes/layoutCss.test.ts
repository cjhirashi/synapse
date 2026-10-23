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

// Los colores salen sólo de tokens (`var(--…)` o `color-mix` de tokens), nunca de literales.
test.each([
  ["notes/notes.css", "notes.css"],
  ["editor/editor.css", "../editor/editor.css"],
  ["vaults/VaultChip.css", "../vaults/VaultChip.css"],
])("RF-006: %s no tiene literales de color", (_name, path) => {
  const css = read(path).replace(/\/\*[\s\S]*?\*\//g, "");
  expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|hwb\(|(?<![-\w])(?:white|black)(?![-\w])/);
});
