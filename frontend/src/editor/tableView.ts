/**
 * *Node view* de la tabla (SPEC-0010 RF-026; PLAN-0010 §2.3-g): la `TableView` de prosemirror-tables con
 * un envoltorio `.note-table-scroll`. `@milkdown/preset-gfm` 7.22.3 no trae `columnResizing`, así que hoy
 * la tabla no tiene envoltorio y una tabla ancha desbordaba la columna; con éste el scroll horizontal es
 * del envoltorio y el documento no se mueve. En lectura el envoltorio es una región enfocable (se puede
 * recorrer con el teclado); en Visual no se le pone `tabindex` para no competir con el cursor.
 *
 * `TableView` fija un `min-width` en línea (`columnas × ancho mínimo`) que taparía el `min-width: 100%`
 * de la hoja de estilos: se retira tras cada actualización.
 */
import type { Node as PMNode } from "@milkdown/prose/model";
import { TableView } from "@milkdown/prose/tables";
import type { NodeViewConstructor } from "@milkdown/prose/view";

/** Ancho mínimo de una columna (el `min-width: 80px` de la celda en `editor.css`). */
const CELL_MIN_WIDTH = 80;

class NoteTableView extends TableView {
  constructor(node: PMNode, editable: boolean) {
    super(node, CELL_MIN_WIDTH);
    this.dom.classList.add("note-table-scroll");
    if (!editable) {
      this.dom.setAttribute("role", "region");
      this.dom.setAttribute("aria-label", "Tabla");
      this.dom.tabIndex = 0;
    }
    this.releaseWidth();
  }

  update(node: PMNode): boolean {
    const same = super.update(node);
    if (same) this.releaseWidth();
    return same;
  }

  /** Deja el ancho de la tabla a la hoja de estilos (`width: max-content; min-width: 100%`). */
  private releaseWidth(): void {
    this.table.style.minWidth = "";
    this.table.style.width = "";
  }
}

export const tableViewFactory = (): NodeViewConstructor => (node, view) => new NoteTableView(node, view.editable);
