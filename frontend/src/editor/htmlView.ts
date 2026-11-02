// H-019 paso 4: vista del nodo html — iframe saneado en Visual y Lectura.
import { DOMSerializer, type Node as PMNode } from "@milkdown/prose/model";
import type { EditorView, NodeView, NodeViewConstructor } from "@milkdown/prose/view";
import { sanitizeHtmlFragment } from "./htmlSanitizer";

/** Renderiza el nodo html como texto plano (esquema original). */
function plainItem(node: PMNode): NodeView {
  const spec = node.type.spec.toDOM;
  if (!spec) throw new Error("html sin toDOM");
  const { dom, contentDOM } = DOMSerializer.renderSpec(document, spec(node));
  return {
    dom,
    contentDOM: contentDOM ?? undefined,
    update: (next) => next.type === node.type && next.attrs.value === node.attrs.value,
  };
}

class HtmlEmbedView implements NodeView {
  readonly dom: HTMLDivElement;
  private node: PMNode;

  constructor(node: PMNode) {
    this.node = node;
    this.dom = document.createElement("div");
    this.dom.className = "md-embed";
    this.dom.setAttribute("data-type", "html");
    this.dom.setAttribute("data-value", node.attrs.value as string);
    this.dom.setAttribute("contenteditable", "false");
    this.render();
  }

  private render(): void {
    const html = this.node.attrs.value as string;
    const fragment = sanitizeHtmlFragment(html);
    this.dom.replaceChildren();
    this.dom.appendChild(fragment);
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type || node.attrs.value !== this.node.attrs.value) return false;
    this.node = node;
    this.render();
    return true;
  }

  stopEvent(event: Event): boolean {
    return event.target instanceof Node && this.dom.contains(event.target);
  }

  ignoreMutation(): boolean {
    return true;
  }
}

export const htmlViewFactory = (): NodeViewConstructor => (node, _view, _getPos) => {
  const html = node.attrs.value as string;
  const fragment = sanitizeHtmlFragment(html);
  const hasIframe = fragment.querySelector("iframe") !== null;
  return hasIframe ? new HtmlEmbedView(node) : plainItem(node);
};
