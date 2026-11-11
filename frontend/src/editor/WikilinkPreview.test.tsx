// H-021: tarjeta de vista previa de un wikilink en Lectura. Se prueba el componente en aislamiento,
// dirigiendo su prop `hover` (lo que `MilkdownView` emitiría) y una vista inyectada que pinta su `value`
// como texto —así se verifica QUÉ cuerpo se renderiza sin montar Milkdown de verdad—. jsdom no ejerce el
// hover real ni la geometría: la verificación en navegador la hace AIRA (lección H-012). Aquí se prueban el
// retardo (P-3), el cierre con periodo de gracia para pasar a la tarjeta (C-3), el enlace roto (C-6) y que la
// tarjeta muestra SÓLO `titulo` y `descripcion` del frontmatter (nunca el cuerpo del documento).
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Note } from "../notes/noteStore";
import { WikilinkPreview, type WikilinkHoverTarget } from "./WikilinkPreview";

const RECT = { top: 100, bottom: 120, left: 50, right: 150, width: 100, height: 20, x: 50, y: 100, toJSON: () => ({}) } as DOMRect;

function note(partial: Partial<Note> & { path: string; content: string }): Note {
  return { id: "note:v:1", rev: "1-a", frontmatter: {}, created_at: 0, updated_at: 0, deleted_at: null, vault_id: "v", ...partial } as Note;
}

/** Store falso: `get` resuelve a la nota indicada por id. */
function notesWith(map: Record<string, Note>) {
  return { get: vi.fn(async (id: string) => map[id] ?? Promise.reject(new Error("no existe"))) };
}

const RESOLVED: WikilinkHoverTarget = { resolvedId: "note:v:1", target: "Nota A", rect: RECT };
const BROKEN: WikilinkHoverTarget = { resolvedId: null, target: "Nota Nueva", rect: RECT };

function renderPreview(hover: WikilinkHoverTarget | null, props?: Partial<Parameters<typeof WikilinkPreview>[0]>) {
  const notes = props?.notes ?? notesWith({ "note:v:1": note({ path: "Nota A.md", content: "# Hola\ncuerpo" }) });
  const onCreate = props?.onCreate ?? vi.fn();
  const utils = render(<WikilinkPreview hover={hover} notes={notes} onCreate={onCreate} delayMs={props?.delayMs ?? 0} />);
  return { ...utils, notes, onCreate };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("WikilinkPreview (H-021)", () => {
  it("C-1/P-3: la tarjeta no aparece antes del retardo y sí después", async () => {
    vi.useFakeTimers();
    const { rerender } = render(<WikilinkPreview hover={null} notes={notesWith({})} onCreate={vi.fn()} delayMs={400} />);
    rerender(<WikilinkPreview hover={BROKEN} notes={notesWith({})} onCreate={vi.fn()} delayMs={400} />);
    act(() => void vi.advanceTimersByTime(399));
    expect(screen.queryByText(/esta nota no existe/i)).toBeNull();
    act(() => void vi.advanceTimersByTime(1));
    expect(screen.getByText(/esta nota no existe/i)).toBeInTheDocument();
  });

  it("muestra `titulo` y `descripcion` del frontmatter y NO el cuerpo", async () => {
    const notes = notesWith({
      "note:v:1": note({ path: "carpeta/Nota A.md", frontmatter: { titulo: "La matriz", descripcion: "Tabla rectangular de números." }, content: "# Hola\ncuerpo secreto" }),
    });
    renderPreview(RESOLVED, { notes });
    await screen.findByText("La matriz");
    expect(screen.getByText("Tabla rectangular de números.")).toBeInTheDocument();
    expect(screen.queryByText(/cuerpo secreto/)).toBeNull();
    expect(screen.queryByText(/# Hola/)).toBeNull();
  });

  it("sin `titulo` usa el nombre de archivo sin .md", async () => {
    const notes = notesWith({ "note:v:1": note({ path: "carpeta/Nota A.md", frontmatter: { descripcion: "Algo." }, content: "x" }) });
    renderPreview(RESOLVED, { notes });
    await screen.findByText("Nota A");
    expect(screen.getByText("Algo.")).toBeInTheDocument();
  });

  it("sin `descripcion` muestra «Sin descripción» aunque el documento tenga cuerpo", async () => {
    const notes = notesWith({ "note:v:1": note({ path: "Vacía.md", frontmatter: { titulo: "Vacía" }, content: "mucho texto" }) });
    renderPreview(RESOLVED, { notes });
    await screen.findByText("Sin descripción");
    expect(screen.getByText("Vacía")).toBeInTheDocument();
    expect(screen.queryByText(/mucho texto/)).toBeNull();
  });

  it("C-6: un wikilink roto sin extensión muestra el aviso y, al hacer clic, pide crear la nota", async () => {
    const onCreate = vi.fn();
    renderPreview(BROKEN, { onCreate });
    const card = await screen.findByText(/esta nota no existe\. clic para crearla/i);
    act(() => card.click());
    expect(onCreate).toHaveBeenCalledWith("Nota Nueva");
  });

  it("C-6: un wikilink roto con extensión ajena (.docx) no muestra ninguna tarjeta", async () => {
    renderPreview({ resolvedId: null, target: "informe.docx", rect: RECT });
    await act(async () => void (await new Promise((r) => setTimeout(r, 20))));
    expect(screen.queryByText(/esta nota no existe/i)).toBeNull();
  });

  it("C-3: al salir del enlace la tarjeta se cierra tras el periodo de gracia, salvo que el puntero entre a la tarjeta", async () => {
    vi.useFakeTimers();
    const notes = notesWith({});
    const { rerender } = render(<WikilinkPreview hover={BROKEN} notes={notes} onCreate={vi.fn()} delayMs={0} />);
    act(() => void vi.advanceTimersByTime(0));
    const card = screen.getByText(/esta nota no existe/i);
    // El puntero entra a la tarjeta antes de que venza la gracia: no se cierra.
    act(() => card.closest("[data-wikilink-preview]")!.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true })));
    rerender(<WikilinkPreview hover={null} notes={notes} onCreate={vi.fn()} delayMs={0} />);
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.getByText(/esta nota no existe/i)).toBeInTheDocument();
    // Al salir también de la tarjeta, se cierra.
    act(() => screen.getByText(/esta nota no existe/i).closest("[data-wikilink-preview]")!.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true })));
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.queryByText(/esta nota no existe/i)).toBeNull();
  });

  it("C-3: sin entrar a la tarjeta, salir del enlace la cierra al vencer la gracia", async () => {
    vi.useFakeTimers();
    const notes = notesWith({});
    const { rerender } = render(<WikilinkPreview hover={BROKEN} notes={notes} onCreate={vi.fn()} delayMs={0} />);
    act(() => void vi.advanceTimersByTime(0));
    expect(screen.getByText(/esta nota no existe/i)).toBeInTheDocument();
    rerender(<WikilinkPreview hover={null} notes={notes} onCreate={vi.fn()} delayMs={0} />);
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.queryByText(/esta nota no existe/i)).toBeNull();
  });

  // Regresión (producción): la vista interna pinta tras el primer render y la tarjeta crecía fuera de la ventana
  // porque la posición sólo se calculaba una vez. Se recalcula al cambiar su altura (ResizeObserver).
  it("reposiciona la tarjeta arriba del enlace cuando, al crecer, ya no cabe debajo", async () => {
    let height = 100;
    const observers: Array<() => void> = [];
    vi.stubGlobal("ResizeObserver", class { constructor(cb: () => void) { observers.push(cb); } observe() {} disconnect() {} });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(() => height);
    const original = window.innerHeight;
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 });
    const lowLink = { ...RECT, top: 400, bottom: 420 } as DOMRect;
    try {
      renderPreview({ ...RESOLVED, rect: lowLink });
      const card = await waitFor(() => {
        const el = document.querySelector<HTMLElement>("[data-wikilink-preview]");
        expect(el).not.toBeNull();
        return el!;
      });
      expect(parseFloat(card.style.top)).toBe(428); // 100 px caben debajo del enlace
      height = 300; // el cuerpo renderizado llegó: ya no cabe debajo (428 + 300 > 592)
      act(() => observers.forEach((cb) => cb()));
      expect(parseFloat(card.style.top)).toBe(92); // 400 - 8 - 300: arriba del enlace
    } finally {
      Object.defineProperty(window, "innerHeight", { configurable: true, value: original });
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });
});
