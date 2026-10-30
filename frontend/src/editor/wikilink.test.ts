// H-011: resolución pura de wikilinks `[[Destino]]`/`[[Destino|Alias]]` contra las notas de la bóveda.
// Testeable sin Milkdown (C-1 parseo del cuerpo, C-4/P-1/P-2/P-3 resolución, C-7 id resuelto).
import { describe, expect, it } from "vitest";
import { hasUnmanagedExtension, parseWikiLinkBody, resolveWikiLink, splitWikiLinks, type NoteRef } from "./wikilink";

const notes: NoteRef[] = [
  { id: "note:v:1", path: "Nota A.md" },
  { id: "note:v:2", path: "carpeta/2.1.19 - El Juramento del Aprendiz Masón.md" },
  { id: "note:v:3", path: "otra/Nota A.md" }, // duplicado de nombre en otra carpeta (P-3)
];

describe("parseWikiLinkBody (C-1)", () => {
  it("sin alias: el destino es el cuerpo entero", () => {
    expect(parseWikiLinkBody("Nota A")).toEqual({ target: "Nota A", alias: null });
  });

  it("con alias: separa por el primer `|`", () => {
    expect(parseWikiLinkBody("Destino|Alias")).toEqual({ target: "Destino", alias: "Alias" });
  });

  it("recorta espacios de destino y alias", () => {
    expect(parseWikiLinkBody("  Destino  |  Alias  ")).toEqual({ target: "Destino", alias: "Alias" });
  });

  it("un `|` extra se conserva dentro del alias", () => {
    expect(parseWikiLinkBody("D|a|b")).toEqual({ target: "D", alias: "a|b" });
  });
});

describe("resolveWikiLink (C-4, P-1, P-2, P-3, C-7)", () => {
  it("coincidencia exacta por nombre sin extensión → id de la nota", () => {
    expect(resolveWikiLink("Nota A", notes)).toBe("note:v:1");
  });

  it("coincidencia insensible a mayúsculas/minúsculas (P-2)", () => {
    expect(resolveWikiLink("nOtA a", notes)).toBe("note:v:1");
  });

  it("nombre con puntos que no son extensión (2.1.19 - …) resuelve (no se confunde con archivo)", () => {
    expect(resolveWikiLink("2.1.19 - El Juramento del Aprendiz Masón", notes)).toBe("note:v:2");
  });

  it("destino con `.md` explícito también resuelve", () => {
    expect(resolveWikiLink("Nota A.md", notes)).toBe("note:v:1");
  });

  it("duplicado de nombre en carpetas distintas → el primero encontrado (P-3)", () => {
    expect(resolveWikiLink("Nota A", notes)).toBe("note:v:1");
  });

  it("destino a archivo no-.md (.docx) nunca resuelve (P-1/C-4)", () => {
    expect(resolveWikiLink("Trabajo 19 - El Juramento del Aprendiz Masón - v1.docx", notes)).toBeNull();
  });

  it("destino inexistente → null (enlace roto)", () => {
    expect(resolveWikiLink("No existe", notes)).toBeNull();
  });

  it("sin notas → null", () => {
    expect(resolveWikiLink("Nota A", [])).toBeNull();
  });

  it("destino vacío → null", () => {
    expect(resolveWikiLink("   ", notes)).toBeNull();
  });
});

// H-012 C-3/P-1: al hacer clic en un wikilink ROTO, el destino sin extensión de archivo crea la nota;
// uno con extensión que Synapse no gestiona (.docx, .pdf…) no hace nada. `.md` sí lo gestiona → crea.
describe("hasUnmanagedExtension (C-3, P-1)", () => {
  it("un destino sin extensión → false (se puede crear la nota)", () => {
    expect(hasUnmanagedExtension("Nota Nueva")).toBe(false);
  });

  it("un destino con extensión de archivo ajena (.docx, .pdf) → true (no se crea nada)", () => {
    expect(hasUnmanagedExtension("informe.docx")).toBe(true);
    expect(hasUnmanagedExtension("manual.pdf")).toBe(true);
    expect(hasUnmanagedExtension("carpeta/hoja.xlsx")).toBe(true);
  });

  it("la extensión `.md` la gestiona Synapse → false (se crea como nota)", () => {
    expect(hasUnmanagedExtension("Nota.md")).toBe(false);
    expect(hasUnmanagedExtension("Nota.MD")).toBe(false);
  });

  it("puntos internos que no son extensión (espacios tras el último punto) → false", () => {
    expect(hasUnmanagedExtension("2.1.19 - El Juramento del Aprendiz Masón")).toBe(false);
    expect(hasUnmanagedExtension("v1.2 plan")).toBe(false);
  });

  it("destino vacío → false", () => {
    expect(hasUnmanagedExtension("   ")).toBe(false);
  });
});

describe("splitWikiLinks (C-1: reconocer en el texto)", () => {
  it("texto sin wikilinks → un solo segmento de texto", () => {
    expect(splitWikiLinks("solo texto")).toEqual([{ type: "text", value: "solo texto" }]);
  });

  it("reconoce `[[Destino]]` entre texto", () => {
    expect(splitWikiLinks("ver [[Nota A]] fin")).toEqual([
      { type: "text", value: "ver " },
      { type: "wiki", target: "Nota A", alias: null, raw: "[[Nota A]]" },
      { type: "text", value: " fin" },
    ]);
  });

  it("reconoce `[[Destino|Alias]]`", () => {
    expect(splitWikiLinks("[[Destino|Alias]]")).toEqual([{ type: "wiki", target: "Destino", alias: "Alias", raw: "[[Destino|Alias]]" }]);
  });

  it("reconoce varios en una línea", () => {
    expect(splitWikiLinks("[[a]] y [[b]]")).toEqual([
      { type: "wiki", target: "a", alias: null, raw: "[[a]]" },
      { type: "text", value: " y " },
      { type: "wiki", target: "b", alias: null, raw: "[[b]]" },
    ]);
  });

  it("`[[]]` vacío no es wikilink (se queda como texto)", () => {
    expect(splitWikiLinks("x [[]] y")).toEqual([{ type: "text", value: "x [[]] y" }]);
  });
});
