// H-021: tarjeta de vista previa de un wikilink en Lectura. Se prueba el componente en aislamiento,
// dirigiendo su prop `hover` (lo que `MilkdownView` emitiría) y una vista inyectada que pinta su `value`
// como texto —así se verifica QUÉ cuerpo se renderiza sin montar Milkdown de verdad—. jsdom no ejerce el
// hover real ni la geometría: la verificación en navegador la hace AIRA (lección H-012). Aquí se prueban el
// retardo (P-3), el cierre con periodo de gracia para pasar a la tarjeta (C-3), la nota vacía (C-8), el
// enlace roto (C-6), que la vista interna es inerte (C-4) y que no se muestra el YAML heredado (P-1).
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ViewProps } from "./NoteEditor";
import type { Note } from "../notes/noteStore";
import { WikilinkPreview, type WikilinkHoverTarget } from "./WikilinkPreview";

/** Props capturadas por la última vista inyectada, para comprobar qué se renderiza y que es inerte. */
let lastViewProps: ViewProps | null = null;
function FakeView(props: ViewProps) {
  lastViewProps = props;
  return <div data-testid="preview-body">{props.value}</div>;
}

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
  const utils = render(<WikilinkPreview hover={hover} notes={notes} View={FakeView} onCreate={onCreate} delayMs={props?.delayMs ?? 0} />);
  return { ...utils, notes, onCreate };
}

beforeEach(() => {
  lastViewProps = null;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("WikilinkPreview (H-021)", () => {
  it("C-1/P-3: la tarjeta no aparece antes del retardo y sí después", async () => {
    vi.useFakeTimers();
    const { rerender } = render(<WikilinkPreview hover={null} notes={notesWith({})} View={FakeView} onCreate={vi.fn()} delayMs={400} />);
    rerender(<WikilinkPreview hover={BROKEN} notes={notesWith({})} View={FakeView} onCreate={vi.fn()} delayMs={400} />);
    act(() => void vi.advanceTimersByTime(399));
    expect(screen.queryByText(/esta nota no existe/i)).toBeNull();
    act(() => void vi.advanceTimersByTime(1));
    expect(screen.getByText(/esta nota no existe/i)).toBeInTheDocument();
  });

  it("C-1/P-1: muestra el título (sin .md) y el cuerpo renderizado, sin el bloque YAML heredado", async () => {
    const notes = notesWith({ "note:v:1": note({ path: "carpeta/Nota A.md", content: "---\ntitle: Secreto\n---\n# Hola\ncuerpo" }) });
    renderPreview(RESOLVED, { notes });
    await screen.findByTestId("preview-body");
    expect(screen.getByText("Nota A")).toBeInTheDocument(); // título = nombre de archivo sin .md
    const body = lastViewProps!.value;
    expect(body).toContain("# Hola");
    expect(body).not.toContain("title: Secreto"); // P-1: sin propiedades YAML
    expect(body).not.toContain("---");
  });

  it("C-4: la vista interna es inerte (sin onWikilinkClick ni onWikilinkHover) y de sólo lectura", async () => {
    renderPreview(RESOLVED);
    await screen.findByTestId("preview-body");
    expect(lastViewProps!.readOnly).toBe(true);
    expect(lastViewProps!.onWikilinkClick).toBeUndefined();
    expect((lastViewProps as unknown as { onWikilinkHover?: unknown }).onWikilinkHover).toBeUndefined();
  });

  it("C-8: una nota vacía muestra el título y «Nota vacía», sin renderizar cuerpo", async () => {
    const notes = notesWith({ "note:v:1": note({ path: "Vacía.md", content: "" }) });
    renderPreview(RESOLVED, { notes });
    await screen.findByText("Nota vacía");
    expect(screen.getByText("Vacía")).toBeInTheDocument();
    expect(screen.queryByTestId("preview-body")).toBeNull();
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
    expect(screen.queryByTestId("preview-body")).toBeNull();
  });

  it("C-3: al salir del enlace la tarjeta se cierra tras el periodo de gracia, salvo que el puntero entre a la tarjeta", async () => {
    vi.useFakeTimers();
    const notes = notesWith({});
    const { rerender } = render(<WikilinkPreview hover={BROKEN} notes={notes} View={FakeView} onCreate={vi.fn()} delayMs={0} />);
    act(() => void vi.advanceTimersByTime(0));
    const card = screen.getByText(/esta nota no existe/i);
    // El puntero entra a la tarjeta antes de que venza la gracia: no se cierra.
    act(() => card.closest("[data-wikilink-preview]")!.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true })));
    rerender(<WikilinkPreview hover={null} notes={notes} View={FakeView} onCreate={vi.fn()} delayMs={0} />);
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
    const { rerender } = render(<WikilinkPreview hover={BROKEN} notes={notes} View={FakeView} onCreate={vi.fn()} delayMs={0} />);
    act(() => void vi.advanceTimersByTime(0));
    expect(screen.getByText(/esta nota no existe/i)).toBeInTheDocument();
    rerender(<WikilinkPreview hover={null} notes={notes} View={FakeView} onCreate={vi.fn()} delayMs={0} />);
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.queryByText(/esta nota no existe/i)).toBeNull();
  });
});
