/** Comandos de la barra para las marcas de formato (ver `pdfBlocks.ts`): portada, alineación, columnas, índice y salto de página. */
import { wrapIn } from "@milkdown/prose/commands";
import { TextSelection, type EditorState } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";
import type { PdfBlockKind, PdfMarkKind } from "./pdfBlocks";

/** Contenedor más cercano del cursor de esa clase, o `null`. */
function enclosing(state: EditorState, kind: PdfBlockKind) {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "pdf_block" && node.attrs.kind === kind) return { node, pos: $from.before(depth) };
  }
  return null;
}

/**
 * Envuelve la selección en un contenedor de esa clase y valor. Si el cursor ya está en uno de la misma clase: con el mismo valor
 * lo quita, con otro valor lo cambia. `value === ""` solo quita (p. ej. alineación a la izquierda).
 */
export function togglePdfBlock(view: EditorView, kind: PdfBlockKind, value: string): void {
  const { state } = view;
  const found = enclosing(state, kind);
  if (found) {
    if (found.node.attrs.value === value || value === "") {
      // Al quitar el contenedor el contenido sube un nivel (una posición menos): el cursor se queda donde estaba, no salta a otro bloque.
      const { from, to } = state.selection;
      const tr = state.tr.replaceWith(found.pos, found.pos + found.node.nodeSize, found.node.content);
      view.dispatch(tr.setSelection(TextSelection.between(tr.doc.resolve(from - 1), tr.doc.resolve(to - 1))));
    } else view.dispatch(state.tr.setNodeMarkup(found.pos, undefined, { ...found.node.attrs, value }));
  } else if (value !== "" || kind === "cover") {
    wrapIn(state.schema.nodes.pdf_block, { kind, value })(state, view.dispatch);
  }
  view.focus();
}

/** Inserta el índice o el salto de página tras el bloque del cursor (y un párrafo vacío si queda al final, para seguir escribiendo). */
export function insertPdfMark(view: EditorView, kind: PdfMarkKind): void {
  const { state } = view;
  const { $to } = state.selection;
  const at = $to.depth > 0 ? $to.after($to.depth) : $to.pos;
  const nodes = [state.schema.nodes.pdf_mark.create({ kind })];
  if (at >= state.doc.content.size) nodes.push(state.schema.nodes.paragraph.create());
  view.dispatch(state.tr.insert(at, nodes).scrollIntoView());
  view.focus();
}
