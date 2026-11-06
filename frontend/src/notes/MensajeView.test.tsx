/** H-042: un documento del buzón entre agentes se abre de solo lectura y dice de dónde viene. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MensajeView from "./MensajeView";
import type { Note, NoteStore } from "./noteStore";

vi.mock("../editor/MilkdownView", () => ({
  MilkdownView: ({ value, readOnly }: { value: string; readOnly?: boolean }) => (
    <div data-testid="body" data-readonly={String(Boolean(readOnly))}>
      {value}
    </div>
  ),
}));

const CONV = "AG - MENSAJES/aira → liza - Revisar el plan - 2026-11-05";

function noteOf(path: string, frontmatter: Record<string, unknown>, content: string): Note {
  return { id: "n1", vault_id: "v1", path, content, frontmatter, rev: "1-a", created_at: "", updated_at: "", deleted_at: null } as unknown as Note;
}

function view(note: Note) {
  const notes = { get: vi.fn().mockResolvedValue(note) } as unknown as NoteStore;
  return render(<MensajeView noteId="n1" notes={notes} notesVersion={0} vaultColor={"accent" as never} noteRefs={[]} onOpenWikilink={() => undefined} />);
}

describe("MensajeView", () => {
  it("un mensaje: texto de solo lectura, quién lo escribió y la conversación", async () => {
    view(noteOf(`${CONV}/002-de-liza.md`, {}, "Hecho."));
    expect(await screen.findByTestId("body")).toHaveAttribute("data-readonly", "true");
    expect(screen.getByRole("heading", { name: "002-de-liza" })).toBeInTheDocument();
    expect(screen.getByText(/Buzón entre agentes · solo lectura/)).toBeInTheDocument();
    expect(screen.getByText("aira → liza · Revisar el plan · 2026-11-05")).toBeInTheDocument();
    expect(screen.getByText("liza (mensaje 2)")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /guardar/i })).toBeNull();
  });

  it("la cabecera muestra el estado de la conversación", async () => {
    view(noteOf(`${CONV}/000-cabecera.md`, { titulo: "aira → liza - Revisar el plan", estado: "cerrada" }, "Cabecera"));
    expect(await screen.findByTestId("body")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "aira → liza - Revisar el plan" })).toBeInTheDocument();
    expect(screen.getByText("Estado")).toBeInTheDocument();
    expect(screen.getByText("cerrada")).toBeInTheDocument();
  });
});
