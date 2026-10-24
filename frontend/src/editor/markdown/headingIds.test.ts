// SPEC-0010 RNF-001 (PLAN-0010 §10.1): ids de encabezado al parsear.
// `applyHeadingIds` fija el `id` de cada encabezado del documento recién parseado con el MISMO
// generador y la MISMA regla de duplicados (`-#n`) que `syncHeadingIdPlugin` de Milkdown, para que
// la vista nazca con los ids puestos y el plugin no despache ninguna transacción al montar.
import { Schema, type Node as PMNode } from "@milkdown/prose/model";
import { describe, expect, it } from "vitest";
import { applyHeadingIds } from "./headingIds";

// Esquema mínimo con la misma forma que el de Milkdown para lo que usa la función: un nodo `heading`
// con atributos `{ id, level }` y `textContent`.
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*", toDOM: () => ["p", 0] },
    heading: {
      group: "block",
      content: "inline*",
      attrs: { id: { default: "" }, level: { default: 1 } },
      toDOM: (n) => [`h${n.attrs.level as number}`, { id: n.attrs.id as string }, 0],
    },
    blockquote: { group: "block", content: "block+", toDOM: () => ["blockquote", 0] },
    text: { group: "inline" },
  },
});

/** Misma regla que `defaultHeadingIdGenerator` de `@milkdown/preset-commonmark`. */
const getId = (node: PMNode): string => node.textContent.toLowerCase().trim().replace(/\s+/g, "-");

const heading = (text: string, level = 1): PMNode =>
  schema.nodes.heading.create({ level }, text ? schema.text(text) : undefined);
const para = (text: string): PMNode => schema.nodes.paragraph.create(null, schema.text(text));

/** Ids de los encabezados del documento, en orden. */
function headingIds(doc: PMNode): string[] {
  const ids: string[] = [];
  doc.descendants((node) => {
    if (node.type.name === "heading") ids.push(node.attrs.id as string);
  });
  return ids;
}

describe("applyHeadingIds (RNF-001)", () => {
  it("fija el id con el generador (minúsculas, espacios a guiones)", () => {
    const doc = schema.nodes.doc.create(null, [heading("Título Principal"), para("x")]);
    expect(headingIds(applyHeadingIds(doc, getId))).toEqual(["título-principal"]);
  });

  it("deduplica con el sufijo -#n en orden de documento", () => {
    const doc = schema.nodes.doc.create(null, [heading("Beta"), heading("Beta"), heading("Beta")]);
    expect(headingIds(applyHeadingIds(doc, getId))).toEqual(["beta", "beta-#2", "beta-#3"]);
  });

  it("omite los encabezados vacíos (id queda vacío, no cuentan para duplicados)", () => {
    const doc = schema.nodes.doc.create(null, [heading("Alpha"), heading(""), heading("Alpha")]);
    expect(headingIds(applyHeadingIds(doc, getId))).toEqual(["alpha", "", "alpha-#2"]);
  });

  it("recorre encabezados anidados (p. ej. dentro de una cita) en orden de documento", () => {
    const doc = schema.nodes.doc.create(null, [
      heading("Uno"),
      schema.nodes.blockquote.create(null, [heading("Uno", 2)]),
    ]);
    expect(headingIds(applyHeadingIds(doc, getId))).toEqual(["uno", "uno-#2"]);
  });

  it("no muta el documento de entrada (ProseMirror inmutable)", () => {
    const doc = schema.nodes.doc.create(null, [heading("Alpha")]);
    const out = applyHeadingIds(doc, getId);
    expect(doc.firstChild?.attrs.id).toBe("");
    expect(out.firstChild?.attrs.id).toBe("alpha");
  });

  it("documento sin encabezados vuelve igual (misma instancia)", () => {
    const doc = schema.nodes.doc.create(null, [para("solo texto")]);
    expect(applyHeadingIds(doc, getId)).toBe(doc);
  });
});
