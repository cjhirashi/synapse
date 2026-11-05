// H-030b: plantillas en el almacén local (crear plantilla, crear nota desde ella, plantilla en uso).
import PouchDB from "pouchdb-browser";
import memory from "pouchdb-adapter-memory";
import { NoteValidationError, TemplateInUseError, createNoteStore, type NoteStore } from "./noteStore";

PouchDB.plugin(memory);

const VAULT = "11111111-1111-4111-8111-111111111111";
let counter = 0;
let store: NoteStore;

beforeEach(() => {
  counter += 1;
  store = createNoteStore(new PouchDB(`notestore-tpl-${counter}`, { adapter: "memory" }), { indexes: false });
});

test("createTemplate crea PLANTILLAS/plantilla-<nombre>.md con una definición válida y alcance de toda la bóveda", async () => {
  const note = await store.createTemplate(VAULT, "Acta de Reunión");
  expect(note.path).toBe("PLANTILLAS/plantilla-acta-de-reunion.md");
  expect(note.frontmatter).toMatchObject({ titulo: "Acta de Reunión", alcance: ["*"], atributos: [], estilo: { publicar: {}, pdf: {} } });
  await expect(store.createTemplate(VAULT, "   ")).rejects.toBeInstanceOf(NoteValidationError);
});

test("una nota nace de una plantilla con su cuerpo, sus atributos (los sin valor, vacíos) y plantilla: <nombre>", async () => {
  const note = await store.create(VAULT, "Reunión lunes", "Proyectos", {
    name: "acta",
    content: "# Asistentes\n\n# Acuerdos\n",
    atributos: [
      { nombre: "cliente", tipo: "texto" },
      { nombre: "prioridad", tipo: "numero", valor: 2 },
      { nombre: "invitados", tipo: "lista" },
      { nombre: "fecha_limite", tipo: "fecha" },
    ],
  });
  expect(note.path).toBe("Proyectos/Reunión lunes.md");
  expect(note.content).toBe("# Asistentes\n\n# Acuerdos\n");
  expect(note.frontmatter).toMatchObject({ plantilla: "acta", cliente: "", prioridad: 2, invitados: [] });
  expect(note.frontmatter).not.toHaveProperty("fecha_limite");
});

test("una plantilla en uso no se borra ni se renombra; sin usuarios, sí", async () => {
  const template = await store.createTemplate(VAULT, "Acta");
  const doc = await store.create(VAULT, "Reunión", "", { name: "acta", content: "", atributos: [] });
  await expect(store.softDelete(template.id, template.rev)).rejects.toBeInstanceOf(TemplateInUseError);
  await expect(store.rename(template.id, "PLANTILLAS/plantilla-otra", template.rev)).rejects.toBeInstanceOf(TemplateInUseError);
  await store.save(doc.id, "", doc.rev, { titulo: "Reunión" }); // el documento deja de citarla
  await expect(store.softDelete(template.id, template.rev)).resolves.toMatchObject({ deleted_at: expect.any(String) });
});
