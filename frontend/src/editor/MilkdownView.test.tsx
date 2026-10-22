// SPEC-0008 RF-007, RF-008: vista Visual (Milkdown real en jsdom, con los polyfills de test-setup).
import { act, render, screen, waitFor } from "@testing-library/react";
import type { EditorView } from "@milkdown/prose/view";
import { describe, expect, it, vi } from "vitest";
import { MilkdownView } from "./MilkdownView";

/** Monta la vista y espera a que Milkdown termine de crearse (entrega su `EditorView`). */
async function mount(props: { value: string; readOnly?: boolean; onChange?: (v: string) => void }) {
  let view: EditorView | null = null;
  const onChange = props.onChange ?? (() => {});
  const utils = render(
    <MilkdownView
      value={props.value}
      readOnly={props.readOnly ?? false}
      onChange={onChange}
      label="Visual"
      onView={(v) => {
        view = v;
      }}
    />,
  );
  await waitFor(() => expect(view).not.toBeNull());
  return { ...utils, view: view as unknown as EditorView };
}

describe("MilkdownView", () => {
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
    // Margen para que un listener tardío (debounce de Milkdown) tuviera ocasión de disparar.
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

  // RF-008
  it("un value externo nuevo se refleja sin emitir", async () => {
    const onChange = vi.fn();
    const { container, rerender } = await mount({ value: "uno", onChange });
    rerender(<MilkdownView value="dos" readOnly={false} onChange={onChange} label="Visual" />);
    await waitFor(() => expect(container.querySelector(".ProseMirror")).toHaveTextContent("dos"));
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
});
