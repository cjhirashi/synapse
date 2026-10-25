/**
 * *Node view* de los elementos de lista (SPEC-0010 RF-039; PLAN-0010 §2.3-g): las tareas (`checked` no
 * nulo, de GFM) llevan una casilla propia; un elemento de lista normal se pinta exactamente como lo
 * hace el esquema (`toDOM`), así que esta vista no cambia nada para las listas que no son de tareas.
 *
 * - Lectura: la casilla es una imagen (`role="img"`, «Pendiente»/«Completada») sin foco ni hover:
 *   no se puede operar y no es una tabulación más.
 * - Visual: un `input type="checkbox"` fuera del contenido editable, con el texto de la tarea como
 *   nombre accesible. Alternarlo es lógica (SPEC-0010 F.4): por ahora la casilla sólo refleja el estado.
 */
import { DOMSerializer, type Node as PMNode } from "@milkdown/prose/model";
import type { EditorView, NodeView, NodeViewConstructor } from "@milkdown/prose/view";

const isTask = (node: PMNode): boolean => node.attrs.checked !== null && node.attrs.checked !== undefined;

/** `li` plano del esquema (`toDOM` del `list_item`): lo que se pintaba antes de esta vista. */
function plainItem(node: PMNode): NodeView {
  const spec = node.type.spec.toDOM;
  if (!spec) throw new Error("list_item sin toDOM");
  const { dom, contentDOM } = DOMSerializer.renderSpec(document, spec(node));
  return {
    dom,
    contentDOM: contentDOM ?? undefined,
    // Cualquier cambio de atributos (p. ej. pasa a ser tarea) recrea la vista con el `li` correcto.
    update: (next) => next.type === node.type && !isTask(next) && JSON.stringify(next.attrs) === JSON.stringify(node.attrs),
  };
}

class TaskItemView implements NodeView {
  readonly dom: HTMLElement;
  readonly contentDOM: HTMLElement;
  private readonly slot: HTMLElement;
  private node: PMNode;

  constructor(node: PMNode, private readonly editable: boolean, private readonly view?: EditorView, private readonly getPos?: () => number | undefined) {
    this.node = node;
    const rendered = DOMSerializer.renderSpec(document, node.type.spec.toDOM!(node)).dom as HTMLElement;
    this.dom = rendered;
    this.dom.classList.add("note-task");

    // Casilla fuera del contenido editable: el editor no la trata como texto.
    this.slot = document.createElement("span");
    this.slot.className = "note-task-slot";
    this.slot.setAttribute("contenteditable", "false");

    this.contentDOM = document.createElement("div");
    this.contentDOM.className = "note-task-body";
    // Región viva para anunciar «Marcada»/«Sin marcar» al alternar (RF-039); fuera del contenido editable.
    this.live = document.createElement("span");
    this.live.className = "sr-only";
    this.live.setAttribute("role", "status");
    this.live.setAttribute("aria-live", "polite");
    this.live.setAttribute("contenteditable", "false");
    this.dom.append(this.slot, this.contentDOM, this.live);
    this.paint();
  }

  private readonly live: HTMLElement;

  /** Alterna el estado de la tarea (RF-039): escribe `checked` en el documento y lo anuncia. */
  private toggle(): void {
    if (!this.editable || !this.view || !this.getPos) return;
    const pos = this.getPos();
    if (pos === undefined) return;
    const next = !this.checked;
    this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, checked: next }));
    this.live.textContent = next ? "Marcada" : "Sin marcar";
  }

  private get checked(): boolean {
    return this.node.attrs.checked === true;
  }

  private paint(): void {
    if (this.editable) {
      const box = document.createElement("input");
      box.type = "checkbox";
      box.className = "note-task-mark";
      box.checked = this.checked;
      box.setAttribute("aria-label", this.node.textContent.trim() || "Tarea");
      // El documento es la verdad: se evita el toggle nativo y se escribe el cambio en una transacción.
      box.addEventListener("mousedown", (event) => event.preventDefault());
      box.addEventListener("click", (event) => {
        event.preventDefault();
        this.toggle();
      });
      this.slot.replaceChildren(box);
    } else {
      const mark = document.createElement("span");
      mark.className = "note-task-mark";
      mark.setAttribute("role", "img");
      mark.setAttribute("aria-label", this.checked ? "Completada" : "Pendiente");
      this.slot.replaceChildren(mark);
    }
    this.dom.dataset.checked = String(this.checked);
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type || !isTask(node)) return false;
    this.node = node;
    this.paint();
    return true;
  }

  stopEvent(event: Event): boolean {
    return event.target instanceof Node && this.slot.contains(event.target);
  }

  ignoreMutation(mutation: MutationRecord | { type: "selection"; target: Node }): boolean {
    return !this.contentDOM.contains(mutation.target);
  }
}

export const taskItemViewFactory = (): NodeViewConstructor => (node, view, getPos) =>
  isTask(node) ? new TaskItemView(node, view.editable, view, getPos as () => number | undefined) : plainItem(node);
