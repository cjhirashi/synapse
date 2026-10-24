// SPEC-0010 RF-009, RF-013: modelo de filas de propiedades (`toRows`: inferencia de tipo).
import { describe, expect, it } from "vitest";
import { toRows } from "./properties";

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
