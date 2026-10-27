// RF-030 (SPEC-0010; PLAN-0010 §2.1): registro único de lenguajes del resaltado, sin distinguir mayúsculas.
import { describe, expect, it } from "vitest";
import { findLanguage, LANGUAGES } from "./languages";

/** Cada fila: el nombre canónico del lenguaje y todos los nombres con que RF-030 debe reconocerlo. */
const TABLE: Array<[string, string[]]> = [
  ["typescript", ["ts", "typescript"]],
  ["javascript", ["js", "javascript"]],
  ["tsx", ["tsx"]],
  ["python", ["py", "python"]],
  ["json", ["json"]],
  ["shell", ["bash", "sh", "shell"]],
  ["css", ["css"]],
  ["html", ["html"]],
  ["sql", ["sql"]],
  ["yaml", ["yaml", "yml"]],
  ["markdown", ["markdown", "md"]],
];

describe("languages · RF-030", () => {
  it.each(TABLE.flatMap(([name, aliases]) => aliases.map((alias) => [alias, name] as const)))("«%s» se resuelve a %s", (alias, name) => {
    expect(findLanguage(alias)?.name).toBe(name);
  });

  it("no distingue mayúsculas ni espacios alrededor", () => {
    expect(findLanguage("TypeScript")?.name).toBe("typescript");
    expect(findLanguage("PY")?.name).toBe("python");
    expect(findLanguage("  Bash ")?.name).toBe("shell");
  });

  it("de la información del bloque sólo cuenta la primera palabra", () => {
    expect(findLanguage('ts title="a.ts"')?.name).toBe("typescript");
  });

  it("un lenguaje desconocido, vacío o ausente es null (RF-031)", () => {
    for (const info of ["brainfuck", "", "   ", undefined, null, "foo-shell", "typescripts"]) expect(findLanguage(info)).toBeNull();
  });

  it("el registro tiene exactamente los 11 lenguajes y ninguno carga hasta pedirlo", () => {
    expect(LANGUAGES.map((l) => l.name).sort()).toEqual(TABLE.map(([name]) => name).sort());
    for (const language of LANGUAGES) expect(language.support).toBeUndefined();
  });

  it.each(TABLE.map(([name]) => name))("%s carga su gramática y expone un parser de Lezer", async (name) => {
    const description = LANGUAGES.find((l) => l.name === name)!;
    const support = await description.load();
    expect(support.language.parser.parse("a")).toBeTruthy();
  });
});
