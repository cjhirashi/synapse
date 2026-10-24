// SPEC-0010 RF-033, RF-034, RF-035, RF-036: chasis del bloque de código (node view de ProseMirror).
import { Schema } from "@milkdown/prose/model";
import type { EditorView, NodeView } from "@milkdown/prose/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { codeBlockViewFactory } from "./codeBlockView";

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
  return factory(node, {} as EditorView, () => 0);
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
