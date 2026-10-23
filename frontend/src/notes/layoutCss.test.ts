// VU-3 y VU-4 (PLAN-0008 §13): hoja base de ProseMirror en el chunk del editor y árbol con scroll propio.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8");

test("RF-007: MilkdownView importa la hoja base de ProseMirror (white-space: pre-wrap)", () => {
  expect(read("../editor/MilkdownView.tsx")).toContain('import "prosemirror-view/style/prosemirror.css"');
});

test("RNF-001, RF-001: el árbol de notas tiene scroll vertical propio y la columna se acota al viewport", () => {
  const css = read("notes.css");
  expect(css).toMatch(/\.note-tree \{[^}]*overflow-y: auto/);
  expect(css).toMatch(/\.vault-workspace-side \{[^}]*max-height: calc\(100vh/);
});
