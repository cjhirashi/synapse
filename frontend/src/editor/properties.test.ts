// SPEC-0010 RF-009, RF-013: modelo de filas de propiedades (`toRows`: inferencia de tipo).
import { describe, expect, it } from "vitest";
import { convert, fromRows, parseNumberInput, toRows, validateRows, type PropRow, type PropType } from "./properties";

describe("toRows", () => {
  // RF-009
  it("infiere el tipo de cada valor y conserva el orden de las claves", () => {
    const rows = toRows({ titulo: "Plan", version: 3.5, activo: true, etiquetas: ["a", "b"] });
    expect(rows.map((r) => [r.key, r.type])).toEqual([
      ["titulo", "text"],
      ["version", "number"],
      ["activo", "boolean"],
      ["etiquetas", "list"],
    ]);
    expect(rows[3].value).toEqual(["a", "b"]);
  });

  // RF-013
  it("objetos, null y listas que no son de strings son valores complejos", () => {
    const rows = toRows({ config: { nivel: 2 }, nada: null, numeros: [1, 2], mezcla: ["a", 1], anidada: [["a"]] });
    expect(rows.map((r) => r.type)).toEqual(["complex", "complex", "complex", "complex", "complex"]);
    expect(rows[0].value).toEqual({ nivel: 2 });
  });

  // RF-009
  it("una lista vacía es una lista de strings", () => {
    expect(toRows({ etiquetas: [] })[0]).toMatchObject({ type: "list", value: [] });
  });

  // RF-010
  it("sin frontmatter o con {} no hay filas", () => {
    expect(toRows(undefined)).toEqual([]);
    expect(toRows(null)).toEqual([]);
    expect(toRows({})).toEqual([]);
  });

  // RF-013
  it("los números no finitos no se tratan como número", () => {
    expect(toRows({ n: Number.NaN })[0].type).toBe("complex");
  });
});

// RF-011: conversión de valores al cambiar de tipo en el formulario (PLAN-0010 §2.3-c).
describe("convert", () => {
  const cases: Array<[string, unknown, PropType, PropType, unknown, boolean]> = [
    ["texto numérico → número", "3.5", "text", "number", 3.5, false],
    ["texto no numérico → número vacío", "abc", "text", "number", "", true],
    ["número → texto", 42, "number", "text", "42", false],
    ["lista → texto con coma y espacio", ["a", "b"], "list", "text", "a, b", false],
    ["texto → lista de un elemento", "hola", "text", "list", ["hola"], false],
    ["texto vacío → lista vacía", "", "text", "list", [], false],
    ["booleano → texto", true, "boolean", "text", "true", false],
    ["texto «false» → booleano", "false", "text", "boolean", false, false],
    ["texto cualquiera → booleano vacío (No)", "quizá", "text", "boolean", false, true],
    ["número → booleano no representable", 3, "number", "boolean", false, true],
    ["lista con elementos → número no representable", ["a"], "list", "number", "", true],
    ["mismo tipo no cambia nada", ["a"], "list", "list", ["a"], false],
  ];
  // RF-011
  it.each(cases)("%s", (_name, value, from, to, expected, emptied) => {
    expect(convert(value, from, to)).toEqual({ value: expected, emptied });
  });
});

// RF-011: números del formulario (`type="text" inputmode="decimal"`).
describe("parseNumberInput", () => {
  // RF-011
  it.each([
    ["3", 3],
    ["-2.5", -2.5],
    ["  7  ", 7],
    ["0.25", 0.25],
  ])("acepta %j", (text, value) => expect(parseNumberInput(text)).toBe(value));

  // RF-011
  it.each(["", "abc", "1e3", "1,5", "Infinity", "NaN", "1.", ".5", "9007199254740993"])("rechaza %j", (text) =>
    expect(parseNumberInput(text)).toBeNull(),
  );
});

// RF-011: validación por fila.
describe("validateRows", () => {
  const row = (key: string, type: PropType, value: unknown): PropRow => ({ key, type, value });

  // RF-011
  it("clave vacía, clave duplicada exacta y número no válido, por fila", () => {
    const errors = validateRows([
      row("a", "text", "x"),
      row("", "text", "y"),
      row("a", "text", "z"),
      row("n", "number", "abc"),
      row("ok", "number", 3),
    ]);
    expect(errors).toEqual([
      { index: 1, code: "empty-key", key: "" },
      { index: 2, code: "duplicate-key", key: "a" },
      { index: 3, code: "invalid-number", key: "n" },
    ]);
  });

  // RF-011
  it("claves que sólo difieren en mayúsculas no son duplicadas", () => {
    expect(validateRows([row("a", "text", ""), row("A", "text", "")])).toEqual([]);
  });

  // RF-013
  it("una fila compleja con clave válida no da error", () => {
    expect(validateRows([row("c", "complex", { a: 1 })])).toEqual([]);
  });
});

// RF-011, RF-013: de filas al objeto `frontmatter`.
describe("fromRows", () => {
  // RF-011
  it("respeta el orden de las filas y convierte los números escritos", () => {
    const rows: PropRow[] = [
      { key: "b", type: "number", value: "3.5" },
      { key: "a", type: "text", value: "x" },
      { key: "l", type: "list", value: ["p", "q"] },
      { key: "ok", type: "boolean", value: true },
    ];
    const result = fromRows(rows);
    expect(Object.keys(result)).toEqual(["b", "a", "l", "ok"]);
    expect(result).toEqual({ b: 3.5, a: "x", l: ["p", "q"], ok: true });
  });

  // RF-013
  it("conserva sin cambios los valores complejos (ida y vuelta de toRows)", () => {
    const original = { titulo: "t", config: { nivel: 2, opciones: ["a"] }, nada: null, nums: [1, 2] };
    expect(fromRows(toRows(original))).toEqual(original);
  });
});
