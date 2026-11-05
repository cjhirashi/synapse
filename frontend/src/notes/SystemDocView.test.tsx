/**
 * H-041: un documento de sistema se abre de solo lectura (sin editor ni formulario) y una plantilla de sistema
 * muestra su definición.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SystemDocView from "./SystemDocView";
import type { Note, NoteStore } from "./noteStore";

vi.mock("../editor/MilkdownView", () => ({
  MilkdownView: ({ value, readOnly }: { value: string; readOnly?: boolean }) => (
    <div data-testid="body" data-readonly={String(Boolean(readOnly))}>
      {value}
    </div>
  ),
}));

function noteOf(path: string, frontmatter: Record<string, unknown>, content: string): Note {
  return { id: "n1", vault_id: "v1", path, content, frontmatter, rev: "1-a", created_at: "", updated_at: "", deleted_at: null } as unknown as Note;
}

function view(note: Note) {
  const notes = { get: vi.fn().mockResolvedValue(note) } as unknown as NoteStore;
  return render(<SystemDocView noteId="n1" notes={notes} notesVersion={0} vaultColor={"accent" as never} noteRefs={[]} onOpenWikilink={() => undefined} />);
}

describe("SystemDocView", () => {
  it("muestra el cuerpo solo lectura y la insignia con la versión", async () => {
    view(noteOf("AG - SKILLS/skill-bovedas-synapse.md", { titulo: "skill-bovedas-synapse", version: "1.0.0", sistema: true }, "# Operar"));
    expect(await screen.findByTestId("body")).toHaveAttribute("data-readonly", "true");
    expect(screen.getByRole("heading", { name: "skill-bovedas-synapse" })).toBeInTheDocument();
    expect(screen.getByText(/Documento de sistema · solo lectura · v1\.0\.0/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByText("Se ofrece en")).toBeNull();
  });

  it("una plantilla de sistema muestra dónde se ofrece y sus atributos", async () => {
    view(noteOf("PLANTILLAS/plantilla-skill.md", {
      titulo: "plantilla-skill", version: "1.0.0", sistema: true, alcance: ["AG - SKILLS"],
      atributos: [{ nombre: "propietario", tipo: "texto" }, { nombre: "agentes", tipo: "lista", valor: [] }],
    }, "# <Nombre>"));
    await waitFor(() => expect(screen.getByText("Se ofrece en")).toBeInTheDocument());
    expect(screen.getByText("AG - SKILLS")).toBeInTheDocument();
    expect(screen.getByText("propietario (texto), agentes (lista)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /guardar/i })).toBeNull();
  });
});
