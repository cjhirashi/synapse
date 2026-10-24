// SPEC-0008 RF-008: vista Código (CodeMirror 6 real en jsdom, con los polyfills de test-setup).
import { render } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import { CodeView } from "./CodeView";

/** La instancia de CodeMirror que montó el componente (para despachar transacciones). */
function viewOf(container: HTMLElement): EditorView {
  const dom = container.querySelector(".cm-editor") as HTMLElement;
  return EditorView.findFromDOM(dom) as EditorView;
}

describe("CodeView", () => {
  // RF-008
  it("muestra el valor recibido", () => {
    const { container } = render(<CodeView value={"# Hola\n\ntexto"} onChange={() => {}} label="Código" />);
    expect(viewOf(container).state.doc.toString()).toBe("# Hola\n\ntexto");
    expect(container.querySelector(".cm-content")).toHaveAttribute("aria-label", "Código");
  });

  // RF-008
  it("una transacción emite onChange con el texto nuevo", () => {
    const onChange = vi.fn();
    const { container } = render(<CodeView value="abc" onChange={onChange} label="Código" />);
    viewOf(container).dispatch({ changes: { from: 3, insert: "d" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("abcd");
  });

  // RF-008
  it("un value externo nuevo reemplaza el documento sin emitir", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<CodeView value="uno" onChange={onChange} label="Código" />);
    rerender(<CodeView value="dos" onChange={onChange} label="Código" />);
    expect(viewOf(container).state.doc.toString()).toBe("dos");
    expect(onChange).not.toHaveBeenCalled();
  });

  // RF-008
  it("re-renderizar con el mismo valor no toca el documento", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<CodeView value="uno" onChange={onChange} label="Código" />);
    const view = viewOf(container);
    rerender(<CodeView value="uno" onChange={onChange} label="Código" />);
    expect(viewOf(container)).toBe(view);
    expect(onChange).not.toHaveBeenCalled();
  });

  // RF-029: números de línea y línea activa (P-11).
  it("muestra los números de línea y marca la línea activa", () => {
    const { container } = render(<CodeView value={"uno\ndos\ntres"} onChange={() => {}} label="Código" />);
    // El primer elemento del margen es un separador invisible con el número más ancho: no es una línea.
    const numbers = [...container.querySelectorAll<HTMLElement>(".cm-lineNumbers .cm-gutterElement")].filter((el) => el.style.visibility !== "hidden").map((el) => el.textContent);
    expect(numbers).toEqual(["1", "2", "3"]);
    expect(container.querySelector(".cm-activeLine")).not.toBeNull();
  });

  /** Texto de los tramos con una clase `sx-*` en el documento montado. */
  function spans(container: HTMLElement, className: string): string[] {
    return [...container.querySelectorAll(`.cm-line .${className}`)].map((el) => el.textContent ?? "");
  }

  // RF-029, RF-040
  it("colorea el markdown con clases sx-*: encabezados, negrita, cursiva, enlace, código y marcas", () => {
    const doc = "# Título\n\n## Sub\n\nUn **fuerte**, *suave*, `código` y [enlace](https://example.com).\n\n> cita\n\n- item";
    const { container } = render(<CodeView value={doc} onChange={() => {}} label="Código" />);
    expect(spans(container, "sx-heading1").join("")).toContain("Título");
    expect(spans(container, "sx-heading").join("")).toContain("Sub");
    expect(spans(container, "sx-strong").join("")).toContain("fuerte");
    expect(spans(container, "sx-emphasis").join("")).toContain("suave");
    expect(spans(container, "sx-code").join("")).toContain("código");
    expect(spans(container, "sx-link").join("")).toContain("enlace");
    expect(spans(container, "sx-url").join("")).toContain("https://example.com");
    expect(spans(container, "sx-quote").join("")).toContain("cita");
    // Las marcas del markdown (`#`, `**`, `>`, `-`, backticks, corchetes) llevan sx-meta.
    const marks = spans(container, "sx-meta").join("");
    for (const mark of ["#", "**", ">", "-", "`"]) expect(marks).toContain(mark);
  });
});
