/**
 * *Node view* del bloque de código (SPEC-0010 RF-033…RF-036; PLAN-0010 §2.3-e).
 *
 * Chasis propio del bloque en lectura y Visual: una caja con cabecera de 36 px (etiqueta del
 * lenguaje tal como se declaró, o «texto», y el botón «Copiar») y el `pre` editable debajo. La
 * cabecera es DOM fuera del documento (`contenteditable="false"`): el editor ignora sus mutaciones
 * y sus eventos, y el `pre` es el `contentDOM`, así que el texto del bloque —y por tanto el
 * markdown serializado— no cambia por haber montado esta vista (RF-036). Sin HTML crudo: todo se
 * crea con `createElement`/`createElementNS` y `textContent` (RNF-003).
 */
import type { Node as PMNode } from "@milkdown/prose/model";
import type { NodeView, NodeViewConstructor } from "@milkdown/prose/view";
import { icon } from "./icons";

/** Escritura en el portapapeles (inyectable en las pruebas; por defecto la API del navegador). */
export interface CodeBlockDeps {
  writeText?: (text: string) => Promise<void>;
}

/** Cuánto dura cada estado del botón «Copiar» antes de volver al reposo. */
const COPIED_MS = 2000;
const FAILED_MS = 4000;

/** Lo que anuncia la región viva (el fallo da la guía de la alternativa manual). */
const ANNOUNCE_COPIED = "Copiado";
const ANNOUNCE_FAILED = "No se pudo copiar. Selecciona el código y usa Ctrl+C.";

const browserWriteText = (text: string): Promise<void> =>
  navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject(new Error("sin API de portapapeles"));

class CodeBlockView implements NodeView {
  readonly dom: HTMLElement;
  readonly contentDOM: HTMLElement;
  private readonly header: HTMLElement;
  private readonly label: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly live: HTMLElement;
  private readonly writeText: (text: string) => Promise<void>;
  private node: PMNode;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(node: PMNode, deps: CodeBlockDeps) {
    this.node = node;
    this.writeText = deps.writeText ?? browserWriteText;

    this.dom = document.createElement("div");
    this.dom.className = "code-block";

    this.header = document.createElement("div");
    this.header.className = "code-block-header";
    this.header.setAttribute("contenteditable", "false");

    this.label = document.createElement("span");
    this.label.className = "code-block-label";

    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.className = "code-block-copy";
    // Nombre accesible fijo: el estado («Copiado») se anuncia por la región viva, no cambiando el nombre.
    this.button.setAttribute("aria-label", "Copiar código");
    this.button.addEventListener("click", () => void this.copy());

    this.live = document.createElement("span");
    this.live.className = "note-visually-hidden";
    this.live.setAttribute("aria-live", "polite");

    this.header.append(this.label, this.button, this.live);

    this.contentDOM = document.createElement("pre");
    this.dom.append(this.header, this.contentDOM);

    this.syncLanguage();
    this.rest();
  }

  /** Etiqueta y atributo del lenguaje (el nombre declarado, sin transformar). */
  private syncLanguage(): void {
    const language = String(this.node.attrs.language ?? "");
    this.dom.dataset.language = language;
    this.label.textContent = language || "texto";
  }

  /** Botón en reposo: icono + «Copiar». */
  private rest(): void {
    this.button.replaceChildren(icon("copy"), this.text("Copiar"));
    delete this.button.dataset.state;
  }

  private text(value: string): HTMLSpanElement {
    const span = document.createElement("span");
    span.textContent = value;
    return span;
  }

  private show(state: "copied" | "failed"): void {
    const copied = state === "copied";
    this.button.dataset.state = state;
    this.button.replaceChildren(icon(copied ? "check" : "circle-alert"), this.text(copied ? "Copiado" : "No se pudo copiar"));
    this.live.textContent = copied ? ANNOUNCE_COPIED : ANNOUNCE_FAILED;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.rest();
      this.live.textContent = "";
    }, copied ? COPIED_MS : FAILED_MS);
  }

  private async copy(): Promise<void> {
    try {
      await this.writeText(this.node.textContent);
      this.show("copied");
    } catch {
      // Permiso denegado o contexto no seguro (RF-035): se avisa y el texto sigue seleccionable.
      this.show("failed");
    }
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.syncLanguage();
    return true;
  }

  /** Los eventos de la cabecera (clic en «Copiar») no son del editor. */
  stopEvent(event: Event): boolean {
    return event.target instanceof Node && this.header.contains(event.target);
  }

  /** Los cambios de la cabecera (etiqueta, estado del botón) no son ediciones del documento. */
  ignoreMutation(mutation: MutationRecord | { type: "selection"; target: Node }): boolean {
    return !this.contentDOM.contains(mutation.target);
  }

  destroy(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

/** Constructor de la *node view* para registrarlo con `nodeViewCtx`. */
export function codeBlockViewFactory(deps: CodeBlockDeps = {}): NodeViewConstructor {
  return (node) => new CodeBlockView(node, deps);
}
