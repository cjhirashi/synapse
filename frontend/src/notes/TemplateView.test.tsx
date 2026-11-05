// H-030b: formulario de una plantilla (dónde se usa, atributos, estilo reservado, estructura).
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PouchDB from "pouchdb-browser";
import memory from "pouchdb-adapter-memory";
import TemplateView from "./TemplateView";
import { createNoteStore } from "./noteStore";

PouchDB.plugin(memory);

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

test("muestra las cuatro secciones y deja el estilo reservado e inactivo", async () => {
  await open();
  for (const legend of ["1. Dónde se usa", "2. Atributos opcionales", "3. Estilo", "4. Estructura base"]) {
    expect(screen.getByText(legend)).toBeInTheDocument();
  }
  expect(screen.getByRole("radio", { name: "En toda la bóveda" })).toBeChecked();
  expect(screen.getByLabelText("Publicar en la web")).toBeDisabled();
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
