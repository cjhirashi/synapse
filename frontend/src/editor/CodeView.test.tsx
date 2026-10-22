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
});
