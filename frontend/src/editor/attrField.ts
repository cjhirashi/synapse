/**
 * Campos de atributo `{{atributo:autor}}` en la vista Visual de SOLO LECTURA: cada campo se pinta con el valor vigente del atributo dentro de un
 * `<span class="attr-field">` (marca de CSS y tooltip «Atributo: autor»). Mismo patrón que los wikilinks: transformador remark que parte el
 * texto, marca propia con `parseMarkdown`/`toMarkdown` y una rebanada con los valores. En edición la rebanada vale `null` y el texto
 * conserva las llaves. El PDF y la publicación salen de este DOM: llevan el valor, sin la marca (el servidor quita `class`).
 */
import { $markSchema, $remark } from "@milkdown/utils";
import { createSlice, type MilkdownPlugin } from "@milkdown/ctx";
import type { Processor } from "unified";
import { splitAttributeFields } from "../notes/attributeFields";

/** Valores de los atributos del documento; `null` desactiva los campos (edición). */
export const attrFieldValuesCtx = createSlice<Record<string, unknown> | null, "synapseAttrFieldValues">(null, "synapseAttrFieldValues");

export const attrFieldValuesPlugin: MilkdownPlugin = (ctx) => {
  ctx.inject(attrFieldValuesCtx, null);
  return () => {};
};

const ATTR_MDAST = "attrField";
/** Un campo vacío necesita algún texto para llevar la marca: un espacio de ancho cero, que no se ve ni se imprime. */
const EMPTY = "\u200b";

interface AttrFieldMdastNode {
  type: typeof ATTR_MDAST;
  name: string;
  children: { type: "text"; value: string }[];
}

export const attrFieldRemark = $remark("synapseAttrField", (ctx) =>
  function attrFieldAttacher(this: Processor) {
    const data = this.data() as { toMarkdownExtensions?: unknown[] };
    (data.toMarkdownExtensions ??= []).push({ handlers: { [ATTR_MDAST]: (node: AttrFieldMdastNode) => `{{${node.name}}}` } });
    const transform = (tree: { children?: unknown[] }, values: Record<string, unknown>): void => {
      if (!Array.isArray(tree.children)) return;
      const next: unknown[] = [];
      for (const child of tree.children as { type: string; value?: string; children?: unknown[] }[]) {
        if (child.type === "text" && typeof child.value === "string" && child.value.includes("{{")) {
          for (const part of splitAttributeFields(child.value, values)) {
            if (part.type === "text") next.push({ type: "text", value: part.value });
            else next.push({ type: ATTR_MDAST, name: part.name, children: [{ type: "text", value: part.value || EMPTY }] } satisfies AttrFieldMdastNode);
          }
        } else {
          transform(child, values);
          next.push(child);
        }
      }
      tree.children = next;
    };
    return (tree: unknown) => {
      const values = ctx.get(attrFieldValuesCtx);
      if (values) transform(tree as { children?: unknown[] }, values);
    };
  },
);

export const attrFieldMark = $markSchema("attrField", () => ({
  attrs: { name: {} },
  inclusive: false,
  parseDOM: [{ tag: "span.attr-field", getAttrs: (dom) => (dom instanceof HTMLElement ? { name: dom.getAttribute("data-attr") ?? "" } : false) }],
  toDOM: (mark) => ["span", { class: "attr-field", "data-attr": mark.attrs.name as string, title: `Atributo: ${mark.attrs.name as string}` }],
  parseMarkdown: {
    match: (node) => node.type === ATTR_MDAST,
    runner: (state, node, markType) => {
      state.openMark(markType, { name: (node as unknown as AttrFieldMdastNode).name });
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === "attrField",
    runner: (state, mark) => {
      state.withMark(mark, ATTR_MDAST, undefined, { name: mark.attrs.name });
    },
  },
}));
