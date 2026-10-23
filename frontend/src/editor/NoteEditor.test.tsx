// Editor de la nota abierta (SPEC-0008 RF-007, RF-008, RF-016; PLAN-0008 §2.6, P-5).
// Con editores falsos (textareas) para probar el estado del envoltorio; la prueba con los
// editores reales (RF-008, byte a byte) está al final.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import userEvent from "@testing-library/user-event";
import { DataMemoryRouter } from "../test-utils/router";
import { describe, expect, it, vi } from "vitest";
import { memoryDb, syncValue, WithSync } from "../test-utils/sync";
import type { NoteConflict } from "../sync/conflicts";
import type { SyncContextValue } from "../sync/useSync";
import { createNoteStore } from "../notes/noteStore";
import { CONTENT_MAX_BYTES } from "../notes/noteRules";
import NoteEditor, { type NoteEditorViews, type ViewProps } from "./NoteEditor";

const VAULT = "11111111-1111-4111-8111-111111111111";

/** Editores falsos: un textarea que lee y escribe el mismo texto, como el contrato real. */
function fake(kind: string) {
  return function Fake({ value, onChange, label, readOnly }: ViewProps) {
    return (
      <>
        <textarea
          aria-label={label}
          data-kind={kind}
          readOnly={readOnly}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {/* Atajo para producir un texto enorme sin teclearlo. */}
        <button type="button" onClick={() => onChange("a".repeat(CONTENT_MAX_BYTES + 1))}>
          pegar enorme {kind}
        </button>
      </>
    );
  };
}
const views: NoteEditorViews = { Visual: fake("visual"), Code: fake("code") };

async function setup(content = "# Hola\n", extra: Partial<SyncContextValue> = {}) {
  const db = memoryDb();
  const { value } = syncValue(extra, db);
  const first = await value.notes.create(VAULT, "Primera");
  await value.notes.save(first.id, content, first.rev);
  const second = await value.notes.create(VAULT, "Segunda");
  const onCancelOpen = vi.fn();
  function ui(noteId: string, editOnOpen = false) {
    return (
      <DataMemoryRouter>
        <WithSync value={value}>
          <NoteEditor noteId={noteId} editOnOpen={editOnOpen} onCancelOpen={onCancelOpen} views={views} />
        </WithSync>
      </DataMemoryRouter>
    );
  }
  const utils = render(ui(first.id));
  await screen.findByRole("heading", { name: "Primera" });
  return { ...utils, ui, value, first, second, onCancelOpen };
}

describe("modo lectura y edición (RF-007)", () => {
  // RF-007
  it("abre en lectura: contenido en el visor de sólo lectura y sin controles de edición", async () => {
    await setup("# Hola\n");
    expect(screen.getByRole("textbox", { name: "Contenido de la nota" })).toHaveValue("# Hola\n");
    expect(screen.getByRole("textbox", { name: "Contenido de la nota" })).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Código" })).toBeNull();
  });

  // RF-007
  it("'Editar' activa la edición y 'Leer' vuelve a la lectura", async () => {
    await setup();
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByRole("button", { name: "Leer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Editor visual" })).not.toHaveAttribute("readonly");
    await userEvent.click(screen.getByRole("button", { name: "Leer" }));
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
  });

  // RF-007
  it("editOnOpen abre directamente en edición", async () => {
    const { ui, second, rerender } = await setup();
    rerender(ui(second.id, true));
    await screen.findByRole("heading", { name: "Segunda" });
    expect(screen.getByRole("button", { name: "Leer" })).toBeInTheDocument();
  });
});

describe("alternar Visual/Código (RF-008)", () => {
  // RF-008
  it("conserva el borrador y no llama al almacén", async () => {
    const { value } = await setup("uno");
    const get = vi.spyOn(value.notes, "get");
    const save = vi.spyOn(value.notes, "save");
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Editor visual" }), " dos");
    await userEvent.click(screen.getByRole("button", { name: "Código" }));
    expect(screen.getByRole("textbox", { name: "Editor de código" })).toHaveValue("uno dos");
    await userEvent.type(screen.getByRole("textbox", { name: "Editor de código" }), " tres");
    await userEvent.click(screen.getByRole("button", { name: "Visual" }));
    expect(screen.getByRole("textbox", { name: "Editor visual" })).toHaveValue("uno dos tres");
    expect(get).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  // RF-008
  it("marca la vista activa con aria-pressed", async () => {
    await setup();
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByRole("button", { name: "Visual" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Código" }));
    expect(screen.getByRole("button", { name: "Código" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("guardado explícito (P-5)", () => {
  // RF-008
  it("'Guardar' escribe el borrador sobre la revisión cargada", async () => {
    const { value, first } = await setup("uno");
    const save = vi.spyOn(value.notes, "save");
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Editor visual" }), "!");
    expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("Guardado");
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toBe(first.id);
    expect(save.mock.calls[0][1]).toBe("uno!");
    expect((await value.notes.get(first.id)).content).toBe("uno!");
    expect(screen.queryByText("Cambios sin guardar")).toBeNull();
  });

  // RF-008
  it.each([
    ["Ctrl+S", "{Control>}s{/Control}"],
    ["Cmd+S", "{Meta>}s{/Meta}"],
  ])("%s guarda", async (_name, keys) => {
    const { value, first } = await setup("uno");
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Editor visual" }), "!");
    await userEvent.keyboard(keys);
    await screen.findByText("Guardado");
    expect(screen.queryByText("Cambios sin guardar")).toBeNull();
    expect((await value.notes.get(first.id)).content).toBe("uno!");
  });

  // E-1 (PLAN-0008 §17): un guardado en vuelo absorbe el doble Ctrl+S / auto-repeat.
  it("RF-008: un doble Ctrl+S guarda una sola vez (sin rama de conflicto con contenido idéntico)", async () => {
    const { value, first } = await setup("uno");
    const real = value.notes.save.bind(value.notes);
    // Compuerta: el guardado sigue «en vuelo» hasta que la prueba la abre (sin plazos fijos).
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const save = vi.spyOn(value.notes, "save").mockImplementation(async (...args) => {
      await gate;
      return real(...args);
    });
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Editor visual" }), "!");
    const region = screen.getByRole("region", { name: "Editor de nota" });
    fireEvent.keyDown(region, { key: "s", ctrlKey: true });
    fireEvent.keyDown(region, { key: "s", ctrlKey: true });
    release();
    await screen.findByText("Guardado");
    expect(save).toHaveBeenCalledTimes(1);
    expect((await value.notes.get(first.id)).content).toBe("uno!");
  });

  // E-1: si el borrador cambió durante el vuelo, se guarda después sobre la revisión nueva.
  it("RF-008: si el borrador cambia durante el guardado, se guarda después sobre la rev nueva", async () => {
    const { value, first } = await setup("uno");
    const real = value.notes.save.bind(value.notes);
    // El primer guardado queda en vuelo (compuerta) mientras el usuario sigue escribiendo.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const save = vi.spyOn(value.notes, "save").mockImplementation(async (...args) => {
      await gate;
      return real(...args);
    });
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    const box = screen.getByRole("textbox", { name: "Editor visual" });
    await userEvent.type(box, "!");
    const region = screen.getByRole("region", { name: "Editor de nota" });
    fireEvent.keyDown(region, { key: "s", ctrlKey: true });
    await userEvent.type(box, "?");
    fireEvent.keyDown(region, { key: "s", ctrlKey: true });
    release();
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    await screen.findByText("Guardado");
    expect(save.mock.calls[1][2]).not.toBe(first.rev); // sobre la revisión que dejó el primer guardado
    expect((await value.notes.get(first.id)).content).toBe("uno!?");
    expect(screen.queryByText("Cambios sin guardar")).toBeNull();
  });

  // RF-007
  it("'Leer' con cambios guarda antes de volver a la lectura", async () => {
    const { value } = await setup("uno");
    const save = vi.spyOn(value.notes, "save");
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Editor visual" }), "!");
    await userEvent.click(screen.getByRole("button", { name: "Leer" }));
    await screen.findByRole("button", { name: "Editar" });
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: "Contenido de la nota" })).toHaveValue("uno!");
  });

  // RF-007
  it("'Leer' sin cambios no escribe", async () => {
    const { value } = await setup("uno");
    const save = vi.spyOn(value.notes, "save");
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.click(screen.getByRole("button", { name: "Leer" }));
    expect(save).not.toHaveBeenCalled();
  });

  // RF-016
  it("más de 2 MiB muestra el mensaje, no guarda y se queda en edición con el borrador", async () => {
    const { value } = await setup("uno");
    const save = vi.spyOn(value.notes, "save");
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.click(screen.getByRole("button", { name: /pegar enorme/ }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("2 MiB");
    expect(save).not.toHaveBeenCalled();
    // Leer tampoco puede guardar: se queda en edición.
    await userEvent.click(screen.getByRole("button", { name: "Leer" }));
    expect(screen.getByRole("button", { name: "Leer" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("2 MiB");
  });

  // RF-016
  it("un fallo del almacén se muestra y conserva el borrador", async () => {
    const { value } = await setup("uno");
    vi.spyOn(value.notes, "save").mockRejectedValueOnce(new Error("boom"));
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Editor visual" }), "!");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo");
    expect(screen.getByRole("textbox", { name: "Editor visual" })).toHaveValue("uno!");
  });

  // RF-008
  it("con cambios sin guardar avisa al cerrar la pestaña (beforeunload)", async () => {
    await setup("uno");
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Editor visual" }), "!");
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });
});

describe("cambiar de nota con cambios sin guardar", () => {
  async function dirtyThenRequestSecond() {
    const ctx = await setup("uno");
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Editor visual" }), "!");
    ctx.rerender(ctx.ui(ctx.second.id));
    return ctx;
  }

  // RF-008
  it("sin cambios abre la otra nota sin preguntar", async () => {
    const { ui, second, rerender } = await setup("uno");
    rerender(ui(second.id));
    await screen.findByRole("heading", { name: "Segunda" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  // RF-008
  it("con cambios pregunta y 'Seguir editando' no cambia y avisa al padre", async () => {
    const { onCancelOpen, first } = await dirtyThenRequestSecond();
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Seguir editando" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onCancelOpen).toHaveBeenCalledWith(first.id);
    expect(screen.getByRole("textbox", { name: "Editor visual" })).toHaveValue("uno!");
  });

  // U-1 (PLAN-0008 §17): el diálogo gestiona el foco.
  it("RF-008: el diálogo mueve el foco a su primer botón, atrapa el Tab y Escape = «Seguir editando»", async () => {
    const { onCancelOpen, first } = await dirtyThenRequestSecond();
    const dialog = await screen.findByRole("alertdialog");
    const buttons = within(dialog).getAllByRole("button");
    await waitFor(() => expect(buttons[0]).toHaveFocus());
    await userEvent.tab({ shift: true }); // desde el primero, hacia atrás: da la vuelta al último
    expect(buttons[buttons.length - 1]).toHaveFocus();
    await userEvent.tab(); // desde el último, hacia delante: vuelve al primero
    expect(buttons[0]).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onCancelOpen).toHaveBeenCalledWith(first.id);
  });

  it("RF-008: al cerrar el diálogo el foco vuelve a donde estaba", async () => {
    await dirtyThenRequestSecond();
    await screen.findByRole("alertdialog");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Editor visual" })).toHaveFocus());
  });

  // RF-008
  it("'Descartar y abrir' abre la otra sin guardar", async () => {
    const { value, first } = await dirtyThenRequestSecond();
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Descartar y abrir" }));
    await screen.findByRole("heading", { name: "Segunda" });
    expect((await value.notes.get(first.id)).content).toBe("uno");
  });

  // RF-008
  it("'Guardar y abrir' guarda y abre la otra", async () => {
    const { value, first } = await dirtyThenRequestSecond();
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Guardar y abrir" }));
    await screen.findByRole("heading", { name: "Segunda" });
    expect((await value.notes.get(first.id)).content).toBe("uno!");
  });
});

describe("renombrar la nota abierta con borrador sucio (VF-3)", () => {
  // RF-011
  it("el borrador se conserva, la ruta se actualiza y guardar no crea un conflicto", async () => {
    const db = memoryDb();
    const { value } = syncValue({}, db);
    const note = await value.notes.create(VAULT, "Primera");
    await value.notes.save(note.id, "uno", (await value.notes.get(note.id)).rev);
    const tree = (version: number) => (
      <DataMemoryRouter>
        <WithSync value={{ ...value, notesVersion: version }}>
          <NoteEditor noteId={note.id} views={views} />
        </WithSync>
      </DataMemoryRouter>
    );
    const { rerender } = render(tree(0));
    await screen.findByRole("heading", { name: "Primera" });
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Editor visual" }), "!");
    // Renombrado desde el árbol: sólo cambia la ruta, el contenido es el de la base.
    await value.notes.rename(note.id, "Nueva.md", (await value.notes.get(note.id)).rev);
    rerender(tree(1));
    await screen.findByRole("heading", { name: "Nueva" });
    expect(screen.getByRole("textbox", { name: "Editor visual" })).toHaveValue("uno!");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("Guardado");
    const stored = await db.get<{ content: string; path: string; _conflicts?: string[] }>(note.id, { conflicts: true });
    expect(stored.content).toBe("uno!");
    expect(stored.path).toBe("Nueva.md");
    expect(stored._conflicts).toBeUndefined();
  });

  // RF-011
  it("si el contenido también cambió sigue el camino de P-8 (rama en conflicto, nada se pierde)", async () => {
    const db = memoryDb();
    const { value } = syncValue({}, db);
    const note = await value.notes.create(VAULT, "Primera");
    await value.notes.save(note.id, "uno", (await value.notes.get(note.id)).rev);
    const tree = (version: number) => (
      <DataMemoryRouter>
        <WithSync value={{ ...value, notesVersion: version }}>
          <NoteEditor noteId={note.id} views={views} />
        </WithSync>
      </DataMemoryRouter>
    );
    const { rerender } = render(tree(0));
    await screen.findByRole("heading", { name: "Primera" });
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Editor visual" }), "!");
    await value.notes.save(note.id, "desde otro", (await value.notes.get(note.id)).rev);
    rerender(tree(1));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("Guardado");
    const stored = await db.get<{ _conflicts?: string[] }>(note.id, { conflicts: true });
    expect(stored._conflicts).toHaveLength(1);
  });
});

describe("nota abierta enviada a la papelera por sync (VF-4, VF-5)", () => {
  /** Nota "Primera" abierta; devuelve cómo cambiar `notesVersion` y la tienda para manipularla por fuera. */
  async function openTrashable(content = "uno") {
    const db = memoryDb();
    const { value } = syncValue({}, db);
    const note = await value.notes.create(VAULT, "Primera");
    await value.notes.save(note.id, content, (await value.notes.get(note.id)).rev);
    const tree = (version: number) => (
      <DataMemoryRouter>
        <WithSync value={{ ...value, notesVersion: version }}>
          <NoteEditor noteId={note.id} views={views} />
        </WithSync>
      </DataMemoryRouter>
    );
    const utils = render(tree(0));
    await screen.findByRole("heading", { name: "Primera" });
    const trash = async () => value.notes.softDelete(note.id, (await value.notes.get(note.id)).rev);
    return { ...utils, tree, value, note, trash };
  }

  // RF-017
  it("'Restaurar y guardar' devuelve la nota con el borrador", async () => {
    const { tree, rerender, value, note, trash } = await openTrashable();
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Editor visual" }), "!");
    await trash();
    rerender(tree(1));
    await userEvent.click(await screen.findByRole("button", { name: "Restaurar y guardar" }));
    await screen.findByText("Guardado");
    const stored = await value.notes.get(note.id);
    expect(stored.content).toBe("uno!");
    expect(stored.deleted_at).toBeNull();
    expect(screen.queryByRole("button", { name: "Restaurar y guardar" })).toBeNull();
  });

  // RF-013
  it("con la ruta ocupada muestra el mensaje y el borrador queda intacto", async () => {
    const { tree, rerender, value, note, trash } = await openTrashable();
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Editor visual" }), "!");
    await trash();
    await value.notes.create(VAULT, "Primera"); // otra nota ocupa la ruta
    rerender(tree(1));
    await userEvent.click(await screen.findByRole("button", { name: "Restaurar y guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ya hay una nota con esa ruta");
    expect(screen.getByRole("textbox", { name: "Editor visual" })).toHaveValue("uno!");
    expect((await value.notes.list(VAULT, { deleted: true })).map((n) => n.id)).toEqual([note.id]);
  });

  // RF-013
  it("al reaparecer la nota desaparece el aviso 'no existe'", async () => {
    const { tree, rerender, value, note, trash } = await openTrashable();
    const trashed = await trash();
    rerender(tree(1));
    expect(await screen.findByText("La nota ya no existe.")).toBeInTheDocument();
    await value.notes.restore(note.id, trashed.rev);
    rerender(tree(2));
    await screen.findByRole("heading", { name: "Primera" });
    expect(screen.queryByText("La nota ya no existe.")).toBeNull();
  });
});

describe("conflicto y cambios de otros (RF-009 aviso)", () => {
  // RF-009
  it("avisa con enlace a /conflicts si la nota abierta está en conflicto", async () => {
    const db = memoryDb();
    const { value } = syncValue({}, db);
    const note = await value.notes.create(VAULT, "Primera");
    const conflict: NoteConflict = {
      kind: "note",
      id: note.id,
      winner: { rev: "2-a", doc: {} as NoteConflict["winner"]["doc"] },
      loser: { rev: "2-b", doc: {} as NoteConflict["loser"]["doc"] },
    };
    render(
      <DataMemoryRouter>
        <WithSync value={{ ...value, conflicts: [conflict] }}>
          <NoteEditor noteId={note.id} views={views} />
        </WithSync>
      </DataMemoryRouter>,
    );
    const link = await screen.findByRole("link", { name: /conflictos/i });
    expect(link).toHaveAttribute("href", "/conflicts");
  });

  // RF-007
  it("sin cambios locales, un cambio remoto de la nota se refleja al cambiar notesVersion", async () => {
    const db = memoryDb();
    const { value } = syncValue({}, db);
    const note = await value.notes.create(VAULT, "Primera");
    const tree = (version: number) => (
      <DataMemoryRouter>
        <WithSync value={{ ...value, notesVersion: version }}>
          <NoteEditor noteId={note.id} views={views} />
        </WithSync>
      </DataMemoryRouter>
    );
    const { rerender } = render(tree(0));
    await screen.findByRole("heading", { name: "Primera" });
    const stored = await value.notes.get(note.id);
    await createNoteStore(db).save(note.id, "desde otro dispositivo", stored.rev);
    rerender(tree(1));
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Contenido de la nota" })).toHaveValue("desde otro dispositivo"),
    );
  });
});

describe("con los editores reales (Milkdown y CodeMirror)", () => {
  /** Markdown que `remark-stringify` reformatearía (viñetas `*`, énfasis `_`, línea final): si algo reserializa, se nota. */
  const ORIGINAL = "# Título\n\n* uno\n* dos\n\nUn *énfasis* y _otro_.\n\n\n\nFin";

  async function openReal(content: string) {
    const db = memoryDb();
    const { value } = syncValue({}, db);
    const note = await value.notes.create(VAULT, "Real");
    await value.notes.save(note.id, content, note.rev);
    render(
      <DataMemoryRouter>
        <WithSync value={value}>
          <NoteEditor noteId={note.id} editOnOpen />
        </WithSync>
      </DataMemoryRouter>,
    );
    await screen.findByRole("heading", { name: "Real" });
    return { value, note };
  }

  /** El texto que tiene CodeMirror ahora mismo. */
  function codeText(): string {
    const dom = document.querySelector(".cm-editor") as HTMLElement;
    return EditorView.findFromDOM(dom)!.state.doc.toString();
  }

  // RF-008
  it("Visual → Código → Visual sin editar deja el markdown idéntico byte a byte", async () => {
    const { value, note } = await openReal(ORIGINAL);
    await waitFor(() => expect(document.querySelector(".ProseMirror h1")).toHaveTextContent("Título"));
    await userEvent.click(screen.getByRole("button", { name: "Código" }));
    expect(codeText()).toBe(ORIGINAL);
    await userEvent.click(screen.getByRole("button", { name: "Visual" }));
    await waitFor(() => expect(document.querySelector(".ProseMirror h1")).toHaveTextContent("Título"));
    await userEvent.click(screen.getByRole("button", { name: "Código" }));
    expect(codeText()).toBe(ORIGINAL);
    // Nada que guardar: el borrador nunca cambió y el almacén sigue con el original.
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    expect((await value.notes.get(note.id)).content).toBe(ORIGINAL);
  });

  // RF-008
  it("una edición en Código aparece en Visual", async () => {
    await openReal("hola");
    await userEvent.click(screen.getByRole("button", { name: "Código" }));
    const view = EditorView.findFromDOM(document.querySelector(".cm-editor") as HTMLElement)!;
    act(() => view.dispatch({ changes: { from: 4, insert: " mundo" } }));
    expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Visual" }));
    await waitFor(() => expect(document.querySelector(".ProseMirror")).toHaveTextContent("hola mundo"));
  });
});
