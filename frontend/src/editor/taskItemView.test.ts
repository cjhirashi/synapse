// SPEC-0010 RF-039: casillas de las listas de tareas (node view de `list_item`).
import { Schema } from "@milkdown/prose/model";
import { EditorState } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";
import { describe, expect, it } from "vitest";
import { taskItemViewFactory } from "./taskItemView";

/** `list_item` como el de Milkdown + GFM: `checked` es `null` en una lista normal y booleano en una tarea. */
const schema = new Schema({
  nodes: {
    doc: { content: "list_item+" },
    list_item: {
      content: "paragraph+",
      attrs: { label: { default: "•" }, listType: { default: "bullet" }, spread: { default: "true" }, checked: { default: null } },
      toDOM: (node) => [
        "li",
        { "data-item-type": node.attrs.checked == null ? "list" : "task", "data-label": node.attrs.label, "data-list-type": node.attrs.listType, ...(node.attrs.checked == null ? {} : { "data-checked": String(node.attrs.checked) }) },
        0,
      ],
    },
    paragraph: { content: "text*", group: "block", toDOM: () => ["p", 0] },
    text: { inline: true },
  },
});

const item = (checked: boolean | null, text = "Escribir la especificación") =>
  schema.nodes.list_item.create({ checked }, schema.nodes.paragraph.create(null, schema.text(text)));

function mount(checked: boolean | null, editable: boolean, text?: string) {
  return taskItemViewFactory()(item(checked, text), { editable } as EditorView, () => 0, [], {} as never);
}

describe("taskItemView", () => {
  // RF-039
  it("en lectura la casilla es un `role=img` «Pendiente» sin foco ni tabindex", () => {
    const view = mount(false, false);
    const mark = view.dom.querySelector(".note-task-mark")!;
    expect(mark).toHaveAttribute("role", "img");
    expect(mark).toHaveAttribute("aria-label", "Pendiente");
    expect(mark).not.toHaveAttribute("tabindex");
    expect(view.dom.querySelector("input")).toBeNull();
    expect(view.dom).toHaveClass("note-task");
  });

  // RF-039
  it("una tarea hecha se anuncia «Completada» y marca el `li`", () => {
    const view = mount(true, false);
    expect(view.dom.querySelector(".note-task-mark")).toHaveAttribute("aria-label", "Completada");
    expect(view.dom).toHaveAttribute("data-checked", "true");
  });

  // RF-039
  it("en Visual es un `input checkbox` con el texto de la tarea por nombre, fuera del contenido editable", () => {
    const view = mount(true, true);
    const box = view.dom.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(box).not.toBeNull();
    expect(box.checked).toBe(true);
    expect(box).toHaveAttribute("aria-label", "Escribir la especificación");
    expect(box.closest('[contenteditable="false"]')).not.toBeNull();
    expect(view.dom.querySelector(".note-task-mark[role='img']")).toBeNull();
  });

  // RF-039
  it("el contenido de la tarea es el `contentDOM`, aparte de la casilla", () => {
    const view = mount(false, false);
    expect(view.contentDOM).not.toBe(view.dom);
    expect(view.dom.contains(view.contentDOM!)).toBe(true);
    expect(view.contentDOM!.contains(view.dom.querySelector(".note-task-mark"))).toBe(false);
  });

  // RF-039
  it("un elemento de lista normal es el `li` de siempre (con sus atributos) y su propio contentDOM", () => {
    const view = mount(null, false);
    expect(view.dom.tagName).toBe("LI");
    expect(view.dom).toHaveAttribute("data-item-type", "list");
    expect(view.dom).not.toHaveClass("note-task");
    expect(view.contentDOM).toBe(view.dom);
  });

  // RF-039
  it("update cambia la casilla al marcar/desmarcar; cambiar de tarea a lista recrea la vista", () => {
    const view = mount(false, false);
    expect(view.update!(item(true), [], {} as never)).toBe(true);
    expect(view.dom.querySelector(".note-task-mark")).toHaveAttribute("aria-label", "Completada");
    expect(view.dom).toHaveAttribute("data-checked", "true");
    expect(view.update!(item(null), [], {} as never)).toBe(false);
  });

  // SPEC-0010 RF-039 (F.4): alternar la casilla en Visual escribe `checked` en el documento y lo anuncia.
  it("alternar la casilla en Visual cambia `checked` en una transacción y anuncia «Marcada»", () => {
    const doc = schema.nodes.doc.create(null, item(false));
    let state = EditorState.create({ schema, doc });
    const view = { editable: true, get state() { return state; }, dispatch: (tr: ReturnType<typeof state.tr.setNodeMarkup>) => { state = state.apply(tr); } } as unknown as EditorView;
    const nv = taskItemViewFactory()(doc.firstChild!, view, () => 0, [], {} as never);
    const box = nv.dom.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    box.click();
    expect(state.doc.firstChild!.attrs.checked).toBe(true);
    expect(nv.dom.querySelector('[role="status"]')).toHaveTextContent("Marcada");
  });

  // RF-039: en lectura no hay casilla operable (nada que alternar).
  it("en lectura la casilla no es un input (no se puede alternar)", () => {
    const view = mount(false, false);
    expect(view.dom.querySelector('input[type="checkbox"]')).toBeNull();
  });

  // RF-039
  it("las mutaciones de la casilla no son ediciones del documento", () => {
    const view = mount(false, false);
    const mark = view.dom.querySelector(".note-task-mark")!;
    expect(view.ignoreMutation!({ type: "attributes", target: mark } as unknown as MutationRecord)).toBe(true);
    expect(view.ignoreMutation!({ type: "childList", target: view.contentDOM! } as unknown as MutationRecord)).toBe(false);
  });
});
