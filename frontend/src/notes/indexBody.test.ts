import { describe, expect, it } from "vitest";
import spec from "../../../backend/tests/fixtures/indice_cuerpo.json";
import { DESCRIPCION_CELDA_MAX, indexBodyLines, renderIndexBody } from "./indexBody";
import { ancestorFolders, changedKeys, checkIndexOp, folderOf, indexPathFor, INDEX_NAME, isIndexPath, type IndexOp } from "./indexRules";

describe("especificación compartida de los INDICES", () => {
  it("coinciden el nombre y el tope", () => {
    expect(INDEX_NAME).toBe(spec.index_name);
    expect(DESCRIPCION_CELDA_MAX).toBe(spec.limits.descripcion_celda_max);
  });

  it.each(spec.generate.map((c) => [c.name, c] as const))("cuerpo: %s", (_name, c) => {
    const extra = "extra" in c ? (c.extra as string[]) : [];
    expect(indexBodyLines(c.vault, c.folder, c.notes, extra)).toEqual(c.body_lines);
  });

  it("el cuerpo termina en un solo salto de línea", () => {
    const c = spec.generate[0];
    expect(renderIndexBody(c.vault, c.folder, c.notes)).toBe(c.body_lines.join("\n") + "\n");
  });

  it.each(spec.reserved_names.cases as [string, boolean][])("nombre reservado %s → %s", (path, reserved) => {
    expect(isIndexPath(path)).toBe(reserved);
  });

  it.each(spec.rules.cases.map((c, i) => [i, c] as const))("regla %i", (_i, c) => {
    const args = c as { op: IndexOp; path: string; to?: string; changed?: string[]; content_changed?: boolean; other_live_below_after?: number; code: string | null };
    expect(checkIndexOp(args.op, args.path, { to: args.to, changed: args.changed, contentChanged: args.content_changed, otherLiveBelowAfter: args.other_live_below_after })).toBe(args.code);
  });

  it.each(spec.titles.cases)("título derivado $path", (c) => {
    const folder = folderOf(c.path);
    expect(folder === "" ? c.vault : folder.split("/").at(-1)).toBe(c.title);
  });
});

describe("rutas de INDICE", () => {
  it("carpetas antecesoras y ruta del INDICE", () => {
    expect(ancestorFolders("A/B/Nota.md")).toEqual(["", "A", "A/B"]);
    expect(ancestorFolders("Nota.md")).toEqual([""]);
    expect(indexPathFor("")).toBe("INDICE.md");
    expect(indexPathFor("A/B")).toBe("A/B/INDICE.md");
  });

  it("changedKeys ignora las fechas", () => {
    expect(changedKeys({ a: 1, fecha_actualizacion: "x" }, { a: 1, fecha_actualizacion: "y", b: 2 })).toEqual(["b"]);
    expect(changedKeys(null, { tags: ["a"] })).toEqual(["tags"]);
  });
});
