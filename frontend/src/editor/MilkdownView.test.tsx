// SPEC-0008 RF-007, RF-008: vista Visual (Milkdown real en jsdom, con los polyfills de test-setup).
import { act, render, screen, waitFor } from "@testing-library/react";
import { EditorView } from "@milkdown/prose/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HEADING_CASES, CONTENT_NOTES } from "../../e2e/content-notes";
import { PARSE_MARK } from "./markdown/cachedParser";
import { parseMarkdownToJson } from "./markdown/parseStage";
import { MilkdownView } from "./MilkdownView";

/** Monta la vista y espera a que Milkdown termine de crearse (entrega su `EditorView`). */
async function mount(props: { value: string; readOnly?: boolean; onChange?: (v: string) => void; prefix?: string }) {
  let view: EditorView | null = null;
  const onChange = props.onChange ?? (() => {});
  const utils = render(
    <MilkdownView
      value={props.value}
      readOnly={props.readOnly ?? false}
      onChange={onChange}
      label="Visual"
      prefix={props.prefix}
      onView={(v) => {
        view = v;
      }}
    />,
  );
  await waitFor(() => expect(view).not.toBeNull());
  return { ...utils, view: view as unknown as EditorView };
}

describe("MilkdownView", () => {
  // RF-007 (VU-2): un lector de pantalla anuncia la lectura como documento de sólo lectura, no como cuadro de texto.
  it("en lectura el contenido es role=document (sin aria-readonly, inválido en document)", async () => {
    await mount({ value: "hola", readOnly: true });
    const doc = screen.getByRole("document", { name: "Visual" });
    expect(doc).not.toHaveAttribute("aria-readonly");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  // RF-008
  it("muestra el markdown renderizado", async () => {
    const { container } = await mount({ value: "# Título\n\ntexto **fuerte**" });
    expect(container.querySelector("h1")).toHaveTextContent("Título");
    expect(container.querySelector("strong")).toHaveTextContent("fuerte");
  });

  // RF-007
  it("en lectura no hay contenteditable=true", async () => {
    const { container } = await mount({ value: "hola", readOnly: true });
    expect(container.querySelector('[contenteditable="true"]')).toBeNull();
  });

  // RF-008
  it("en edición el área es editable y con nombre accesible", async () => {
    await mount({ value: "hola" });
    expect(screen.getByRole("textbox", { name: "Visual" })).toHaveAttribute("contenteditable", "true");
  });

  // RF-008
  it("montar sin editar no emite", async () => {
    const onChange = vi.fn();
    await mount({ value: "- uno\n- dos\n", onChange });
    // Espera por tiempo JUSTIFICADA (F-3): se afirma una ausencia y no hay señal que esperar. 300 ms
    // superan el debounce de 200 ms del listener de Milkdown; bajo carga el margen sólo se hace más
    // holgado, así que no puede dar un falso fallo y el caso positivo vecino prueba que el listener emite.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  // RF-008
  it("una transacción emite el markdown nuevo", async () => {
    const onChange = vi.fn();
    const { view } = await mount({ value: "hola", onChange });
    act(() => {
      view.dispatch(view.state.tr.insertText(" mundo", view.state.doc.content.size - 1));
    });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.calls.at(-1)?.[0].trim()).toBe("hola mundo");
  });

  // SPEC-0010 RF-045, P-6: el bloque heredado protegido no se parsea y se re-antepone byte a byte al emitir.
  it("prefix: no renderiza el bloque protegido y lo re-antepone al emitir", async () => {
    const onChange = vi.fn();
    const { container, view } = await mount({ value: "# Cuerpo", prefix: "---\nb: 2\n---\n", onChange });
    const prose = container.querySelector(".ProseMirror");
    expect(prose).toHaveTextContent("Cuerpo");
    expect(prose).not.toHaveTextContent("b: 2"); // el bloque no llegó a Milkdown
    act(() => {
      view.dispatch(view.state.tr.insertText("!", view.state.doc.content.size - 1));
    });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const emitted = onChange.mock.calls.at(-1)?.[0] as string;
    expect(emitted.startsWith("---\nb: 2\n---\n")).toBe(true);
    expect(emitted).toContain("Cuerpo!");
  });

  // RF-008
  it("un value externo nuevo se refleja sin emitir", async () => {
    const onChange = vi.fn();
    const { container, rerender } = await mount({ value: "uno", onChange });
    rerender(<MilkdownView value="dos" readOnly={false} onChange={onChange} label="Visual" />);
    await waitFor(() => expect(container.querySelector(".ProseMirror")).toHaveTextContent("dos"));
    // Espera por tiempo JUSTIFICADA (F-3): ausencia sin señal; 300 ms > debounce de 200 ms del listener.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  // RF-007
  it("un enlace javascript: no genera href peligroso", async () => {
    const { container } = await mount({ value: "[x](javascript:alert(1))", readOnly: true });
    // El texto del enlace se muestra (el `<a>` existe) pero sin `href`: nada que ejecutar.
    const link = container.querySelector("a");
    expect(link).not.toBeNull();
    expect(link!.hasAttribute("href")).toBe(false);
    expect(link).toHaveTextContent("x");
  });

  // RF-007
  it("sólo http/https/mailto/relativos en enlaces: tel: se quita", async () => {
    const { container } = await mount({ value: "[a](tel:123) [b](https://x.test) [c](nota.md)", readOnly: true });
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([null, "https://x.test", "nota.md"]);
  });

  // RF-007
  it("una imagen data: o relativa no llega al DOM con src; http(s) sí", async () => {
    const { container } = await mount({
      value: "![a](data:image/png;base64,AAAA) ![b](https://x.test/i.png) ![c](i.png)",
      readOnly: true,
    });
    const srcs = [...container.querySelectorAll("img:not(.ProseMirror-separator)")].map((img) => img.getAttribute("src"));
    expect(srcs).toEqual([null, "https://x.test/i.png", null]);
  });

  // RF-007
  it("<script> se muestra como texto, sin elemento script", async () => {
    const { container } = await mount({ value: "antes <script>alert(1)</script> después", readOnly: true });
    expect(container.querySelector("script")).toBeNull();
    expect(container).toHaveTextContent("<script>");
  });

  // RF-036: la node view del bloque de código no cambia el documento: el texto del `pre` es el del bloque
  // (la cabecera queda fuera) y montar no emite ningún cambio, así que serializar da lo mismo que entró.
  it("un bloque de código se pinta con su chasis y su contenido es exactamente el de la entrada", async () => {
    const onChange = vi.fn();
    const code = "uno\n\n  dos\tcon tab";
    const { container, view } = await mount({ value: "```ts\n" + code + "\n```\n", onChange });
    const block = container.querySelector(".code-block");
    expect(block).not.toBeNull();
    expect(block?.querySelector(".code-block-label")).toHaveTextContent("ts");
    expect(block?.querySelector("pre")?.textContent).toBe(code);
    expect(view.state.doc.child(0).textContent).toBe(code);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(onChange).not.toHaveBeenCalled();
  });
});

// RNF-001 (PLAN-0010 §10.1): el documento nace con los ids de encabezado ya puestos, así que
// `syncHeadingIdPlugin` no encuentra nada que cambiar y NO despacha ninguna transacción al montar
// (el `dispatch` al montar forzaba el relayout de todo el documento). Los ids del DOM son idénticos
// a los que pone el plugin hoy (mismo generador y misma regla de duplicados `-#n`).
describe("MilkdownView · ids de encabezado precalculados (RNF-001)", () => {
  afterEach(() => vi.restoreAllMocks());

  /** Ids de los encabezados del DOM, en orden. */
  const domHeadingIds = (root: ParentNode): string[] =>
    [...root.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => h.id);

  it("montar en lectura no despacha ninguna transacción (espía en view.dispatch)", async () => {
    const dispatch = vi.spyOn(EditorView.prototype, "dispatch");
    await mount({ value: HEADING_CASES[0].md, readOnly: true });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("montar la nota grande en lectura tampoco despacha (51 encabezados)", async () => {
    const big = CONTENT_NOTES.find((n) => n.key === "big")!;
    const dispatch = vi.spyOn(EditorView.prototype, "dispatch");
    await mount({ value: big.content, readOnly: true });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each(HEADING_CASES)("los ids del DOM son los del plugin para $key", async ({ md, ids }) => {
    const { container } = await mount({ value: md, readOnly: true });
    expect(domHeadingIds(container)).toEqual(ids);
  });
});

// RNF-001 precalc (PLAN-0010 §10.3): con el mdast precalculado, el editor NO reparsea con micromark
// en el hilo principal (marca `cache-hit`) y produce el MISMO documento que en frío.
describe("MilkdownView · apertura precalculada (RNF-001)", () => {
  afterEach(() => vi.restoreAllMocks());

  async function renderView(props: { value: string; preparsedMdast?: string | null }) {
    let view: EditorView | null = null;
    const utils = render(
      <MilkdownView value={props.value} readOnly onChange={() => {}} label="Visual" preparsedMdast={props.preparsedMdast ?? null} onView={(v) => (view = v)} />,
    );
    await waitFor(() => expect(view).not.toBeNull());
    return utils;
  }

  const MD = CONTENT_NOTES.find((n) => n.key === "big")!.content;

  it("abrir precalculada marca cache-hit y da el mismo DOM que en frío", async () => {
    const cold = await renderView({ value: MD });
    const coldHtml = cold.container.querySelector(".ProseMirror")!.innerHTML;
    cold.unmount();

    const mark = vi.spyOn(performance, "mark");
    const warm = await renderView({ value: MD, preparsedMdast: parseMarkdownToJson(MD) });
    expect(mark).toHaveBeenCalledWith(PARSE_MARK.cacheHit);
    expect(mark).not.toHaveBeenCalledWith(PARSE_MARK.cold);
    expect(warm.container.querySelector(".ProseMirror")!.innerHTML).toBe(coldHtml);
  });

  it("sin mdast precalculado marca cold (parseo en el hilo principal)", async () => {
    const mark = vi.spyOn(performance, "mark");
    await renderView({ value: MD, preparsedMdast: null });
    expect(mark).toHaveBeenCalledWith(PARSE_MARK.cold);
    expect(mark).not.toHaveBeenCalledWith(PARSE_MARK.cacheHit);
  });
});
