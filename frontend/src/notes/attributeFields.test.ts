import { describe, expect, test } from "vitest";
import { attributeText, fillAttributeFields } from "./attributeFields";

const attrs = { autor: "Carlos", cliente: "ACME", etiquetas: ["a", "b"], revisado: true, vacio: "", nada: null, nota: "uno\ndos", marca: "a*b_c" };
const fill = (text: string) => fillAttributeFields(text, attrs);

describe("fillAttributeFields", () => {
  test("cambia cada campo por el valor del atributo, en cualquier sitio del texto", () => {
    expect(fill("Autor: {{atributo:autor}}. Cliente: {{atributo:cliente}}. Otra vez {{atributo:autor}}.")).toEqual({
      text: "Autor: Carlos. Cliente: ACME. Otra vez Carlos.", changed: true,
    });
    expect(fill("# Informe de {{atributo:cliente}}\n\n| Autor |\n|---|\n| {{atributo:autor}} |").text).toBe("# Informe de ACME\n\n| Autor |\n|---|\n| Carlos |");
  });

  test("los valores se dan como en el PDF: listas con comas, booleanos Sí o No, vacío si no hay valor", () => {
    expect(fill("{{atributo:etiquetas}}|{{atributo:revisado}}|[{{atributo:vacio}}]|[{{atributo:nada}}]").text).toBe("a, b|Sí|[]|[]");
    expect(attributeText(false)).toBe("No");
    expect(attributeText({ a: 1 })).toBe("");
    expect(attributeText(7)).toBe("7");
  });

  test("un atributo que no existe deja el campo escrito, para que se vea el error", () => {
    expect(fill("{{atributo:inexistente}}")).toEqual({ text: "{{atributo:inexistente}}", changed: false });
    expect(fill("{{titulo}} {{atributo:}}").changed).toBe(false);
  });

  test("el valor es texto literal: sin saltos de línea y con los signos de Markdown escapados", () => {
    expect(fill("{{atributo:nota}}").text).toBe("uno dos");
    expect(fill("{{atributo:marca}}").text).toBe("a\\*b\\_c");
    expect(fillAttributeFields("{{atributo:x}}", { x: "# Titulo [a](b) <i>" }).text).toBe("\\# Titulo \\[a\\](b) \\<i\\>");
  });

  test("el código no se toca: ni los bloques con cercas ni el inline", () => {
    const md = "Usa `{{atributo:autor}}` así.\n\n```md\n{{atributo:autor}}\n```\n\n~~~\n{{atributo:autor}}\n~~~\n\nFuera: {{atributo:autor}}";
    expect(fill(md).text).toBe("Usa `{{atributo:autor}}` así.\n\n```md\n{{atributo:autor}}\n```\n\n~~~\n{{atributo:autor}}\n~~~\n\nFuera: Carlos");
    // Una cerca de otro tipo o más corta no cierra el bloque.
    expect(fill("````\n```\n{{atributo:autor}}\n````\n{{atributo:autor}}").text).toBe("````\n```\n{{atributo:autor}}\n````\nCarlos");
  });

  test("sin campos devuelve el mismo texto y changed en falso", () => {
    expect(fill("nada que cambiar")).toEqual({ text: "nada que cambiar", changed: false });
  });
});
