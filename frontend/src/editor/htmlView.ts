// H-019 paso 4: vista del nodo html — iframe saneado en Visual y Lectura.
// H-025: soporte para YouTube embeds.
import { DOMSerializer, type Node as PMNode } from "@milkdown/prose/model";
import type { EditorView, NodeView, NodeViewConstructor } from "@milkdown/prose/view";
import { sanitizeHtmlFragment } from "./htmlSanitizer";
import { isAgentPhotoUrl } from "./safeUrl";
import { fullscreenButton, openImageViewer } from "./imageViewer";
import { icon } from "./icons";
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

/** Enlace con ícono «abrir en pestaña nueva» (esquina inferior derecha del documento incrustado). */
function openInNewTabLink(src: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "md-embed-open";
  link.href = src;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.title = "Abrir en una pestaña nueva";
  link.setAttribute("aria-label", "Abrir en una pestaña nueva");
  link.appendChild(icon("external-link", 16));
  return link;
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
      // No es YouTube (Archify, Plotly…): el documento se ve en su sitio y un botón lo abre en una pestaña nueva.
      this.dom.appendChild(fragment);
      this.dom.querySelectorAll("iframe").forEach((iframe) => {
        const src = iframe.getAttribute("src");
        if (!src) return;
        const wrap = document.createElement("div");
        wrap.className = "md-embed-open-wrap";
        iframe.replaceWith(wrap);
        wrap.append(iframe, openInNewTabLink(src));
      });
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

/** HTML de maquetación con `style` (una caja de color, un detalle): se dibuja saneado en su sitio, en Visual y en Lectura (H-036f). */
class StyledHtmlView implements NodeView {
  readonly dom: HTMLElement;
  private value: string;

  constructor(node: PMNode, block: boolean) {
    this.value = node.attrs.value as string;
    this.dom = document.createElement(block ? "div" : "span");
    this.dom.className = "md-html";
    this.dom.setAttribute("data-type", "html");
    this.dom.setAttribute("data-value", this.value);
    this.dom.setAttribute("contenteditable", "false");
    this.dom.appendChild(sanitizeHtmlFragment(this.value));
  }

  update(node: PMNode): boolean {
    return node.type.name === "html" && node.attrs.value === this.value;
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
  if (fragment.querySelector("iframe") !== null) return new HtmlEmbedView(node);
  const styled = fragment.querySelector("[style]");
  // Un bloque (`<div …>`) ocupa su línea; uno en línea (`<span …>`) va dentro del texto.
  if (styled !== null) return new StyledHtmlView(node, fragment.firstElementChild?.tagName === "DIV");
  return plainItem(node);
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

/** Imagen del documento (fija o animada) con el botón de pantalla completa abajo a la derecha. */
class FullscreenImageView implements NodeView {
  readonly dom: HTMLSpanElement;
  private img: HTMLImageElement;
  private node: PMNode;

  constructor(node: PMNode) {
    this.node = node;
    this.dom = document.createElement("span");
    this.dom.className = "md-img";
    this.dom.setAttribute("contenteditable", "false");
    this.img = this.renderImg();
    this.dom.append(
      this.img,
      fullscreenButton(() => {
        const src = this.img.currentSrc || this.img.getAttribute("src") || "";
        if (src) openImageViewer(src, this.img.alt);
      }),
    );
  }

  private renderImg(): HTMLImageElement {
    const spec = this.node.type.spec.toDOM;
    if (!spec) throw new Error("image sin toDOM");
    return DOMSerializer.renderSpec(document, spec(this.node)).dom as HTMLImageElement;
  }

  update(next: PMNode): boolean {
    if (next.type !== this.node.type) return false;
    this.node = next;
    const fresh = this.renderImg();
    this.img.replaceWith(fresh);
    this.img = fresh;
    return true;
  }

  stopEvent(event: Event): boolean {
    return event.target instanceof Element && event.target.closest(".md-img-fullscreen") !== null;
  }

  ignoreMutation(): boolean {
    return true;
  }
}

/** Foto de un agente (H-053): avatar pequeño en línea con el texto, sin botón de pantalla completa. */
class AgentAvatarView implements NodeView {
  readonly dom: HTMLImageElement;

  constructor(node: PMNode) {
    this.dom = document.createElement("img");
    this.dom.className = "md-agent-avatar";
    this.dom.setAttribute("src", String(node.attrs.src ?? ""));
    this.dom.setAttribute("alt", String(node.attrs.alt ?? ""));
  }

  update(next: PMNode): boolean {
    return next.type.name === "image" && isAgentPhotoUrl(String(next.attrs.src ?? "")) && next.attrs.src === this.dom.getAttribute("src");
  }

  ignoreMutation(): boolean {
    return true;
  }
}

export const imageViewFactory = (): NodeViewConstructor => (node, _view, _getPos) => {
  if (isAgentPhotoUrl(String(node.attrs.src ?? ""))) return new AgentAvatarView(node);
  const youtube = parseYoutubeUrl(String(node.attrs.src ?? ""));
  if (youtube) return new YoutubeImageView(node, youtube);
  return new FullscreenImageView(node);
};
