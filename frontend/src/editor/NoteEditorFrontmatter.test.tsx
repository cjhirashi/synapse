// Sesión de edición D1 (SPEC-0010 RF-012, RF-014, RF-016, RF-020, RF-021; PLAN-0010 §2.1, §6):
// en Visual se editan `body` (markdown) y `props` (el formulario de propiedades); en Código la verdad
// es el texto compuesto `---\nYAML\n---\nbody`. Alternar no pierde nada; guardar escribe `content` y
// `frontmatter` juntos. Vistas falsas (textarea) + el `PropertiesForm` real que monta el editor.
import { type ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DataMemoryRouter } from "../test-utils/router";
import { memoryDb, syncValue, WithSync } from "../test-utils/sync";
import type { SyncContextValue } from "../sync/useSync";
import NoteEditor, { type NoteEditorViews, type ViewProps } from "./NoteEditor";

const VAULT = "11111111-1111-4111-8111-111111111111";

function fake(kind: string) {
  return function Fake({ value, onChange, label, readOnly }: ViewProps) {
    return <textarea aria-label={label} data-kind={kind} readOnly={readOnly} value={value} onChange={(e) => onChange(e.target.value)} />;
  };
}
const views: NoteEditorViews = { Visual: fake("visual"), Code: fake("code") };

async function setup(content: string, frontmatter: Record<string, unknown>, extra: Partial<SyncContextValue> = {}, editorProps: Partial<ComponentProps<typeof NoteEditor>> = {}) {
  const db = memoryDb();
  const { value } = syncValue(extra, db);
  const note = await value.notes.create(VAULT, "Nota");
  const saved = await value.notes.save(note.id, content, note.rev, frontmatter);
  function ui(noteId: string, editOnOpen = false) {
    return (
      <DataMemoryRouter>
        <WithSync value={value}>
          <NoteEditor noteId={noteId} editOnOpen={editOnOpen} views={views} {...editorProps} />
        </WithSync>
      </DataMemoryRouter>
    );
  }
  const utils = render(ui(saved.id));
  await screen.findByRole("heading", { name: "Nota" });
  return { ...utils, ui, value, note: saved };
}

const visual = () => screen.getByRole("textbox", { name: "Editor visual" });
const code = () => screen.getByRole("textbox", { name: "Editor de código" });
const propValue = (key: string) => screen.getByRole("textbox", { name: `Valor de «${key}»` });

describe("sesión de edición D1 (RF-012, RF-014, RF-016, RF-020, RF-021)", () => {
  it("Visual muestra el body y el formulario; Código muestra el texto compuesto", async () => {
    await setup("# Cuerpo\n", { titulo: "Plan", n: 3 });
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(visual()).toHaveValue("# Cuerpo\n");
    expect(propValue("titulo")).toHaveValue("Plan");
    await userEvent.click(screen.getByRole("button", { name: "Código" }));
    expect(code()).toHaveValue("---\ntitulo: Plan\nn: 3\n---\n# Cuerpo\n");
  });

  it("abrir en Código y guardar sin cambios deja frontmatter y content idénticos (complejos)", async () => {
    const fm = { título: "X", obj: { a: 1 }, mix: [1, "a"], b: true };
    const { value, note } = await setup("# Cuerpo\n", fm);
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.click(screen.getByRole("button", { name: "Código" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    const reloaded = await value.notes.get(note.id);
    expect(reloaded.frontmatter).toEqual(fm);
    expect(reloaded.content).toBe("# Cuerpo\n");
  });

  it("guardar desde Visual sólo cambia el frontmatter por el formulario", async () => {
    const { value, note } = await setup("# Cuerpo\n", { a: "x" });
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.type(propValue("a"), "y"); // "x" → "xy"
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    const reloaded = await value.notes.get(note.id);
    expect(reloaded.frontmatter).toEqual({ a: "xy" });
    expect(reloaded.content).toBe("# Cuerpo\n");
  });

  it("cambiar una propiedad marca la nota como sucia (pregunta al abrir otra)", async () => {
    const { ui, value, rerender } = await setup("# Cuerpo\n", { a: "x" });
    const other = await value.notes.create(VAULT, "Otra");
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.type(propValue("a"), "y"); // sólo cambia una propiedad, no el body
    // El padre pide otra nota: con cambios sin guardar debe aparecer la confirmación (dirty por props).
    rerender(ui(other.id));
    expect(await screen.findByText("Esta nota tiene cambios sin guardar.")).toBeInTheDocument();
  });

  it("alternar Visual↔Código sin guardar conserva el body editado y el cambio de propiedad", async () => {
    await setup("# Cuerpo\n", { a: "x" });
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.clear(visual());
    await userEvent.type(visual(), "# Nuevo\n");
    await userEvent.type(propValue("a"), "y"); // "xy"
    await userEvent.click(screen.getByRole("button", { name: "Código" }));
    expect(code()).toHaveValue("---\na: xy\n---\n# Nuevo\n");
    await userEvent.click(screen.getByRole("button", { name: "Visual" }));
    expect(visual()).toHaveValue("# Nuevo\n");
    expect(propValue("a")).toHaveValue("xy");
  });
});
