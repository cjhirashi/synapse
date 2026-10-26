// SPEC-0010 RF-033, RF-034, RF-035, RF-036: chasis del bloque de código (node view de ProseMirror).
import { Schema } from "@milkdown/prose/model";
import type { EditorView, NodeView } from "@milkdown/prose/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { codeBlockViewFactory, MermaidLoadError, MermaidSyntaxError, type CodeBlockDeps, type MermaidRenderer } from "./codeBlockView";

const schema = new Schema({
  nodes: {
    doc: { content: "code_block+" },
    code_block: { content: "text*", marks: "", group: "block", code: true, attrs: { language: { default: "" } } },
    text: { inline: true },
  },
});

/** Monta la node view de un bloque con ese lenguaje y texto. */
function mount(language: string, text: string, writeText?: (text: string) => Promise<void>): NodeView {
  const node = schema.nodes.code_block.create({ language }, text ? schema.text(text) : undefined);
  const factory = codeBlockViewFactory({ writeText });
  return factory(node, {} as EditorView, () => 0, [], {} as never);
}

const copyButton = (view: NodeView) => view.dom.querySelector<HTMLButtonElement>(".code-block-copy")!;
const live = (view: NodeView) => view.dom.querySelector<HTMLElement>("[aria-live]")!;

describe("codeBlockView", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // RF-033
  it("la cabecera no es editable y muestra la etiqueta tal como se declaró", () => {
    const view = mount("TypeScript", "let a = 1");
    const header = view.dom.querySelector(".code-block-header")!;
    expect(header).toHaveAttribute("contenteditable", "false");
    expect(header.querySelector(".code-block-label")).toHaveTextContent("TypeScript");
    expect(view.dom).toHaveAttribute("data-language", "TypeScript");
  });

  // RF-033
  it("sin lenguaje la etiqueta es «texto»", () => {
    const view = mount("", "hola");
    expect(view.dom.querySelector(".code-block-label")).toHaveTextContent("texto");
  });

  // RF-036
  it("el `pre` es el contentDOM y la cabecera no es parte del contenido", () => {
    const view = mount("ts", "uno\n\ndos");
    expect(view.contentDOM?.tagName).toBe("PRE");
    expect(view.dom.contains(view.contentDOM!)).toBe(true);
    expect(view.dom.querySelector(".code-block-header")?.contains(view.contentDOM!)).toBe(false);
  });

  // RF-033
  it("update con otro lenguaje cambia la etiqueta y conserva el nodo; otro tipo de nodo no", () => {
    const view = mount("ts", "a");
    const next = schema.nodes.code_block.create({ language: "python" }, schema.text("a"));
    expect(view.update!(next, [], {} as never)).toBe(true);
    expect(view.dom.querySelector(".code-block-label")).toHaveTextContent("python");
    expect(view.update!(schema.nodes.doc.create(null, next), [], {} as never)).toBe(false);
  });

  // RF-034
  it("«Copiar» tiene nombre accesible fijo y texto visible", () => {
    const button = copyButton(mount("ts", "a"));
    expect(button).toHaveAttribute("aria-label", "Copiar código");
    expect(button).toHaveTextContent("Copiar");
    expect(button).toHaveAttribute("type", "button");
  });

  // RF-034
  it("copiar escribe el texto del bloque, muestra «Copiado» 2 s y lo anuncia", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const button = copyButton(mount("ts", "let a = 1", writeText));
    button.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(writeText).toHaveBeenCalledWith("let a = 1");
    expect(button).toHaveTextContent("Copiado");
    expect(button).toHaveAttribute("aria-label", "Copiar código");
    await vi.advanceTimersByTimeAsync(2000);
    expect(button).toHaveTextContent("Copiar");
    expect(button).not.toHaveTextContent("Copiado");
  });

  // RF-034
  it("la región viva anuncia «Copiado»", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const view = mount("ts", "x", writeText);
    copyButton(view).click();
    await vi.advanceTimersByTimeAsync(0);
    expect(live(view)).toHaveAttribute("aria-live", "polite");
    expect(live(view)).toHaveTextContent("Copiado");
  });

  // RF-035
  it("si copiar falla no lanza, muestra «No se pudo copiar» 4 s y lo anuncia con la guía", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denegado"));
    const view = mount("ts", "x", writeText);
    const button = copyButton(view);
    button.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(button).toHaveTextContent("No se pudo copiar");
    expect(live(view)).toHaveTextContent("No se pudo copiar. Selecciona el código y usa Ctrl+C.");
    await vi.advanceTimersByTimeAsync(3999);
    expect(button).toHaveTextContent("No se pudo copiar");
    await vi.advanceTimersByTimeAsync(1);
    expect(button).toHaveTextContent("Copiar");
  });

  // RF-035
  it("sin API de portapapeles también se trata como fallo, sin excepción", async () => {
    const view = mount("ts", "x", undefined);
    // jsdom no trae `navigator.clipboard`: el valor por defecto debe degradar a «No se pudo copiar».
    const button = copyButton(view);
    expect(() => button.click()).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
    expect(button).toHaveTextContent("No se pudo copiar");
  });

  // RF-034
  it("destroy cancela los temporizadores", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const view = mount("ts", "x", writeText);
    copyButton(view).click();
    await vi.advanceTimersByTimeAsync(0);
    view.destroy!();
    expect(vi.getTimerCount()).toBe(0);
  });

  // RF-033
  it("los eventos de la cabecera no los toma el editor; los del contenido sí", () => {
    const view = mount("ts", "x");
    const inHeader = new MouseEvent("mousedown", { bubbles: true });
    copyButton(view).dispatchEvent(inHeader);
    expect(view.stopEvent!(Object.defineProperty(inHeader, "target", { value: copyButton(view) }))).toBe(true);
    expect(view.stopEvent!(Object.defineProperty(new MouseEvent("mousedown"), "target", { value: view.contentDOM }))).toBe(false);
  });

  // RF-033
  it("las mutaciones de la cabecera no las procesa el editor", () => {
    const view = mount("ts", "x");
    const label = view.dom.querySelector(".code-block-label")!;
    expect(view.ignoreMutation!({ type: "characterData", target: label } as unknown as MutationRecord)).toBe(true);
    expect(view.ignoreMutation!({ type: "childList", target: view.contentDOM! } as unknown as MutationRecord)).toBe(false);
  });
});

// --- Rama `mermaid` con un renderizador falso inyectado (SPEC-0010 RF-046…RF-053) -------------------

const SVG_NS = "http://www.w3.org/2000/svg";

/** SVG falso con el tamaño de su `viewBox` (jsdom no hace *layout*). */
function fakeSvg(width: number, height = 100): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("data-fake", "1");
  return svg;
}

interface MermaidMount {
  text?: string;
  editable?: boolean;
  renderer?: MermaidRenderer;
  columnWidth?: number;
}

function mountMermaid({ text = "flowchart TD\n  A --> B", editable = false, renderer, columnWidth = 600 }: MermaidMount = {}): NodeView {
  const node = schema.nodes.code_block.create({ language: "mermaid" }, text ? schema.text(text) : undefined);
  const deps: CodeBlockDeps = { mermaid: renderer, columnWidth: () => columnWidth };
  const view = codeBlockViewFactory(deps)(node, { editable } as EditorView, () => 0, [], {} as never);
  // `toBeVisible` exige el nodo dentro del documento.
  document.body.append(view.dom);
  return view;
}

const area = (view: NodeView) => view.dom.querySelector<HTMLElement>('[role="img"], .mermaid-area')!;
const flush = () => vi.advanceTimersByTimeAsync(0);

describe("codeBlockView · Mermaid", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  // RF-046
  it("muestra «Dibujando diagrama…» con aria-busy mientras el renderizador no responde", async () => {
    const renderer: MermaidRenderer = { render: () => new Promise(() => {}) };
    const view = mountMermaid({ renderer });
    await flush();
    expect(area(view)).toHaveAttribute("aria-busy", "true");
    expect(area(view)).toHaveTextContent("Dibujando diagrama…");
  });

  // RF-046, RF-051
  it("el SVG devuelto va dentro de un role=img con nombre «Diagrama Mermaid»", async () => {
    const view = mountMermaid({ renderer: { render: async () => fakeSvg(300) } });
    await flush();
    const el = view.dom.querySelector('[role="img"]')!;
    expect(el).toHaveAttribute("aria-label", "Diagrama Mermaid");
    expect(el.querySelector("svg[data-fake]")).not.toBeNull();
    expect(el).not.toHaveAttribute("aria-busy", "true");
  });

  // RF-051
  it("el nombre accesible sale de accTitle cuando el diagrama lo declara", async () => {
    const view = mountMermaid({ text: "flowchart TD\n  accTitle: Flujo de guardado\n  A --> B", renderer: { render: async () => fakeSvg(300) } });
    await flush();
    expect(view.dom.querySelector('[role="img"]')).toHaveAttribute("aria-label", "Flujo de guardado");
  });

  // RF-049
  it("un error de sintaxis muestra el grupo «Error en el diagrama» con la línea y, en lectura, la fuente", async () => {
    const renderer: MermaidRenderer = { render: async () => Promise.reject(new MermaidSyntaxError("Parse error on line 3", 3)) };
    const view = mountMermaid({ renderer });
    await flush();
    const group = view.dom.querySelector('[role="group"][aria-label="Error en el diagrama"]')!;
    expect(group).not.toBeNull();
    expect(group).toHaveTextContent("No se pudo dibujar el diagrama");
    expect(group).toHaveTextContent("Parse error on line 3");
    expect(group).toHaveTextContent("Revisa la sintaxis del bloque mermaid (línea 3) y vuelve a intentarlo.");
    expect(view.dom.querySelector("[role='alert']")).toBeNull(); // no `alert` por bloque
    // En lectura la fuente se ve debajo como bloque de código.
    expect(view.contentDOM).toBeVisible();
  });

  // RF-053
  it("un fallo de carga muestra «No se pudo cargar el diagrama» y «Reintentar» vuelve a pedirlo", async () => {
    const render = vi.fn().mockRejectedValueOnce(new MermaidLoadError("chunk")).mockResolvedValueOnce(fakeSvg(300));
    const view = mountMermaid({ renderer: { render } });
    await flush();
    expect(view.dom).toHaveTextContent("No se pudo cargar el diagrama");
    const retry = [...view.dom.querySelectorAll("button")].find((b) => b.textContent?.includes("Reintentar"))!;
    expect(retry).toBeTruthy();
    retry.click();
    await flush();
    expect(render).toHaveBeenCalledTimes(2);
    expect(view.dom.querySelector("svg[data-fake]")).not.toBeNull();
  });

  // RF-046
  it("sin renderizador instalado el bloque queda en «No se pudo cargar el diagrama» (aún no carga nada)", async () => {
    const view = mountMermaid();
    await flush();
    expect(view.dom).toHaveTextContent("No se pudo cargar el diagrama");
  });

  // RF-050
  it("al cambiar el tema vuelve a dibujar el diagrama visible y, al destruirse, deja de escuchar", async () => {
    let notify: () => void = () => {};
    const off = vi.fn();
    const render = vi.fn(async () => fakeSvg(300));
    const renderer: MermaidRenderer = {
      render,
      onThemeChange: (listener) => {
        notify = listener;
        return off;
      },
    };
    const view = mountMermaid({ renderer });
    await flush();
    expect(render).toHaveBeenCalledTimes(1);
    notify();
    await flush();
    expect(render).toHaveBeenCalledTimes(2);
    view.destroy!();
    expect(off).toHaveBeenCalledTimes(1);
  });

  // RF-048
  it("vacío: en lectura no hay área; en Visual invita a escribir", async () => {
    const renderer: MermaidRenderer = { render: vi.fn() };
    const read = mountMermaid({ text: "   ", renderer });
    await flush();
    expect(read.dom.querySelector(".mermaid-area")).toBeNull();
    const visual = mountMermaid({ text: "  ", editable: true, renderer });
    await flush();
    expect(visual.dom).toHaveTextContent("Escribe el diagrama en el bloque de arriba");
    expect(renderer.render).not.toHaveBeenCalled();
  });

  // RF-047
  it("«Ver código» tiene aria-expanded: en lectura el código está oculto y se muestra al activarlo", async () => {
    const view = mountMermaid({ renderer: { render: async () => fakeSvg(300) } });
    await flush();
    const toggle = [...view.dom.querySelectorAll("button")].find((b) => b.textContent?.includes("Ver código"))!;
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(view.contentDOM).not.toBeVisible();
    toggle.click();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(view.contentDOM).toBeVisible();
  });

  // RF-047
  it("en Visual el código sigue editable y la vista previa va debajo con el rótulo «Vista previa»", async () => {
    const view = mountMermaid({ editable: true, renderer: { render: async () => fakeSvg(300) } });
    await flush();
    expect(view.contentDOM).toBeVisible();
    const children = [...view.dom.children];
    expect(children.indexOf(view.contentDOM!)).toBeLessThan(children.findIndex((c) => c.classList.contains("mermaid-preview")));
    expect(view.dom.querySelector(".mermaid-preview")).toHaveTextContent("Vista previa");
  });

  // RF-052
  it("los controles de zoom sólo aparecen si el SVG excede la columna y «Reajustar vista» arranca deshabilitado", async () => {
    const wide = mountMermaid({ renderer: { render: async () => fakeSvg(2000) }, columnWidth: 600 });
    await flush();
    const group = wide.dom.querySelector('[role="group"][aria-label="Controles del diagrama"]')!;
    expect(group).not.toBeNull();
    const names = [...group.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(["Acercar", "Alejar", "Reajustar vista"]);
    expect(group.querySelector<HTMLButtonElement>('[aria-label="Reajustar vista"]')!.disabled).toBe(true);
    const narrow = mountMermaid({ renderer: { render: async () => fakeSvg(300) }, columnWidth: 600 });
    await flush();
    expect(narrow.dom.querySelector('[aria-label="Controles del diagrama"]')).toBeNull();
  });

  // RF-047
  it("en Visual re-dibuja a los 400 ms de la última tecla conservando el SVG anterior", async () => {
    let n = 0;
    const render = vi.fn(async () => {
      const svg = fakeSvg(300);
      svg.setAttribute("data-n", String(++n));
      return svg;
    });
    const view = mountMermaid({ editable: true, renderer: { render } });
    await flush();
    expect(render).toHaveBeenCalledTimes(1);
    const next = schema.nodes.code_block.create({ language: "mermaid" }, schema.text("flowchart TD\n  A --> C"));
    view.update!(next, [], {} as never);
    await vi.advanceTimersByTimeAsync(399);
    expect(render).toHaveBeenCalledTimes(1);
    expect(view.dom.querySelector("svg[data-fake]")).toHaveAttribute("data-n", "1");
    await vi.advanceTimersByTimeAsync(1);
    expect(render).toHaveBeenCalledTimes(2);
    expect(view.dom.querySelector("svg[data-fake]")).toHaveAttribute("data-n", "2");
  });

  const edit = (view: NodeView, text: string) => view.update!(schema.nodes.code_block.create({ language: "mermaid" }, schema.text(text)), [], {} as never);

  // RF-047
  it("una ráfaga de teclas produce un solo dibujo, a los 400 ms de la última (≤ 500 ms)", async () => {
    const render = vi.fn(async () => fakeSvg(300));
    const view = mountMermaid({ editable: true, renderer: { render } });
    await flush();
    for (const text of ["flowchart TD\n  A --> B1", "flowchart TD\n  A --> B12", "flowchart TD\n  A --> B123"]) {
      edit(view, text);
      await vi.advanceTimersByTimeAsync(300);
    }
    expect(render).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(render).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenLastCalledWith("flowchart TD\n  A --> B123");
  });

  // RF-047
  it("un dibujo lento ya superado por otra edición se descarta y gana el último", async () => {
    const pending: Array<(svg: SVGSVGElement) => void> = [];
    const render = vi.fn((source: string) => new Promise<SVGSVGElement>((resolve) => pending.push((svg) => (svg.setAttribute("data-source", source), resolve(svg)))));
    const view = mountMermaid({ editable: true, renderer: { render } });
    await flush();
    edit(view, "flowchart TD\n  A --> C");
    await vi.advanceTimersByTimeAsync(400);
    expect(render).toHaveBeenCalledTimes(2);
    // Llegan en orden inverso: primero el nuevo y después el viejo.
    pending[1](fakeSvg(300));
    await flush();
    pending[0](fakeSvg(300));
    await flush();
    expect(view.dom.querySelector("svg[data-fake]")).toHaveAttribute("data-source", "flowchart TD\n  A --> C");
  });

  // RF-047, RF-049
  it("en Visual un error al teclear muestra el error con el código editable y al corregir vuelve el diagrama", async () => {
    const render = vi.fn(async (source: string) => {
      if (source.includes("???")) throw new MermaidSyntaxError("Parse error on line 2", 2);
      return fakeSvg(300);
    });
    const view = mountMermaid({ editable: true, renderer: { render } });
    await flush();
    edit(view, "flowchart TD\n  ???");
    await vi.advanceTimersByTimeAsync(400);
    expect(view.dom.querySelector('[aria-label="Error en el diagrama"]')).not.toBeNull();
    expect(view.contentDOM.hidden).toBe(false);
    edit(view, "flowchart TD\n  A --> B");
    await vi.advanceTimersByTimeAsync(400);
    expect(view.dom.querySelector('[aria-label="Error en el diagrama"]')).toBeNull();
    expect(view.dom.querySelector("svg[data-fake]")).not.toBeNull();
  });

  // RF-047
  it("al vaciar el bloque en Visual la vista previa invita a escribir, sin pedir un dibujo", async () => {
    const render = vi.fn(async () => fakeSvg(300));
    const view = mountMermaid({ editable: true, renderer: { render } });
    await flush();
    view.update!(schema.nodes.code_block.create({ language: "mermaid" }), [], {} as never);
    await vi.advanceTimersByTimeAsync(400);
    expect(render).toHaveBeenCalledTimes(1);
    expect(view.dom).toHaveTextContent("Escribe el diagrama en el bloque de arriba");
  });

  // RF-046
  it("un bloque que no es mermaid no pide el renderizador", async () => {
    const render = vi.fn();
    const node = schema.nodes.code_block.create({ language: "ts" }, schema.text("a"));
    codeBlockViewFactory({ mermaid: { render } })(node, { editable: false } as EditorView, () => 0, [], {} as never);
    await flush();
    expect(render).not.toHaveBeenCalled();
  });
});
