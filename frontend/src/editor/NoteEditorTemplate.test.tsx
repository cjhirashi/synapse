// H-054: control «Plantilla» del documento — atributos de la plantilla, sin alta de atributos con plantilla y carga de la estructura.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DataMemoryRouter } from "../test-utils/router";
import { memoryDb, syncValue, WithSync } from "../test-utils/sync";
import NoteEditor, { type NoteEditorViews, type ViewProps } from "./NoteEditor";

const VAULT = "11111111-1111-4111-8111-111111111111";

function Visual({ value, readOnly }: ViewProps) {
  return <div className="milkdown-view" data-mode={readOnly ? "read" : "edit"}><p data-testid="body">{value}</p></div>;
}
const views: NoteEditorViews = { Visual, Code: Visual };

async function makeTemplate(value: ReturnType<typeof syncValue>["value"], name: string, content: string, alcance: string[], atributos: unknown[], estados: Array<{ nombre: string; color: string }> = []) {
  const created = await value.notes.createTemplate(VAULT, name);
  await value.notes.save(created.id, content, created.rev, { ...created.frontmatter, alcance, atributos, estados });
}

async function setup(body: string, frontmatter: Record<string, unknown> = {}) {
  const { value } = syncValue({}, memoryDb());
  await makeTemplate(value, "Acta", "# Asistentes\n", ["*"], [{ nombre: "cliente", tipo: "texto" }, { nombre: "prioridad", tipo: "numero" }]);
  await makeTemplate(value, "Informe", "# Resumen\n", ["*"], [{ nombre: "autor", tipo: "texto" }], [{ nombre: "borrador", color: "gris" }, { nombre: "aprobado", color: "verde" }]);
  await makeTemplate(value, "Solo ventas", "# Ventas\n", ["Ventas"], []);
  const note = await value.notes.create(VAULT, "Mi nota", "Proyectos");
  await value.notes.save(note.id, body, note.rev, { ...note.frontmatter, ...frontmatter });
  render(
    <DataMemoryRouter>
      <WithSync value={value}><NoteEditor noteId={note.id} views={views} editOnOpen /></WithSync>
    </DataMemoryRouter>,
  );
  await screen.findByRole("combobox", { name: "Plantilla" });
  return { note };
}

describe("control Plantilla", () => {
  it("solo ofrece las plantillas que cubren la carpeta del documento", async () => {
    await setup("");
    const options = screen.getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual(expect.arrayContaining(["Sin plantilla", "Acta", "Informe"]));
    expect(options).not.toContain("Solo ventas");
  });

  it("con el documento vacío carga la estructura y los atributos de la plantilla sin preguntar, y ya no deja añadir atributos", async () => {
    await setup("");
    expect(screen.getByRole("button", { name: "Añadir propiedad" })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Plantilla" }), "Acta");
    await waitFor(() => expect(screen.getByTestId("body")).toHaveTextContent("# Asistentes"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByLabelText("cliente")).toBeInTheDocument();
    expect(screen.getByLabelText("prioridad")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Añadir propiedad" })).toBeNull();
  });

  it("con contenido pregunta; «Conservar» deja el texto pero carga los atributos", async () => {
    await setup("Texto propio");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Plantilla" }), "Acta");
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("¿Quieres actualizar la estructura de contenido en el documento o prefieres conservar el contenido actual?");
    expect(dialog).toHaveTextContent("Si aceptas perderás el contenido actual del documento.");
    await userEvent.click(screen.getByRole("button", { name: "Conservar contenido actual" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByTestId("body")).toHaveTextContent("Texto propio");
    expect(screen.getByLabelText("cliente")).toBeInTheDocument();
  });

  it("con contenido, «Actualizar» reemplaza el texto por la estructura de la plantilla", async () => {
    await setup("Texto propio");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Plantilla" }), "Informe");
    await userEvent.click(await screen.findByRole("button", { name: "Actualizar estructura" }));
    await waitFor(() => expect(screen.getByTestId("body")).toHaveTextContent("# Resumen"));
  });

  it("los atributos opcionales se ocultan con plantilla y reaparecen al quitarla", async () => {
    await setup("", { nota_extra: "hola" });
    expect(screen.getByDisplayValue("hola")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Plantilla" }), "Acta");
    await waitFor(() => expect(screen.queryByDisplayValue("hola")).toBeNull());
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Plantilla" }), "");
    expect(await screen.findByDisplayValue("hola")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Añadir propiedad" })).toBeInTheDocument();
  });

  it("con plantilla el documento solo tiene los estados de la plantilla, sin crear otros (H-054)", async () => {
    await setup("");
    const estado = () => screen.getAllByRole("combobox", { name: "Estado" })[0];
    expect(screen.getByRole("option", { name: "Otro estado…" })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Plantilla" }), "Informe");
    await waitFor(() => expect(screen.queryByRole("option", { name: "Otro estado…" })).toBeNull());
    expect(within(estado()).getAllByRole("option").map((o) => o.textContent)).toEqual(["Sin estado", "borrador", "aprobado"]);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Plantilla" }), "Acta");
    // «Acta» no trae estados de serie: el documento no tiene estado que elegir.
    await waitFor(() => expect(within(estado()).getAllByRole("option").map((o) => o.textContent)).toEqual(["Sin estado"]));
  });

  it("al asignar una plantilla que no tiene el estado del documento, el estado queda vacío; si lo tiene, se conserva (H-054)", async () => {
    await setup("", { estado: "aprobado" });
    const estado = () => screen.getAllByRole("combobox", { name: "Estado" })[0];
    expect(estado()).toHaveValue("aprobado");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Plantilla" }), "Informe");
    await waitFor(() => expect(screen.getByRole("option", { name: "borrador" })).toBeInTheDocument());
    expect(estado()).toHaveValue("aprobado");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Plantilla" }), "Acta");
    await waitFor(() => expect(estado()).toHaveValue(""));
  });
});
