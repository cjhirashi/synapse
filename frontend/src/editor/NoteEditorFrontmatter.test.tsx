// Sesión de edición D1 (SPEC-0010 RF-012, RF-014, RF-016, RF-020, RF-021; PLAN-0010 §2.1, §6):
// en Visual se editan `body` (markdown) y `props` (la sección META); en Código se edita SOLO el cuerpo
// (H-029: las propiedades no se mezclan con el texto como YAML). Alternar no pierde nada; guardar escribe
// `content` y `frontmatter` juntos. Vistas falsas (textarea) + la `NoteMeta` real que monta el editor.
import { type ComponentProps } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
const titleField = () => screen.getByLabelText("Título");
/** El almacén sella `fecha_creacion` y `fecha_actualizacion` al guardar (H-029): se comparan aparte. */
const noDates = (fm: Record<string, unknown>) => Object.fromEntries(Object.entries(fm).filter(([key]) => !key.startsWith("fecha_")));
const isDate = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

describe("sesión de edición D1 (RF-012, RF-014, RF-016, RF-020, RF-021)", () => {
  it("Visual muestra el body y la sección META; Código muestra SOLO el cuerpo, sin YAML", async () => {
    await setup("# Cuerpo\n", { titulo: "Plan", n: 3 });
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(visual()).toHaveValue("# Cuerpo\n");
    expect(titleField()).toHaveValue("Plan");
    expect(screen.getByLabelText("Clave de la propiedad 1")).toHaveValue("n");
    await userEvent.click(screen.getByRole("button", { name: "Código" }));
    expect(code()).toHaveValue("# Cuerpo\n");
    expect(titleField()).toHaveValue("Plan"); // la sección META sigue arriba en Código
  });

  it("abrir en Código y guardar sin cambios deja frontmatter y content idénticos (complejos)", async () => {
    const fm = { título: "X", obj: { a: 1 }, mix: [1, "a"], b: true };
    const { value, note } = await setup("# Cuerpo\n", fm);
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.click(screen.getByRole("button", { name: "Código" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    const reloaded = await value.notes.get(note.id);
    expect(reloaded.frontmatter).toEqual(note.frontmatter); // sin cambios reales no se toca ni una clave
    expect(noDates(reloaded.frontmatter)).toEqual(fm);
    expect(reloaded.content).toBe("# Cuerpo\n");
  });

  it("guardar desde Visual sólo cambia el frontmatter por el formulario", async () => {
    const { value, note } = await setup("# Cuerpo\n", { a: "x" });
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.type(propValue("a"), "y"); // "x" → "xy"
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    const reloaded = await value.notes.get(note.id);
    expect(noDates(reloaded.frontmatter)).toEqual({ a: "xy" });
    expect(isDate(reloaded.frontmatter.fecha_actualizacion)).toBe(true); // guardar un cambio sella la fecha
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

  it("Código ya no interpreta YAML: un bloque `---` escrito en Código es cuerpo y las propiedades no cambian", async () => {
    const { value, note } = await setup("# B\n", { a: 1 });
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.click(screen.getByRole("button", { name: "Código" }));
    fireEvent.change(code(), { target: { value: "---\na: 1\na: 2\n---\n# B\n" } }); // antes: YAML inválido; ahora es texto
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.queryByRole("button", { name: /Ir a la línea/ })).toBeNull();
    const reloaded = await value.notes.get(note.id);
    expect(reloaded.content).toBe("---\na: 1\na: 2\n---\n# B\n");
    expect(noDates(reloaded.frontmatter)).toEqual({ a: 1 });
  });

  it("editar una propiedad en META estando en Código se guarda junto al cuerpo", async () => {
    const { value, note } = await setup("# B\n", { a: "x" });
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.click(screen.getByRole("button", { name: "Código" }));
    fireEvent.change(code(), { target: { value: "# Otro\n" } });
    await userEvent.type(propValue("a"), "y");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    const reloaded = await value.notes.get(note.id);
    expect(reloaded.content).toBe("# Otro\n");
    expect(noDates(reloaded.frontmatter)).toEqual({ a: "xy" });
  });

  it("guardar con propiedades > 64 KiB avisa con los KiB y no guarda (RF-019)", async () => {
    const { value, note } = await setup("# B\n", { a: "x" });
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.change(propValue("a"), { target: { value: "x".repeat(70 * 1024) } });
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/KiB/);
    expect(screen.getByRole("alert")).toHaveTextContent(/64/);
    expect((await value.notes.get(note.id)).frontmatter).toEqual(note.frontmatter);
  });

  it("migrate (RF-044): abrir en edición una nota con YAML heredado lo trata como propiedades y avisa antes de guardar", async () => {
    await setup("---\ntitulo: X\n---\n# B\n", {});
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(await screen.findByLabelText("Título")).toHaveValue("X");
    expect(visual()).toHaveValue("# B\n"); // el bloque salió del cuerpo en la sesión
    expect(screen.getByText(/se moverán/i)).toBeInTheDocument(); // aviso previo (P-5)
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled(); // Guardar habilitado sin editar
  });

  it("migrate: guardar mueve el bloque a frontmatter, lo quita del content y avisa «se movieron»", async () => {
    const { value, note } = await setup("---\ntitulo: X\n---\n# B\n", {});
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await screen.findByLabelText("Título");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    const reloaded = await value.notes.get(note.id);
    expect(noDates(reloaded.frontmatter)).toEqual({ titulo: "X" });
    expect(reloaded.content).toBe("# B\n");
    expect(screen.getByText(/se movieron fuera/i)).toBeInTheDocument();
  });

  it("migrate: salir sin guardar no cambia la nota (RF-044)", async () => {
    const { value, note } = await setup("---\ntitulo: X\n---\n# B\n", {});
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await screen.findByLabelText("Título");
    const reloaded = await value.notes.get(note.id); // no se guardó nada
    expect(noDates(reloaded.frontmatter)).toEqual({});
    expect(reloaded.content).toBe("---\ntitulo: X\n---\n# B\n");
  });

  it("looks-yaml (RF-045): con frontmatter ya presente, el bloque queda como cuerpo protegido y avisa en Visual", async () => {
    const { value, note } = await setup("---\nb: 2\n---\nBody", { a: 1 });
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByText(/parece YAML/i)).toBeInTheDocument();
    expect(visual()).toHaveValue("Body"); // el bloque protegido no se muestra en el editor
    expect((await value.notes.get(note.id)).content).toBe("---\nb: 2\n---\nBody"); // intacto
  });

  it("RF-008: una nota con ruta inválida se abre, se lee y avisa de «Renombrar»", async () => {
    const db = memoryDb();
    const { value } = syncValue({}, db);
    const id = `note:${VAULT}:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee`;
    await db.put({ _id: id, type: "note", vault_id: VAULT, path: "X/.md", frontmatter: {}, content: "# Rota\n", created_at: "2026-10-25T00:00:00.000000Z", updated_at: "2026-10-25T00:00:00.000000Z", deleted_at: null });
    const onRename = vi.fn();
    render(
      <DataMemoryRouter>
        <WithSync value={value}>
          <NoteEditor noteId={id} views={views} onRename={onRename} />
        </WithSync>
      </DataMemoryRouter>,
    );
    // Se abre y se lee (el contenido está disponible), pero avisa de que la ruta no es válida.
    expect(await screen.findByRole("textbox", { name: "Contenido de la nota" })).toHaveValue("# Rota\n");
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent(/ruta de esta nota no es válida/i);
    await userEvent.click(within(alerta).getByRole("button", { name: "Renombrar" }));
    expect(onRename).toHaveBeenCalled();
  });

  it("alternar Visual↔Código sin guardar conserva el body editado y el cambio de propiedad", async () => {
    await setup("# Cuerpo\n", { a: "x" });
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.clear(visual());
    await userEvent.type(visual(), "# Nuevo\n");
    await userEvent.type(propValue("a"), "y"); // "xy"
    await userEvent.click(screen.getByRole("button", { name: "Código" }));
    expect(code()).toHaveValue("# Nuevo\n");
    await userEvent.click(screen.getByRole("button", { name: "Visual" }));
    expect(visual()).toHaveValue("# Nuevo\n");
    expect(propValue("a")).toHaveValue("xy");
  });
});

// Converge 1 (UX-H2, UX-H4): los avisos de YAML heredado usan `Notice` con los textos del plan, y en lectura el bloque
// heredado se muestra literal (P-6: igual que el protegido en Visual), no como regla horizontal + negrita.
describe("avisos y lectura del YAML heredado (UX-H2, UX-H4)", () => {
  it("migrate: el aviso previo es un Notice informativo con el texto del plan («panel de propiedades»)", async () => {
    await setup("---\ntitulo: X\n---\n# B\n", {});
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    const notice = await screen.findByText(/Se moverán al panel de propiedades cuando guardes/);
    const box = notice.closest(".note-editor-notice") as HTMLElement;
    expect(box).toHaveClass("note-notice-info");
    expect(box).toHaveAttribute("role", "status");
    expect(box.querySelector("svg")).not.toBeNull();
    expect(screen.queryByText(/metadatos/i)).toBeNull();
  });

  it("migrate: tras guardar el aviso es persistente con «Cerrar aviso»", async () => {
    await setup("---\ntitulo: X\n---\n# B\n", {});
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await screen.findByLabelText("Título");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    const notice = await screen.findByText(/Ahora están en el panel de propiedades/);
    expect(notice.closest(".note-editor-notice")).toHaveClass("note-notice-info");
    await userEvent.click(screen.getByRole("button", { name: "Cerrar aviso" }));
    expect(screen.queryByText(/Ahora están en el panel de propiedades/)).toBeNull();
  });

  it("looks-yaml: aviso de advertencia con el texto del plan y el bloque literal", async () => {
    await setup("---\nb: 2\n---\nBody", { a: 1 });
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    const notice = screen.getByText(/pero no se trata como propiedades\. Edítalo en Código si quieres convertirlo/);
    const box = notice.closest(".note-editor-notice") as HTMLElement;
    expect(box).toHaveClass("note-notice-warning");
    expect(box.querySelector("pre.note-editor-legacy-block")).toHaveTextContent("b: 2");
  });

  it("lectura: el YAML heredado se muestra literal (mono) y el cuerpo va aparte, sin el bloque", async () => {
    const { container } = await setup("---\ntitulo: X\n---\n# B\n", {});
    const block = container.querySelector("pre.note-editor-legacy-block") as HTMLElement;
    expect(block).toHaveTextContent("titulo: X");
    expect(screen.getByRole("textbox", { name: "Contenido de la nota" })).toHaveValue("# B\n");
  });

  it("lectura: un `---` que no es YAML (regla horizontal) se deja como está", async () => {
    const { container } = await setup("---\n\ntexto\n", {});
    expect(container.querySelector("pre.note-editor-legacy-block")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Contenido de la nota" })).toHaveValue("---\n\ntexto\n");
  });
});

