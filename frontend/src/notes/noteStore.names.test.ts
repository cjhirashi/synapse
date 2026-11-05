// H-041 E2: el almacén local estructura el nombre de las skills y plantillas como el servidor y no renombra al mover carpetas.
import PouchDB from "pouchdb-browser";
import memory from "pouchdb-adapter-memory";
import { NoteValidationError, createNoteStore, type NoteStore } from "./noteStore";

PouchDB.plugin(memory);

const VAULT = "11111111-1111-4111-8111-111111111111";
let counter = 0;
let store: NoteStore;

beforeEach(() => {
  counter += 1;
  store = createNoteStore(new PouchDB(`notestore-names-${counter}`, { adapter: "memory" }), { indexes: false });
});

test("crear en AG - SKILLS estructura el nombre: «gestión de variables» → skill-gestion-de-variables", async () => {
  const note = await store.create(VAULT, "gestión de variables", "AG - SKILLS");
  expect(note.path).toBe("AG - SKILLS/skill-gestion-de-variables.md");
  expect((await store.create(VAULT, "Skill - Revisión Final.MD", "AG - SKILLS")).path).toBe("AG - SKILLS/skill-revision-final.md");
  // Sin título: también se estructura, y el siguiente libre se decide sobre el nombre final.
  expect((await store.create(VAULT, undefined, "AG - SKILLS")).path).toBe("AG - SKILLS/skill-sin-titulo.md");
  expect((await store.create(VAULT, undefined, "AG - SKILLS")).path).toBe("AG - SKILLS/skill-sin-titulo-2.md");
});

test("un nombre sin letras ni dígitos, una subcarpeta o un nombre demasiado largo se rechazan", async () => {
  await expect(store.create(VAULT, "漢字", "AG - SKILLS")).rejects.toBeInstanceOf(NoteValidationError);
  await expect(store.create(VAULT, "otra/skill", "AG - SKILLS")).rejects.toBeInstanceOf(NoteValidationError);
  await expect(store.create(VAULT, "a".repeat(59), "AG - SKILLS")).rejects.toBeInstanceOf(NoteValidationError);
  await expect(store.create(VAULT, "a".repeat(58), "AG - SKILLS")).resolves.toMatchObject({ path: `AG - SKILLS/skill-${"a".repeat(58)}.md` });
});

test("dos nombres que coinciden al normalizar chocan (no se les añade sufijo)", async () => {
  await store.create(VAULT, "Gestión de variables", "AG - SKILLS");
  await expect(store.create(VAULT, "gestion-de-variables", "AG - SKILLS")).rejects.toThrow();
});

test("renombrar o mover una nota hacia AG - SKILLS la estructura; sacarla no", async () => {
  const note = await store.create(VAULT, "Mi doc", "Notas");
  const moved = await store.rename(note.id, "AG - SKILLS/Mi doc", note.rev);
  expect(moved.path).toBe("AG - SKILLS/skill-mi-doc.md");
  const out = await store.rename(moved.id, "Notas/Libre Otra Vez", moved.rev);
  expect(out.path).toBe("Notas/Libre Otra Vez.md");
});

test("mover una carpeta hacia AG - SKILLS no renombra las notas: rechaza las que no son canónicas", async () => {
  await store.create(VAULT, "Mi doc", "Pendiente");
  await expect(store.moveFolder(VAULT, "Pendiente", "AG - SKILLS")).rejects.toBeInstanceOf(NoteValidationError);
  await store.create(VAULT, "skill-ok", "Listas");
  await store.renameFolder(VAULT, "Listas", "AG - SKILLS"); // se fusiona en la carpeta reservada, que es plana
  expect((await store.list(VAULT)).map((n) => n.path)).toContain("AG - SKILLS/skill-ok.md");
});

test("createTemplate usa la misma regla de nombre que el servidor", async () => {
  expect((await store.createTemplate(VAULT, "Ñandú Final")).path).toBe("PLANTILLAS/plantilla-nandu-final.md");
  await expect(store.createTemplate(VAULT, "a".repeat(65))).rejects.toBeInstanceOf(NoteValidationError);
});
