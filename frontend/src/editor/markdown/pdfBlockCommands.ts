/** Comandos de la barra para las marcas de formato (ver `pdfBlocks.ts`): portada, alineación, columnas, índice y salto de página. */
import { wrapIn } from "@milkdown/prose/commands";
import { Fragment, type Node as PMNode } from "@milkdown/prose/model";
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
 * lo quita, con otro valor lo cambia. `value === ""` solo quita (p. ej. alineación a la izquierda). El comentario siempre se quita sin cambiar de autor:
 * `value` es quien lo deja y `date` el día (AAAA-MM-DD).
 */
export function togglePdfBlock(view: EditorView, kind: PdfBlockKind, value: string, date = ""): void {
  const { state } = view;
  const found = enclosing(state, kind);
  if (found) {
    if (found.node.attrs.value === value || value === "" || kind === "comment") {
      // Al quitar el contenedor el contenido sube un nivel (una posición menos): el cursor se queda donde estaba, no salta a otro bloque.
      const { from, to } = state.selection;
      const tr = state.tr.replaceWith(found.pos, found.pos + found.node.nodeSize, found.node.content);
      view.dispatch(tr.setSelection(TextSelection.between(tr.doc.resolve(from - 1), tr.doc.resolve(to - 1))));
    } else view.dispatch(state.tr.setNodeMarkup(found.pos, undefined, { ...found.node.attrs, value }));
  } else if (value !== "" || kind === "cover") {
    wrapIn(state.schema.nodes.pdf_block, { kind, value, date })(state, view.dispatch);
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

const hasCells = (node: PMNode): boolean => node.childCount > 0 && Array.from({ length: node.childCount }, (_, i) => node.child(i)).every((child) => child.attrs.kind === "col");

/**
 * Botones de 2, 3 y 4 columnas: crean las columnas con una celda `col` por columna (ver `pdfBlocks.ts`).
 * - Sin columnas en el cursor: la selección va a la primera celda y las demás nacen con un párrafo vacío.
 * - Con columnas de otro número: se añaden celdas vacías o, si sobran, su contenido se une a la última celda que queda (no se pierde nada).
 * - Con el mismo número: se quitan las columnas y el contenido de todas las celdas queda en el documento, en orden.
 * - Columnas antiguas sin celdas (texto que fluye): solo cambia el número, como antes.
 */
export function toggleColumns(view: EditorView, value: string): void {
  const { state } = view;
  const { schema } = state;
  const found = enclosing(state, "cols");
  const count = Number(value);
  const cell = (content: Fragment | PMNode[]) => schema.nodes.pdf_block.create({ kind: "col" }, content);
  const blank = () => cell([schema.nodes.paragraph.create()]);

  if (found) {
    const { node, pos } = found;
    if (!hasCells(node)) {
      togglePdfBlock(view, "cols", value);
      return;
    }
    if (node.attrs.value === value) {
      const content = Fragment.from(Array.from({ length: node.childCount }, (_, i) => node.child(i).content.content).flat());
      const tr = state.tr.replaceWith(pos, pos + node.nodeSize, content);
      view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(pos + 1, tr.doc.content.size)))).scrollIntoView());
    } else {
      // Solo se tocan las celdas que sobran o faltan: lo demás (y el cursor) se queda donde estaba.
      const tr = state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, value });
      const cells = Array.from({ length: node.childCount }, (_, i) => node.child(i));
      const end = pos + node.nodeSize - 1;
      if (cells.length < count) {
        tr.insert(end, Array.from({ length: count - cells.length }, blank));
      } else if (cells.length > count) {
        const keptSize = cells.slice(0, count).reduce((sum, c) => sum + c.nodeSize, 0);
        const tailStart = pos + 1 + keptSize;
        const tail = cells.slice(count).flatMap((c) => c.content.content);
        const lastKeptEnd = tailStart - 1; // dentro de la última celda que queda, antes de su cierre
        tr.delete(tailStart, end).insert(lastKeptEnd, tail);
        tr.setSelection(TextSelection.near(tr.doc.resolve(lastKeptEnd), -1));
      }
      view.dispatch(tr.scrollIntoView());
    }
  } else {
    const { $from, $to, from, to } = state.selection;
    const range = $from.blockRange($to);
    if (!range) return;
    const first = cell(state.doc.slice(range.start, range.end).content);
    const cols = schema.nodes.pdf_block.create({ kind: "cols", value }, [first, ...Array.from({ length: count - 1 }, blank)]);
    const tr = state.tr.replaceRangeWith(range.start, range.end, cols);
    // El contenido pasó dos niveles adentro (las columnas y su primera celda): el cursor o la selección lo siguen.
    view.dispatch(tr.setSelection(TextSelection.between(tr.doc.resolve(from + 2), tr.doc.resolve(to + 2))).scrollIntoView());
  }
  view.focus();
}
