// H-019 paso 4: vista del nodo html — iframe saneado en Visual y Lectura.
// H-025: soporte para YouTube embeds.
import { DOMSerializer, type Node as PMNode } from "@milkdown/prose/model";
import type { EditorView, NodeView, NodeViewConstructor } from "@milkdown/prose/view";
import { sanitizeHtmlFragment } from "./htmlSanitizer";
import { parseYoutubeEmbedSrc, parseYoutubeUrl, youtubeEmbedUrl, youtubeWatchUrl } from "./classifyUrl";

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

    // Detectar si hay iframe de YouTube
    const youtube = this.detectYoutubeIframe(fragment);
    if (youtube) {
      this.dom.classList.add("md-embed-video");

      // Crear wrapper para iframe (aspect-ratio: 16/9)
      const frameDiv = document.createElement("div");
      frameDiv.className = "md-embed-frame";

      // Mover el iframe al wrapper
      const iframe = fragment.querySelector("iframe");
      if (iframe) {
        frameDiv.appendChild(iframe);
      }

      this.dom.appendChild(frameDiv);

      // Crear enlace "Abrir en YouTube"
      const link = document.createElement("a");
      link.className = "md-embed-link";
      link.href = youtubeWatchUrl(youtube.id, youtube.start);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Abrir en YouTube";
      this.dom.appendChild(link);
    } else {
      // No es YouTube: insertar el fragmento sin cambios
      this.dom.appendChild(fragment);
    }
  }

  private detectYoutubeIframe(fragment: DocumentFragment): { id: string; start: number | null } | null {
    const iframe = fragment.querySelector("iframe");
    if (!iframe) return null;

    const src = iframe.getAttribute("src");
    if (!src) return null;

    return parseYoutubeEmbedSrc(src);
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

/** Una imagen `![](enlace de YouTube)` se pinta como el reproductor; el nodo (y su markdown) no cambia. */
class YoutubeImageView implements NodeView {
  readonly dom: HTMLDivElement;
  private src: string;

  constructor(node: PMNode, private readonly youtube: { id: string; start: number | null }) {
    this.src = node.attrs.src as string;
    this.dom = document.createElement("div");
    this.dom.className = "md-embed md-embed-video";
    this.dom.setAttribute("contenteditable", "false");
    const frameDiv = document.createElement("div");
    frameDiv.className = "md-embed-frame";
    const iframe = sanitizeHtmlFragment(`<iframe src="${youtubeEmbedUrl(youtube.id, youtube.start)}"></iframe>`).querySelector("iframe");
    if (iframe) frameDiv.appendChild(iframe);
    this.dom.appendChild(frameDiv);
    const link = document.createElement("a");
    link.className = "md-embed-link";
    link.href = youtubeWatchUrl(youtube.id, youtube.start);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Abrir en YouTube";
    this.dom.appendChild(link);
  }

  update(next: PMNode): boolean {
    return next.type.name === "image" && next.attrs.src === this.src;
  }

  stopEvent(event: Event): boolean {
    return event.target instanceof Node && this.dom.contains(event.target);
  }

  ignoreMutation(): boolean {
    return true;
  }
}

export const imageViewFactory = (): NodeViewConstructor => (node, _view, _getPos) => {
  const youtube = parseYoutubeUrl(String(node.attrs.src ?? ""));
  if (youtube) return new YoutubeImageView(node, youtube);
  return plainItem(node);
};
