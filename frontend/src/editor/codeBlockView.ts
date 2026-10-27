/**
 * *Node view* del bloque de código (SPEC-0010 RF-033…RF-036; PLAN-0010 §2.3-e).
 *
 * Chasis propio del bloque en lectura y Visual: una caja con cabecera de 36 px (etiqueta del
 * lenguaje tal como se declaró, o «texto», y el botón «Copiar») y el `pre` editable debajo. La
 * cabecera es DOM fuera del documento (`contenteditable="false"`): el editor ignora sus mutaciones
 * y sus eventos, y el `pre` es el `contentDOM`, así que el texto del bloque —y por tanto el
 * markdown serializado— no cambia por haber montado esta vista (RF-036). Sin HTML crudo: todo se
 * crea con `createElement`/`createElementNS` y `textContent` (RNF-003).
 *
 * Rama `mermaid` (RF-046…RF-053): el mismo chasis dibuja el diagrama con un `MermaidRenderer`
 * inyectable (el real se carga bajo demanda y verifica el SVG; aquí sólo se maqueta y se gestionan
 * los estados). Estados: dibujando, listo, error de sintaxis (grupo `Error en el diagrama`, sin
 * `role="alert"` por bloque), fallo de carga con «Reintentar» y vacío. En lectura el código se oculta
 * tras «Ver código»; en Visual sigue editable y la vista previa va debajo, re-dibujada a los 400 ms
 * de la última edición conservando el SVG anterior.
 */
import type { Node as PMNode } from "@milkdown/prose/model";
import type { NodeView, NodeViewConstructor } from "@milkdown/prose/view";
import { observeVisibility, whenIdle } from "./deferred/idle";
import { icon } from "./icons";
import { attachPanZoom, type PanZoomHandle, type ZoomButtons } from "./mermaid/panZoom";

/** El módulo de Mermaid no se pudo cargar (red, chunk ausente): se ofrece «Reintentar» (RF-053). */
export class MermaidLoadError extends Error {}

/** El diagrama no es válido (o no es seguro): se muestra el error del bloque (RF-049). */
export class MermaidSyntaxError extends Error {
  constructor(
    message: string,
    /** Línea del error dentro del bloque, si se conoce. */
    readonly line?: number,
  ) {
    super(message);
  }
}

/** Dibuja un diagrama: resuelve con un SVG **ya verificado**, o rechaza con uno de los dos errores. */
export interface MermaidRenderer {
  render(source: string): Promise<SVGSVGElement>;
  /** Avisa cuando cambia el tema (los colores van horneados en el SVG): el bloque se vuelve a dibujar (RF-050). */
  onThemeChange?(listener: () => void): () => void;
}

/** Por defecto aún no hay renderizador: el bloque cae en «No se pudo cargar el diagrama». */
const NO_RENDERER: MermaidRenderer = { render: () => Promise.reject(new MermaidLoadError("sin renderizador de Mermaid")) };

/** Dependencias inyectables de la *node view* (las pruebas pasan falsas). */
export interface CodeBlockDeps {
  /** Escritura en el portapapeles (por defecto la API del navegador). */
  writeText?: (text: string) => Promise<void>;
  mermaid?: MermaidRenderer;
  /** Ancho de la columna de lectura, para decidir si el diagrama necesita controles de zoom. */
  columnWidth?: () => number;
  /** Conecta el zoom a un diagrama que excede (por defecto `svg-pan-zoom` en carga diferida). */
  /** Avisa si el bloque está cerca del viewport (por defecto `IntersectionObserver`); devuelve cómo dejar de observar. */
  visibility?: (element: Element, onChange: (visible: boolean) => void) => () => void;
  /** Ejecuta una tarea en idle (por defecto `requestIdleCallback`); devuelve cómo cancelarla. */
  idle?: (run: () => void) => () => void;
  panZoom?: (area: HTMLElement, svg: SVGSVGElement, buttons: ZoomButtons) => Promise<PanZoomHandle>;
}

/** Espera tras la última edición antes de redibujar el diagrama en Visual (RF-047: ≤ 500 ms). */
const RENDER_DEBOUNCE_MS = 400;
/** Alto máximo del área del diagrama (R-11): lo que excede se recorre con el zoom. */
const MERMAID_MAX_HEIGHT = 420;
const MERMAID_MIN_HEIGHT = 96;
/** Numera las ayudas de teclado de los diagramas (ids únicos en el documento). */
let hintCounter = 0;

type MermaidState = "empty" | "loading" | "ready" | "error" | "loadfail";

/** Cuánto dura cada estado del botón «Copiar» antes de volver al reposo. */
const COPIED_MS = 2000;
const FAILED_MS = 4000;

/** Lo que anuncia la región viva (el fallo da la guía de la alternativa manual). */
const ANNOUNCE_COPIED = "Copiado";
const ANNOUNCE_FAILED = "No se pudo copiar. Selecciona el código y usa Ctrl+C.";

/**
 * Región viva única de todos los bloques (UX-H7): antes cada bloque llevaba la suya, vacía, y una nota con 15 bloques
 * sumaba 15 regiones al árbol de accesibilidad. Se crea al primer anuncio y vive en <body>, fuera de los bloques.
 */
function announce(message: string): void {
  let region = document.querySelector<HTMLElement>("[data-code-announcer]");
  if (!region) {
    region = document.createElement("div");
    region.className = "note-visually-hidden";
    region.setAttribute("aria-live", "polite");
    region.dataset.codeAnnouncer = "";
    document.body.append(region);
  }
  region.textContent = message;
}

const browserWriteText = (text: string): Promise<void> =>
  navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject(new Error("sin API de portapapeles"));

class CodeBlockView implements NodeView {
  readonly dom: HTMLElement;
  readonly contentDOM: HTMLElement;
  private readonly header: HTMLElement;
  private readonly label: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly writeText: (text: string) => Promise<void>;
  private readonly renderer: MermaidRenderer;
  private readonly columnWidth: () => number;
  private readonly observe: NonNullable<CodeBlockDeps["visibility"]>;
  private readonly whenIdle: NonNullable<CodeBlockDeps["idle"]>;
  private readonly attachZoom: NonNullable<CodeBlockDeps["panZoom"]>;
  /** En lectura (`false`) el código del diagrama va oculto; en Visual siempre se ve. */
  private readonly editable: boolean;
  private node: PMNode;
  private timer: ReturnType<typeof setTimeout> | null = null;

  // --- Mermaid (sólo si el lenguaje es `mermaid`) ---
  private toggle: HTMLButtonElement | null = null;
  private preview: HTMLElement | null = null;
  private frame: HTMLElement | null = null;
  private state: MermaidState = "empty";
  private svg: SVGSVGElement | null = null;
  private codeExpanded = false;
  private error: { message: string; line?: number } | null = null;
  private renderTimer: ReturnType<typeof setTimeout> | null = null;
  /** Número de la última orden de dibujo: un resultado de una orden anterior se descarta. */
  private renderSeq = 0;
  private destroyed = false;
  private unsubscribeTheme: (() => void) | null = null;
  /** Zoom conectado al SVG actual y número de la última conexión pedida (una que llega tarde se suelta). */
  private zoom: PanZoomHandle | null = null;
  private zoomSeq = 0;
  /** Dibujo diferido (PLAN-0010 §11.2): cerca del viewport, «sucio» (hay algo que dibujar) y la espera de idle en curso. */
  private visible = false;
  private dirty = false;
  private cancelIdle: (() => void) | null = null;
  private stopObserving: (() => void) | null = null;

  constructor(node: PMNode, editable: boolean, deps: CodeBlockDeps) {
    this.node = node;
    this.editable = editable;
    this.writeText = deps.writeText ?? browserWriteText;
    this.renderer = deps.mermaid ?? NO_RENDERER;
    this.columnWidth = deps.columnWidth ?? (() => this.dom.clientWidth);
    this.attachZoom = deps.panZoom ?? attachPanZoom;
    this.observe = deps.visibility ?? ((element, onChange) => observeVisibility(element, onChange));
    this.whenIdle = deps.idle ?? ((run) => whenIdle(run));

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


    const actions = document.createElement("div");
    actions.className = "code-block-actions";
    actions.append(this.button);
    this.header.append(this.label, actions);

    this.contentDOM = document.createElement("pre");
    this.dom.append(this.header, this.contentDOM);

    this.syncLanguage();
    this.rest();
    if (this.isMermaid()) this.startMermaid(actions);
  }

  private isMermaid(): boolean {
    return String(this.node.attrs.language ?? "").toLowerCase() === "mermaid";
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
    announce(copied ? ANNOUNCE_COPIED : ANNOUNCE_FAILED);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.rest();
      announce("");
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

  // --- Mermaid ------------------------------------------------------------------------------

  /** Monta el área del diagrama y «Ver código» (sólo lectura) y lanza el primer dibujo. */
  private startMermaid(actions: HTMLElement): void {
    this.dom.classList.add("code-block-mermaid");
    if (!this.editable) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "code-block-toggle";
      toggle.setAttribute("aria-expanded", "false");
      toggle.addEventListener("click", () => {
        this.codeExpanded = !this.codeExpanded;
        this.syncChrome();
      });
      toggle.append(icon("code"), this.text("Ver código"));
      actions.prepend(toggle);
      this.toggle = toggle;
    }
    this.preview = document.createElement("div");
    this.preview.className = "mermaid-preview";
    // Lectura: el diagrama va sobre el código; Visual: el código se edita arriba y la vista previa va debajo.
    if (this.editable) this.dom.append(this.preview);
    else this.dom.insertBefore(this.preview, this.contentDOM);
    this.unsubscribeTheme = this.renderer.onThemeChange?.(() => this.schedule(true)) ?? null;
    // El diagrama no compite con «clic → legible» (RNF-001): se dibuja al acercarse al viewport y en idle. Un bloque
    // vacío no cuesta nada y se resuelve ya.
    this.stopObserving = this.observe(this.dom, (visible) => {
      this.visible = visible;
      if (visible && this.dirty) this.requestDraw();
    });
    this.schedule(true);
  }

  /** Visibilidad del código y del botón según el estado (el error y el fallo de carga enseñan la fuente). */
  private syncChrome(): void {
    const showCode = this.editable || this.codeExpanded || this.state === "error" || this.state === "loadfail";
    this.contentDOM.hidden = !showCode;
    this.toggle?.setAttribute("aria-expanded", String(this.codeExpanded));
  }

  /**
   * Pide un dibujo: «inmediato» (apertura, reintento, tema) o a los 400 ms de la última edición. El inmediato espera a
   * que el bloque esté cerca del viewport y a idle; la edición en Visual ya tiene al bloque a la vista.
   */
  private schedule(immediate: boolean): void {
    if (this.renderTimer) clearTimeout(this.renderTimer);
    this.renderTimer = null;
    if (!immediate) {
      this.renderTimer = setTimeout(() => void this.draw(), RENDER_DEBOUNCE_MS);
      return;
    }
    this.dirty = true;
    if (this.node.textContent.trim() === "") void this.draw();
    else if (this.visible) this.requestDraw();
    else if (!this.svg && this.state !== "ready") this.setState("loading", true);
  }

  /** Dibuja en el próximo idle (una sola espera a la vez). */
  private requestDraw(): void {
    if (this.cancelIdle) return;
    this.cancelIdle = this.whenIdle(() => {
      this.cancelIdle = null;
      void this.draw();
    });
  }

  private async draw(): Promise<void> {
    this.dirty = false;
    const source = this.node.textContent;
    const seq = ++this.renderSeq;
    if (source.trim() === "") {
      this.svg = null;
      this.setState("empty");
      return;
    }
    // Con un SVG anterior se conserva mientras se dibuja el nuevo (sin parpadeo al teclear).
    if (!this.svg) this.setState("loading");
    try {
      const svg = await this.renderer.render(source);
      if (seq !== this.renderSeq || this.destroyed) return;
      this.svg = svg;
      this.error = null;
      this.setState("ready");
    } catch (err) {
      if (seq !== this.renderSeq || this.destroyed) return;
      this.svg = null;
      if (err instanceof MermaidLoadError) {
        this.setState("loadfail");
      } else {
        this.error = { message: err instanceof Error ? err.message : String(err), line: err instanceof MermaidSyntaxError ? err.line : undefined };
        this.setState("error");
      }
    }
  }

  /** `pending`: todavía no se ha pedido el dibujo (el bloque espera a estar cerca del viewport). */
  private setState(state: MermaidState, pending = false): void {
    this.state = state;
    this.releaseZoom();
    this.syncChrome();
    const preview = this.preview;
    if (!preview) return;
    preview.hidden = false;
    this.frame = null;
    switch (state) {
      case "empty":
        // En lectura un diagrama vacío no ocupa sitio; en Visual invita a escribir.
        preview.hidden = !this.editable;
        preview.replaceChildren(this.caption(), this.paragraph("mermaid-empty", "Escribe el diagrama en el bloque de arriba"));
        break;
      case "loading": {
        const area = this.area();
        area.setAttribute("aria-busy", "true");
        if (pending) area.dataset.pending = "";
        area.removeAttribute("role");
        area.textContent = "Dibujando diagrama…";
        preview.replaceChildren(this.caption(), this.wrap(area));
        break;
      }
      case "ready": {
        const area = this.area();
        area.setAttribute("role", "img");
        area.setAttribute("aria-label", this.accessibleName());
        area.append(this.svg as SVGSVGElement);
        const frame = this.wrap(area);
        const controls = this.controls(area);
        if (controls) frame.append(controls.group, controls.hint);
        preview.replaceChildren(this.caption(), frame);
        // El zoom mide el SVG ya maquetado: se conecta con el área dentro del documento.
        if (controls) this.connectZoom(area, controls.buttons);
        break;
      }
      case "error":
        preview.replaceChildren(this.caption(), this.errorBox());
        break;
      case "loadfail":
        preview.replaceChildren(this.caption(), this.loadFailBox());
        break;
    }
  }

  private caption(): HTMLElement {
    const caption = this.paragraph("mermaid-caption", "Vista previa");
    caption.hidden = !this.editable;
    return caption;
  }

  private paragraph(className: string, text: string): HTMLParagraphElement {
    const p = document.createElement("p");
    p.className = className;
    p.textContent = text;
    return p;
  }

  private area(): HTMLElement {
    const area = document.createElement("div");
    area.className = "mermaid-area";
    return area;
  }

  private wrap(area: HTMLElement): HTMLElement {
    const frame = document.createElement("div");
    frame.className = "mermaid-frame";
    frame.append(area);
    this.frame = frame;
    return frame;
  }

  /** Nombre accesible del diagrama: su `accTitle` o «Diagrama Mermaid». */
  private accessibleName(): string {
    const match = this.node.textContent.match(/^\s*accTitle\s*:\s*(.+)$/m);
    return match?.[1].trim() || "Diagrama Mermaid";
  }

  /**
   * Controles de zoom: sólo si el SVG fijo excede la columna o el alto máximo (RF-052). También deja el área
   * lista para operarlo: enfocable, con su ayuda de teclado, y con el alto fijo que el ajuste necesita.
   */
  private controls(area: HTMLElement): { group: HTMLElement; hint: HTMLElement; buttons: ZoomButtons } | null {
    const svg = this.svg as SVGSVGElement;
    // Tamaño natural del diagrama: su `viewBox` (o `width`/`height`); se lee del atributo, no de `viewBox.baseVal`.
    const [, , boxWidth, boxHeight] = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
    const width = boxWidth || Number(svg.getAttribute("width")) || 0;
    const height = boxHeight || Number(svg.getAttribute("height")) || 0;
    const column = this.columnWidth();
    if (width <= column && height <= MERMAID_MAX_HEIGHT) return null;

    // Alto del área: el del diagrama ajustado al ancho de la columna, entre 96 y 420 px (R-11).
    const fitted = width > 0 ? (height * Math.min(column, width)) / width : MERMAID_MAX_HEIGHT;
    area.dataset.zoom = "";
    area.style.setProperty("--mermaid-height", `${Math.round(Math.min(MERMAID_MAX_HEIGHT, Math.max(MERMAID_MIN_HEIGHT, fitted)))}px`);
    area.tabIndex = 0;
    const hint = document.createElement("span");
    hint.id = `mermaid-hint-${++hintCounter}`;
    hint.className = "note-visually-hidden";
    hint.textContent = "Flechas para desplazar, + y - para acercar o alejar, 0 para reajustar. Con Ctrl o ⌘ y la rueda también se acerca.";
    area.setAttribute("aria-describedby", hint.id);

    const group = document.createElement("div");
    group.className = "mermaid-controls";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Controles del diagrama");
    const make = (label: string, glyph: "zoom-in" | "zoom-out" | "maximize") => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", label);
      button.append(icon(glyph, 14));
      // Hasta que el zoom esté conectado (carga diferida) los botones no hacen nada: arrancan deshabilitados.
      button.disabled = true;
      group.append(button);
      return button;
    };
    const buttons = { zoomIn: make("Acercar", "zoom-in"), zoomOut: make("Alejar", "zoom-out"), reset: make("Reajustar vista", "maximize") };
    return { group, hint, buttons };
  }

  /** Conecta el zoom al área; si el bloque se redibuja o se destruye antes de que cargue, se suelta al llegar. */
  private connectZoom(area: HTMLElement, buttons: ZoomButtons): void {
    const seq = ++this.zoomSeq;
    void this.attachZoom(area, this.svg as SVGSVGElement, buttons).then((handle) => {
      if (seq !== this.zoomSeq || this.destroyed) handle.destroy();
      else this.zoom = handle;
    });
  }

  private releaseZoom(): void {
    this.zoomSeq += 1;
    this.zoom?.destroy();
    this.zoom = null;
  }

  private errorBox(): HTMLElement {
    const box = document.createElement("div");
    box.className = "mermaid-error";
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", "Error en el diagrama");
    const title = this.paragraph("mermaid-error-title", "No se pudo dibujar el diagrama");
    title.prepend(icon("circle-alert"));
    const detail = document.createElement("code");
    detail.className = "mermaid-error-detail";
    detail.textContent = this.error?.message ?? "";
    const where = this.error?.line ? ` (línea ${this.error.line})` : "";
    box.append(title, detail, this.paragraph("mermaid-error-guide", `Revisa la sintaxis del bloque mermaid${where} y vuelve a intentarlo.`));
    return box;
  }

  private loadFailBox(): HTMLElement {
    const box = document.createElement("div");
    box.className = "mermaid-loadfail";
    const message = this.paragraph("mermaid-loadfail-title", "No se pudo cargar el diagrama");
    message.prepend(icon("triangle-alert"));
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "note-ghost-button";
    retry.append(icon("rotate-cw"), this.text("Reintentar"));
    retry.addEventListener("click", () => this.schedule(true));
    box.append(message, retry);
    return box;
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    const wasMermaid = this.isMermaid();
    const previous = this.node.textContent;
    this.node = node;
    this.syncLanguage();
    // Cambiar de/hacia `mermaid` cambia la estructura del bloque: ProseMirror lo vuelve a crear.
    if (wasMermaid !== this.isMermaid()) return false;
    if (this.isMermaid() && node.textContent !== previous) this.schedule(!this.editable);
    return true;
  }

  /** Los eventos de la cabecera (clic en «Copiar») y de la vista previa no son del editor. */
  stopEvent(event: Event): boolean {
    return event.target instanceof Node && (this.header.contains(event.target) || Boolean(this.preview?.contains(event.target)));
  }

  /** Los cambios de la cabecera y de la vista previa (etiqueta, estados, SVG) no son ediciones del documento. */
  ignoreMutation(mutation: MutationRecord | { type: "selection"; target: Node }): boolean {
    return !this.contentDOM.contains(mutation.target);
  }

  destroy(): void {
    this.destroyed = true;
    this.unsubscribeTheme?.();
    this.unsubscribeTheme = null;
    this.stopObserving?.();
    this.stopObserving = null;
    this.cancelIdle?.();
    this.cancelIdle = null;
    this.releaseZoom();
    if (this.timer) clearTimeout(this.timer);
    if (this.renderTimer) clearTimeout(this.renderTimer);
    this.timer = null;
    this.renderTimer = null;
  }
}

/** Constructor de la *node view* para registrarlo con `nodeViewCtx`. */
export function codeBlockViewFactory(deps: CodeBlockDeps = {}): NodeViewConstructor {
  return (node, view) => new CodeBlockView(node, view.editable, deps);
}
