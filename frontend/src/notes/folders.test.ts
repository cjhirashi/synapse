// Utilidades puras de carpetas (SPEC-0010 RF-001, RF-003…RF-005, RF-042).
import { describe, expect, it } from "vitest";
import { ancestors, checkFolderName, folderExists, joinPath, parentFolder } from "./folders";
import type { NoteSummary } from "./noteStore";

const summaries = (...paths: string[]): NoteSummary[] =>
  paths.map((path, i) => ({ id: `n${i}`, path, rev: "1-a", updated_at: "", deleted_at: null, size: 0 }));

describe("parentFolder / ancestors / joinPath", () => {
  it("parentFolder: la carpeta contenedora, «» en la raíz", () => {
    expect(parentFolder("A/B/C.md")).toBe("A/B");
    expect(parentFolder("C.md")).toBe("");
  });

  it("ancestors: de la más externa a la más interna", () => {
    expect(ancestors("A/B/C.md")).toEqual(["A", "A/B"]);
    expect(ancestors("C.md")).toEqual([]);
  });

  it("joinPath: no antepone «/» en la raíz", () => {
    expect(joinPath("", "Sin título.md")).toBe("Sin título.md");
    expect(joinPath("A", "x.md")).toBe("A/x.md");
    expect(joinPath("A/B", "x.md")).toBe("A/B/x.md");
  });
});

describe("checkFolderName (RF-004, RF-005)", () => {
  it("acepta un nombre válido (incluido anidado)", () => {
    expect(checkFolderName("Carpeta")).toBeNull();
    expect(checkFolderName("A/B")).toBeNull();
  });

  it("vacío o sólo espacios → empty", () => {
    expect(checkFolderName("")).toBe("empty");
    expect(checkFolderName("   ")).toBe("empty");
  });

  it("tramo vacío → empty-segment", () => {
    expect(checkFolderName("A//B")).toBe("empty-segment");
    expect(checkFolderName("A/ /B")).toBe("empty-segment");
  });

  it("carácter de control → control", () => {
    expect(checkFolderName("A\u0001")).toBe("control");
  });
});

describe("folderExists (RF-004, NFKC + casefold)", () => {
  const notes = summaries("Proyectos/Plan.md", "Proyectos/Sub/Hoja.md", "Raíz.md");

  it("detecta una carpeta existente por su prefijo", () => {
    expect(folderExists(notes, "", "Proyectos")).toBe(true);
    expect(folderExists(notes, "Proyectos", "Sub")).toBe(true);
  });

  it("no detecta una carpeta que no existe", () => {
    expect(folderExists(notes, "", "Otra")).toBe(false);
    expect(folderExists(notes, "Proyectos", "Nada")).toBe(false);
  });

  it("compara por NFKC + casefold (mayúsculas y ancho completo)", () => {
    expect(folderExists(notes, "", "PROYECTOS")).toBe(true);
    expect(folderExists(summaries("Ａｂ/x.md"), "", "ab")).toBe(true);
  });
});
