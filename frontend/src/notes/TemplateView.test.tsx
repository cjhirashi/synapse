// H-030b: formulario de una plantilla (dónde se usa, atributos, diseño del PDF, estructura).
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PouchDB from "pouchdb-browser";
import memory from "pouchdb-adapter-memory";
import TemplateView from "./TemplateView";
import * as uploadFile from "../files/uploadFile";
import { createNoteStore } from "./noteStore";

import { afterEach, beforeEach, expect, test, vi } from "vitest";

PouchDB.plugin(memory);

beforeEach(() => {
  vi.spyOn(uploadFile, "listVaultFiles").mockResolvedValue([
    { id: "img-1", name: "logo.png", content_type: "image/png" } as uploadFile.VaultFile,
    { id: "doc-1", name: "manual.pdf", content_type: "application/pdf" } as uploadFile.VaultFile,
  ]);
});
afterEach(() => vi.restoreAllMocks());

const VAULT = "11111111-1111-4111-8111-111111111111";
let counter = 0;

async function open() {
  counter += 1;
  const store = createNoteStore(new PouchDB(`tplview-${counter}`, { adapter: "memory" }), { indexes: false });
  await store.create(VAULT, "Proyectos/Notas");
  const template = await store.createTemplate(VAULT, "Acta");
  render(<TemplateView noteId={template.id} vault={{ id: VAULT, name: "Bóveda" }} notes={store} notesVersion={0} />);
  await screen.findByRole("heading", { name: "Plantilla acta" });
  return { store, template, user: userEvent.setup() };
}

test("muestra las cuatro secciones y deja el diseño del PDF apagado", async () => {
  await open();
  for (const title of ["Dónde se usa", "Atributos opcionales", "Diseño del PDF", "Estructura base"]) {
    expect(screen.getByRole("heading", { level: 3, name: title })).toBeInTheDocument();
  }
  expect(screen.getByRole("radio", { name: "En toda la bóveda" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: /Permitir descargar/ })).not.toBeChecked();
  expect(screen.getByRole("combobox", { name: "Tamaño" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Guardar plantilla" })).toBeDisabled();
});

test("guarda alcance por carpetas, un atributo con valor inicial y la estructura base", async () => {
  const { store, template, user } = await open();
  await user.click(screen.getByRole("radio", { name: "Solo en estas carpetas" }));
  await user.click(await screen.findByRole("checkbox", { name: "Proyectos" }));
  await user.click(screen.getByRole("button", { name: "Añadir atributo" }));
  await user.type(screen.getByLabelText("Nombre del atributo 1"), "cliente");
  await user.type(screen.getByLabelText("Valor inicial del atributo 1"), "Acme");
  await user.clear(screen.getByLabelText(/Markdown con el que nace/));
  await user.type(screen.getByLabelText(/Markdown con el que nace/), "# Acuerdos");
  await user.click(screen.getByRole("button", { name: "Guardar plantilla" }));
  await waitFor(async () => expect((await store.get(template.id)).content).toBe("# Acuerdos"));
  const saved = await store.get(template.id);
  expect(saved.frontmatter).toMatchObject({
    alcance: ["Proyectos"], atributos: [{ nombre: "cliente", tipo: "texto", valor: "Acme" }], estilo: { publicar: {}, pdf: {} },
  });
});

test("una definición inválida (nombre de atributo con mayúsculas) no se guarda y explica el motivo", async () => {
  const { store, template, user } = await open();
  await user.click(screen.getByRole("button", { name: "Añadir atributo" }));
  await user.type(screen.getByLabelText("Nombre del atributo 1"), "Cliente");
  await user.click(screen.getByRole("button", { name: "Guardar plantilla" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/atributos/i);
  expect((await store.get(template.id)).frontmatter.atributos).toEqual([]);
});

test("activar el PDF y diseñarlo guarda estilo.pdf completo, con campos especiales y la imagen elegida", async () => {
  const { store, template, user } = await open();
  await user.click(screen.getByRole("button", { name: "Añadir atributo" }));
  await user.type(screen.getByLabelText("Nombre del atributo 1"), "cliente");
  await user.click(screen.getByRole("checkbox", { name: /Permitir descargar/ }));
  await user.selectOptions(screen.getByRole("combobox", { name: "Tamaño" }), "a4");
  const header = screen.getByRole("group", { name: "Encabezado de página" });
  await user.selectOptions(await within(header).findByRole("combobox", { name: /Imagen de fondo/ }), "img-1");
  await waitFor(() => expect(within(header).getByRole("option", { name: "logo.png" })).toBeInTheDocument());
  await user.click(screen.getByLabelText("Encabezado de página, izquierda"));
  await user.click(within(header).getByRole("button", { name: "Título" }));
  await user.selectOptions(within(header).getByRole("combobox", { name: "Insertar un atributo" }), "cliente");
  await user.click(screen.getByRole("checkbox", { name: /Imprimir los atributos/ }));
  await user.click(screen.getByRole("button", { name: "Guardar plantilla" }));
  await waitFor(async () => expect(((await store.get(template.id)).frontmatter.estilo as { pdf: object }).pdf).not.toEqual({}));
  const pdf = ((await store.get(template.id)).frontmatter.estilo as { pdf: Record<string, unknown> }).pdf;
  expect(pdf).toMatchObject({
    activo: true, incluir_atributos: true, pagina: { tamano: "a4", margenes_mm: { superior: 25 } },
    encabezado: { imagen: "img-1", izquierda: "{{titulo}}{{atributo:cliente}}" },
    pie: { derecha: "Página {{pagina}} de {{paginas}}" },
  });
});

test("un campo especial desconocido en el encabezado no se guarda y explica el motivo", async () => {
  const { store, template, user } = await open();
  await user.click(screen.getByRole("checkbox", { name: /Permitir descargar/ }));
  await user.type(screen.getByLabelText("Pie de página, centro"), "{{{{usuario}}");
  await user.click(screen.getByRole("button", { name: "Guardar plantilla" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect((await store.get(template.id)).frontmatter.estilo).toEqual({ publicar: {}, pdf: {} });
});

test("una plantilla con PDF guardado lo muestra encendido con sus valores", async () => {
  counter += 1;
  const store = createNoteStore(new PouchDB(`tplview-${counter}`, { adapter: "memory" }), { indexes: false });
  const template = await store.createTemplate(VAULT, "Acta");
  await store.save(template.id, template.content, template.rev, { ...template.frontmatter, estilo: { publicar: {}, pdf: { activo: true, pagina: { tamano: "a4" }, texto: { familia: "Liberation Mono", tamano_pt: 9 } } } });
  render(<TemplateView noteId={template.id} vault={{ id: VAULT, name: "Bóveda" }} notes={store} notesVersion={0} />);
  await screen.findByRole("heading", { name: "Plantilla acta" });
  await waitFor(() => expect(screen.getByRole("checkbox", { name: /Permitir descargar/ })).toBeChecked());
  expect(screen.getByRole("combobox", { name: "Tamaño" })).toHaveValue("a4");
  expect(screen.getByRole("group", { name: "Texto" })).toHaveTextContent("Liberation Mono");
});

test("la imagen del encabezado indica las medidas de la hoja elegida y el pie no tiene imagen", async () => {
  const { user } = await open();
  await user.click(screen.getByRole("checkbox", { name: /Permitir descargar/ }));
  const header = screen.getByRole("group", { name: "Encabezado de página" });
  expect(within(header).getByRole("combobox", { name: /816 × 1056 px/ })).toBeInTheDocument(); // Carta por omisión
  expect(header).toHaveTextContent("816 px en Carta");
  await user.selectOptions(screen.getByRole("combobox", { name: "Tamaño" }), "a4");
  expect(within(header).getByRole("combobox", { name: /794 × 1123 px/ })).toBeInTheDocument();
  expect(header).toHaveTextContent("794 px en A4");
  const footer = screen.getByRole("group", { name: "Pie de página" });
  expect(within(footer).queryByRole("combobox", { name: /Imagen/ })).toBeNull();
});

test("guardar no escribe imagen en el pie", async () => {
  const { store, template, user } = await open();
  await user.click(screen.getByRole("checkbox", { name: /Permitir descargar/ }));
  await user.click(screen.getByRole("button", { name: "Guardar plantilla" }));
  await waitFor(async () => expect(((await store.get(template.id)).frontmatter.estilo as { pdf: object }).pdf).not.toEqual({}));
  const pdf = ((await store.get(template.id)).frontmatter.estilo as { pdf: { pie: Record<string, unknown> } }).pdf;
  expect(Object.keys(pdf.pie).sort()).toEqual(["centro", "derecha", "izquierda"]);
});

test("la vista previa refleja el tamaño de hoja, los textos con valores de ejemplo y el fondo elegido", async () => {
  const { user } = await open();
  await user.click(screen.getByRole("checkbox", { name: /Permitir descargar/ }));
  const preview = screen.getByRole("figure", { name: "Vista previa de la hoja" });
  expect(preview).toHaveTextContent("Carta · 816 × 1056 px");
  expect(screen.queryByTestId("pdf-preview-bg")).toBeNull();
  await user.selectOptions(screen.getByRole("combobox", { name: "Tamaño" }), "a4");
  expect(preview).toHaveTextContent("A4 · 794 × 1123 px");
  const header = screen.getByRole("group", { name: "Encabezado de página" });
  await user.type(screen.getByLabelText("Encabezado de página, izquierda"), "{{{{titulo}} · {{{{atributo:cliente}}");
  expect(preview).toHaveTextContent("Título del documento · ‹cliente›");
  expect(preview).toHaveTextContent("Página 1 de 3"); // el pie de la plantilla nueva
  await user.selectOptions(await within(header).findByRole("combobox", { name: /Imagen de fondo/ }), "img-1");
  expect(screen.getByTestId("pdf-preview-bg")).toHaveStyle({ backgroundImage: 'url("/files/img-1")' });
});

test("el atributo se puede quitar con su botón y la tabla vuelve a su estado vacío", async () => {
  const { user } = await open();
  expect(screen.getByText("Esta plantilla no añade atributos propios.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Añadir atributo" }));
  await user.type(screen.getByLabelText("Nombre del atributo 1"), "cliente");
  await user.click(screen.getByRole("button", { name: "Quitar el atributo 1" }));
  expect(screen.getByText("Esta plantilla no añade atributos propios.")).toBeInTheDocument();
  expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();
});
