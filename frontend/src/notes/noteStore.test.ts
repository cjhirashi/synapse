// Operaciones de la UI sobre las notas de la réplica local (SPEC-0008 RF-003, RF-010…RF-013,
// RF-016, RF-017; PLAN-0008 §2.6).
import PouchDB from "pouchdb-browser";
import memory from "pouchdb-adapter-memory";
import { NotePathTakenError, NoteNotFoundError, NoteValidationError, createNoteStore, type NoteStore } from "./noteStore";

PouchDB.plugin(memory);

const VAULT = "11111111-1111-4111-8111-111111111111";
const OTHER_VAULT = "22222222-2222-4222-8222-222222222222";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let counter = 0;
let db: PouchDB.Database;
let store: NoteStore;
let tick: number;

/** Reloj de prueba: cada lectura avanza un segundo (con el formato de `utc_now`). */
function nextTime(): string {
  tick += 1;
  return `2026-10-22T10:00:${String(tick).padStart(2, "0")}.000000Z`;
}

beforeEach(() => {
  counter += 1;
  tick = 0;
  db = new PouchDB(`notestore-test-${counter}`, { adapter: "memory" });
  store = createNoteStore(db, { now: nextTime });
});

/** Manda una nota a la papelera escribiendo el documento a mano (`softDelete` se prueba aparte). */
async function trash(id: string): Promise<void> {
  const doc = await db.get<{ deleted_at: string | null }>(id);
  await db.put({ ...doc, deleted_at: "2026-10-22T09:00:00.000000Z" });
}

describe("RF-003, RF-012: create", () => {
  it("con título añade .md y guarda un documento de nota completo", async () => {
    const note = await store.create(VAULT, "Ideas");
    expect(note.id).toMatch(new RegExp(`^note:${VAULT}:`));
    expect(note.id.slice(`note:${VAULT}:`.length)).toMatch(UUID);
    expect(note.path).toBe("Ideas.md");
    const doc = await db.get(note.id);
    expect(doc).toEqual({
      _id: note.id, _rev: note.rev, type: "note", vault_id: VAULT, path: "Ideas.md", frontmatter: {},
      content: "", created_at: "2026-10-22T10:00:01.000000Z", updated_at: "2026-10-22T10:00:01.000000Z",
      deleted_at: null,
    });
  });

  it("no duplica la extensión .md, sin distinguir mayúsculas, y admite carpetas", async () => {
    expect((await store.create(VAULT, "a/b.MD")).path).toBe("a/b.MD");
    expect((await store.create(VAULT, "  c / d  ")).path).toBe("c/d.md");
  });

  it("RF-012: sin título (o en blanco) usa «Sin título» y después «Sin título n»", async () => {
    expect((await store.create(VAULT)).path).toBe("Sin título.md");
    expect((await store.create(VAULT, "  ")).path).toBe("Sin título 2.md");
    expect((await store.create(VAULT)).path).toBe("Sin título 3.md");
  });

  it("RF-012: los «Sin título» de otra bóveda o de la papelera no cuentan", async () => {
    await store.create(OTHER_VAULT);
    const trashed = await store.create(VAULT);
    await trash(trashed.id);
    expect((await store.create(VAULT)).path).toBe("Sin título.md");
  });

  it("RF-013: una ruta equivalente a la de otra nota activa → NotePathTakenError, sin escribir", async () => {
    await store.create(VAULT, "Straße");
    const before = (await db.info()).doc_count;
    await expect(store.create(VAULT, "STRASSE")).rejects.toBeInstanceOf(NotePathTakenError);
    expect((await db.info()).doc_count).toBe(before);
  });

  it("RF-013: la misma ruta en otra bóveda es libre", async () => {
    await store.create(VAULT, "Ideas");
    await expect(store.create(OTHER_VAULT, "Ideas")).resolves.toMatchObject({ path: "Ideas.md" });
  });

  it("RF-005: una ruta inválida → NoteValidationError(path), sin escribir", async () => {
    const err = await store.create(VAULT, "a//b").catch((e) => e);
    expect(err).toBeInstanceOf(NoteValidationError);
    expect(err.fields).toEqual(["path"]);
    expect((await db.info()).doc_count).toBe(0);
  });
});

describe("RF-001, RF-019: list y get", () => {
  it("lista las notas activas de la bóveda sin content ni notas de otra bóveda", async () => {
    const a = await store.create(VAULT, "A");
    await store.create(OTHER_VAULT, "B");
    const [item, ...rest] = await store.list(VAULT);
    expect(rest).toEqual([]);
    expect(item).toEqual({ id: a.id, path: "A.md", rev: a.rev, updated_at: a.updated_at, deleted_at: null });
    expect(item).not.toHaveProperty("content");
  });

  it("RF-010: separa activas y papelera según `deleted`", async () => {
    const a = await store.create(VAULT, "A");
    await store.create(VAULT, "B");
    await trash(a.id);
    expect((await store.list(VAULT)).map((n) => n.path)).toEqual(["B.md"]);
    expect((await store.list(VAULT, { deleted: true })).map((n) => n.path)).toEqual(["A.md"]);
  });

  it("devuelve las notas por ruta", async () => {
    await store.create(VAULT, "b");
    await store.create(VAULT, "a");
    expect((await store.list(VAULT)).map((n) => n.path)).toEqual(["a.md", "b.md"]);
  });

  it("get devuelve la nota completa con su contenido", async () => {
    const created = await store.create(VAULT, "A");
    expect(await store.get(created.id)).toEqual(created);
  });

  it("get de una nota inexistente o en la papelera → NoteNotFoundError", async () => {
    await expect(store.get(`note:${VAULT}:${"3".repeat(8)}`)).rejects.toBeInstanceOf(NoteNotFoundError);
    const a = await store.create(VAULT, "A");
    await trash(a.id);
    await expect(store.get(a.id)).rejects.toBeInstanceOf(NoteNotFoundError);
  });
});
