// H-041 E3: una skill nueva nace de un gestor (propietario) o archivada; el almacén local lo exige como el servidor.
import PouchDB from "pouchdb-browser";
import memory from "pouchdb-adapter-memory";
import { NoteValidationError, createNoteStore, type NoteStore } from "./noteStore";

PouchDB.plugin(memory);

const VAULT = "11111111-1111-4111-8111-111111111111";
let counter = 0;
let store: NoteStore;

beforeEach(() => {
  counter += 1;
  store = createNoteStore(new PouchDB(`notestore-skills-${counter}`, { adapter: "memory" }), { indexes: false });
});

test("con propietario, la skill nace activa de ese gestor; sin él, archivada y sin propietario", async () => {
  const owned = await store.create(VAULT, "Gestión de variables", "AG - SKILLS", undefined, { propietario: "aira" });
  expect(owned.path).toBe("AG - SKILLS/skill-gestion-de-variables.md");
  expect(owned.frontmatter).toMatchObject({ propietario: "aira" });
  expect(owned.frontmatter.estado).not.toBe("archivado");
  const orphan = await store.create(VAULT, "Sin dueño", "AG - SKILLS");
  expect(orphan.frontmatter).toMatchObject({ estado: "archivado" });
  expect(orphan.frontmatter).not.toHaveProperty("propietario");
  expect(orphan.frontmatter).not.toHaveProperty("agentes");
  // Un propietario vacío (lo que deja un atributo `texto` de plantilla sin valor) cuenta como ausente.
  const empty = await store.create(VAULT, "Vacío", "AG - SKILLS", { name: "skill", content: "", atributos: [{ nombre: "propietario", tipo: "texto" }, { nombre: "agentes", tipo: "lista", valor: [] }] });
  expect(empty.frontmatter).toMatchObject({ estado: "archivado", plantilla: "skill" });
  expect(empty.frontmatter).not.toHaveProperty("propietario");
});

test("una plantilla de skill con propietario y agentes da una skill válida", async () => {
  const note = await store.create(
    VAULT, "Revisión", "AG - SKILLS",
    { name: "skill", content: "# <Nombre>", atributos: [{ nombre: "propietario", tipo: "texto" }, { nombre: "agentes", tipo: "lista", valor: [] }, { nombre: "version", tipo: "texto", valor: "0.1.0" }] },
    { propietario: "emma" },
  );
  expect(note.frontmatter).toMatchObject({ propietario: "emma", agentes: [], version: "0.1.0", plantilla: "skill" });
});

test("metadatos incoherentes se rechazan antes de escribir", async () => {
  await expect(store.create(VAULT, "Mal", "AG - SKILLS", undefined, { propietario: "aira", agentes: ["aira"] })).rejects.toBeInstanceOf(NoteValidationError);
  await expect(store.create(VAULT, "Mal 2", "AG - SKILLS", undefined, { propietario: "Aira Mayúscula" })).rejects.toBeInstanceOf(NoteValidationError);
});

test("fuera de AG - SKILLS el seed solo añade metadatos y no impone propietario", async () => {
  const note = await store.create(VAULT, "Normal", "Notas", undefined, { etiqueta: "x" });
  expect(note.frontmatter).toMatchObject({ etiqueta: "x" });
  expect(note.frontmatter).not.toHaveProperty("estado", "archivado");
});
