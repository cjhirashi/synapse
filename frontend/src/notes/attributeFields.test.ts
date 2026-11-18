import { describe, expect, test } from "vitest";
import { attributeText, splitAttributeFields } from "./attributeFields";

const attrs = { autor: "Carlos", cliente: "ACME", etiquetas: ["a", "b"], revisado: true, vacio: "", nada: null, nota: "uno\ndos" };
const split = (text: string) => splitAttributeFields(text, attrs);

describe("splitAttributeFields", () => {
  test("reconoce {{atributo:nombre}} en cualquier sitio del texto", () => {
    expect(split("Autor: {{atributo:autor}}. Cliente: {{atributo:cliente}}.")).toEqual([
      { type: "text", value: "Autor: " },
      { type: "field", name: "autor", value: "Carlos" },
      { type: "text", value: ". Cliente: " },
      { type: "field", name: "cliente", value: "ACME" },
      { type: "text", value: "." },
    ]);
  });

  test("los valores se dan como en el PDF: listas con comas, booleanos Sí o No, vacío si no hay valor", () => {
    expect(split("{{atributo:etiquetas}}|{{atributo:revisado}}|{{atributo:vacio}}|{{atributo:nada}}").filter((s) => s.type === "field").map((s) => s.value)).toEqual(["a, b", "Sí", "", ""]);
    expect(attributeText(false)).toBe("No");
    expect(attributeText({ a: 1 })).toBe("");
    expect(attributeText(7)).toBe("7");
  });

  test("un nombre que no es atributo deja el campo escrito, para que se vea el error", () => {
    expect(split("{{atributo:inexistente}}")).toEqual([{ type: "text", value: "{{atributo:inexistente}}" }]);
    expect(split("{{programa}} {{pagina}} {{atributo:}}")).toEqual([{ type: "text", value: "{{programa}} {{pagina}} {{atributo:}}" }]);
  });

  test("el valor sale en una sola línea", () => {
    expect(split("{{atributo:nota}}")).toEqual([{ type: "field", name: "nota", value: "uno dos" }]);
  });

  test("sin llaves devuelve el mismo texto", () => {
    expect(split("sin campos")).toEqual([{ type: "text", value: "sin campos" }]);
    expect(split("")).toEqual([]);
  });
});
