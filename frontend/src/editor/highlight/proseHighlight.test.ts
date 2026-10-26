// RF-027, RF-028, RF-031, RF-032 (SPEC-0010; PLAN-0010 §2.1, D-T1): el parser de `prosemirror-highlight` con
// gramáticas de Lezer cargadas bajo demanda. Se prueba sin Milkdown: el parser puro y el plugin sobre un
// esquema mínimo de ProseMirror (la integración con la vista real está en `MilkdownView.test.tsx`).
import { LanguageDescription } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { Schema } from "@milkdown/prose/model";
import { EditorState } from "@milkdown/prose/state";
import type { Decoration, DecorationSet } from "@milkdown/prose/view";
import { createHighlightPlugin } from "prosemirror-highlight";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHighlightParser } from "./proseHighlight";

/** Clase `sx-*` de una decoración en línea de ProseMirror. */
const classOf = (d: Decoration) => (d as unknown as { type: { attrs: { class: string } } }).type.attrs.class;
const rangeOf = (d: Decoration) => d as unknown as { from: number; to: number };

const OPTIONS = (language: string | undefined, content: string) => ({ content, pos: 0, language, size: content.length + 2 });

/** Un registro con un solo lenguaje, para controlar su carga. */
function registry(load: () => Promise<ReturnType<typeof javascript>>) {
  const description = LanguageDescription.of({ name: "javascript", alias: ["js"], load });
  return { description, find: (info?: string | null) => (info?.toLowerCase() === "js" ? description : null) };
}

afterEach(() => vi.restoreAllMocks());

describe("proseHighlight · parser", () => {
  it("con la gramática ya cargada devuelve decoraciones sx-* sincrónicas con posiciones del documento", async () => {
    const { description, find } = registry(async () => javascript());
    await description.load();
    const parse = createHighlightParser({ find });
    const result = parse({ ...OPTIONS("js", "const a = 1"), pos: 10 }) as Decoration[];
    expect(Array.isArray(result)).toBe(true);
    const keyword = result.find((d) => classOf(d).includes("sx-keyword"))!;
    // pos del bloque + 1 (entrada al nodo) + posición en el texto.
    expect([rangeOf(keyword).from, rangeOf(keyword).to]).toEqual([11, 16]);
    expect(result.some((d) => classOf(d).includes("sx-number"))).toBe(true);
  });

  it("carga diferida: la primera vez devuelve una promesa que nunca rechaza y luego decora", async () => {
    const load = vi.fn(async () => javascript());
    const { find } = registry(load);
    const parse = createHighlightParser({ find });
    const first = parse(OPTIONS("js", "const a = 1"));
    expect(first).toBeInstanceOf(Promise);
    await first;
    expect(load).toHaveBeenCalledTimes(1);
    const second = parse(OPTIONS("js", "const a = 1")) as Decoration[];
    expect(second.length).toBeGreaterThan(0);
  });

  it("un lenguaje desconocido o ausente no decora ni carga nada (RF-031)", () => {
    const load = vi.fn(async () => javascript());
    const parse = createHighlightParser({ find: registry(load).find });
    expect(parse(OPTIONS("brainfuck", "+++"))).toEqual([]);
    expect(parse(OPTIONS(undefined, "texto"))).toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });

  it("si la carga falla no hay excepción ni console.error y el bloque queda sin clases (RF-032)", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { find } = registry(() => Promise.reject(new Error("chunk abortado")));
    const parse = createHighlightParser({ find });
    const pending = parse(OPTIONS("js", "const a = 1"));
    await expect(pending).resolves.toBeUndefined();
    // Tras el fallo no se reintenta en bucle: sin clases y sin promesas nuevas.
    expect(parse(OPTIONS("js", "const a = 1"))).toEqual([]);
    expect(errors).not.toHaveBeenCalled();
  });
});

describe("proseHighlight · plugin", () => {
  const schema = new Schema({
    nodes: {
      doc: { content: "code_block+" },
      code_block: { content: "text*", attrs: { language: { default: "" } }, code: true },
      text: {},
    },
  });
  const stateWith = (text: string, parser: ReturnType<typeof createHighlightParser>) =>
    EditorState.create({ doc: schema.node("doc", null, [schema.node("code_block", { language: "js" }, text ? [schema.text(text)] : [])]), plugins: [createHighlightPlugin({ parser })] });
  const classes = (state: EditorState) => {
    const plugin = state.plugins[0];
    const source = plugin.props.decorations!.call(plugin, state) as DecorationSet;
    return source.find().map(classOf);
  };

  // RF-028: al editar el bloque, las clases se recalculan.
  it("las clases se actualizan al editar el bloque", async () => {
    const { description, find } = registry(async () => javascript());
    await description.load();
    const parse = createHighlightParser({ find });
    let state = stateWith("let a", parse);
    expect(classes(state).some((c) => c.includes("sx-keyword"))).toBe(true);
    // Se reemplaza «let a» por un comentario: la palabra clave deja de estarlo.
    state = state.apply(state.tr.insertText("// nota", 1, 6));
    const after = classes(state);
    expect(after.some((c) => c.includes("sx-keyword"))).toBe(false);
    expect(after.some((c) => c.includes("sx-comment"))).toBe(true);
  });
});
