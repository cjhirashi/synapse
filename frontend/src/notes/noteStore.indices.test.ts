/** H-031: el almacén mantiene el INDICE de cada carpeta y protege sus reglas. */
import PouchDB from "pouchdb-core";
import memoryAdapter from "pouchdb-adapter-memory";
import { beforeEach, describe, expect, it } from "vitest";
import { createNoteStore, type NoteStore } from "./noteStore";
import { NoteValidationError } from "./errors";

PouchDB.plugin(memoryAdapter);

let counter = 0;
let tick: number;
let db: PouchDB.Database;
let store: NoteStore;
const V = "7d1c9a8e-0000-4000-8000-000000000001";

beforeEach(() => {
  counter += 1;
  tick = 0;
  db = new PouchDB(`noteindices-${counter}`, { adapter: "memory" });
  store = createNoteStore(db, { now: () => `2026-10-22T10:00:${String(++tick % 60).padStart(2, "0")}.000000Z` });
});

const paths = async () => (await store.list(V)).map((n) => n.path);
const find = async (path: string) => (await store.list(V)).find((n) => n.path === path)!;

describe("INDICES automáticos", () => {
  it("crear una nota crea el INDICE de su carpeta, de sus ancestros y de la raíz", async () => {
    await store.create(V, "Nota", "A/B");
    expect(await paths()).toEqual(["A/B/INDICE.md", "A/B/Nota.md", "A/INDICE.md", "INDICE.md"]);
  });

  it("un INDICE se crea una sola vez y sin cuerpo", async () => {
    await store.create(V, "Uno", "A");
    await store.create(V, "Dos", "A");
    expect((await paths()).filter((p) => p === "A/INDICE.md")).toHaveLength(1);
    const index = await store.get((await find("A/INDICE.md")).id);
    expect(index.content).toBe("");
  });

  it("crear una carpeta crea su INDICE sin ninguna nota más", async () => {
    await store.createFolder(V, "Nueva/Sub");
    expect(await paths()).toEqual(["INDICE.md", "Nueva/INDICE.md", "Nueva/Sub/INDICE.md"]);
  });

  it("ensureIndexes completa la raíz y las carpetas que ya tenían notas, y es idempotente", async () => {
    const legacy = createNoteStore(db, { indexes: false });
    await legacy.create(V, "Nota", "A");
    expect(await store.ensureIndexes(V)).toBe(2);
    expect(await store.ensureIndexes(V)).toBe(0);
    expect(await paths()).toEqual(["A/INDICE.md", "A/Nota.md", "INDICE.md"]);
  });

  it("el nombre reservado no se puede crear ni tomar al renombrar (en cualquier capitalización)", async () => {
    await expect(store.create(V, "indice")).rejects.toBeInstanceOf(NoteValidationError);
    const note = await store.create(V, "Nota", "A");
    await expect(store.rename(note.id, "A/Indice.md", note.rev)).rejects.toBeInstanceOf(NoteValidationError);
    expect(await paths()).toContain("A/Nota.md");
  });

  it("`ÍNDICE.md` con acento sigue siendo una nota normal", async () => {
    await store.create(V, "ÍNDICE", "A");
    expect(await paths()).toContain("A/ÍNDICE.md");
  });

  it("un INDICE no se renombra ni se mueve", async () => {
    await store.create(V, "Nota", "A");
    const index = await find("A/INDICE.md");
    await expect(store.rename(index.id, "B/INDICE.md", index.rev)).rejects.toBeInstanceOf(NoteValidationError);
  });

  it("mover la última nota de una carpeta ya no deja un «Sin título.md»: la carpeta sigue por su INDICE", async () => {
    const note = await store.create(V, "Nota", "A");
    await store.rename(note.id, "B/Nota.md", note.rev);
    expect(await paths()).toEqual(["A/INDICE.md", "B/INDICE.md", "B/Nota.md", "INDICE.md"]);
  });

  it("renombrar y mover una carpeta arrastra su INDICE y crea el del destino", async () => {
    await store.create(V, "Nota", "A");
    await store.renameFolder(V, "A", "Z");
    expect(await paths()).toEqual(["INDICE.md", "Z/INDICE.md", "Z/Nota.md"]);
    await store.createFolder(V, "Padre");
    await store.moveFolder(V, "Z", "Padre");
    expect(await paths()).toEqual(["INDICE.md", "Padre/INDICE.md", "Padre/Z/INDICE.md", "Padre/Z/Nota.md"]);
  });

  it("un INDICE sólo se borra solo con su carpeta vacía; el de la raíz, nunca", async () => {
    const note = await store.create(V, "Nota", "A");
    const index = await find("A/INDICE.md");
    await expect(store.softDelete(index.id, index.rev)).rejects.toBeInstanceOf(NoteValidationError);
    const root = await find("INDICE.md");
    await expect(store.softDelete(root.id, root.rev)).rejects.toBeInstanceOf(NoteValidationError);
    await store.softDelete(note.id, note.rev);
    expect(await paths()).toContain("A/INDICE.md"); // la carpeta sobrevive sin notas
    const fresh = await find("A/INDICE.md");
    await store.softDelete(fresh.id, fresh.rev);
    expect(await paths()).not.toContain("A/INDICE.md");
  });

  it("borrar una carpeta se lleva su INDICE", async () => {
    await store.create(V, "Nota", "A/B");
    await store.softDeleteFolder(V, "A");
    expect(await paths()).toEqual(["INDICE.md"]);
  });

  it("restaurar una nota recrea el INDICE de su carpeta si desapareció", async () => {
    const note = await store.create(V, "Nota", "A");
    await store.softDeleteFolder(V, "A");
    await store.restore(note.id, (await store.list(V, { deleted: true })).find((n) => n.id === note.id)!.rev);
    expect(await paths()).toEqual(["A/INDICE.md", "A/Nota.md", "INDICE.md"]);
  });

  it("un INDICE sólo guarda cambios en su `descripcion`", async () => {
    await store.create(V, "Nota", "A");
    const index = await find("A/INDICE.md");
    const doc = await store.get(index.id);
    const saved = await store.save(index.id, "", doc.rev, { ...doc.frontmatter, descripcion: "Texto" });
    expect(saved.frontmatter.descripcion).toBe("Texto");
    await expect(store.save(index.id, "# a mano", saved.rev, saved.frontmatter)).rejects.toBeInstanceOf(NoteValidationError);
    await expect(store.save(index.id, "", saved.rev, { ...saved.frontmatter, estado: "borrador" })).rejects.toBeInstanceOf(NoteValidationError);
  });
});

describe("H-042: el buzón entre agentes", () => {
  it("el cliente no crea INDICES dentro de AG - MENSAJES (los crea el servidor)", async () => {
    const now = "2026-11-05T10:00:00.000000Z";
    await db.put({
      _id: `note:${V}:00000000-0000-4000-8000-0000000000aa`, type: "note", vault_id: V,
      path: "AG - MENSAJES/aira → liza - x - 2026-11-05/001-de-aira.md", content: "hola", frontmatter: {},
      created_at: now, updated_at: now, deleted_at: null,
    } as never);
    await store.create(V, "Nota", "Otra");
    await store.ensureIndexes(V);
    const all = await paths();
    expect(all).toContain("Otra/INDICE.md");
    expect(all.filter((p) => p.startsWith("AG - MENSAJES") && p.endsWith("INDICE.md"))).toEqual([]);
  });

  it("la sesión del usuario no puede crear, mover ni borrar ahí", async () => {
    await expect(store.create(V, "001-de-aira", "AG - MENSAJES/aira → liza - x - 2026-11-05")).rejects.toBeInstanceOf(NoteValidationError);
    const note = await store.create(V, "Suelta", "Otra");
    await expect(store.rename(note.id, "AG - MENSAJES/aira → liza - x - 2026-11-05/001-de-aira.md", note.rev)).rejects.toBeInstanceOf(NoteValidationError);
  });
});
