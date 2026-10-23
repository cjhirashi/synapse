// Conflictos de la réplica local (SPEC-0005 RF-012…RF-015; PLAN-0005 §2.6).
import PouchDB from "pouchdb-browser";
import memory from "pouchdb-adapter-memory";
import { canonical, openConflicts, type ConflictsStore } from "./conflicts";
import { NoteValidationError } from "../notes/errors";
import { StorageFullError, VaultValidationError } from "./vaultStore";
import { waitForCondition } from "../test-utils/waits";

PouchDB.plugin(memory);

const ID = "vault:11111111-1111-4111-8111-111111111111";
const T0 = "2026-10-01T10:00:00.000000Z";
const T1 = "2026-10-02T10:00:00.000000Z";
const T2 = "2026-10-03T10:00:00.000000Z";
const NOW = "2026-10-13T10:00:00.000000Z";

// Revisiones del árbol de pruebas. A igual profundidad gana el hash mayor, así que `W`
// ("ffff…") es siempre la ganadora y `L` ("1111…") la perdedora.
const A = "aaaa";
const W = "ffff";
const L = "1111";
const L2 = "0000";

const ANCESTOR = {
  type: "vault",
  name: "Uno",
  description: null as string | null,
  tags: ["a", "b"],
  owner_id: "u1",
  created_at: T0,
  updated_at: T0,
  deleted_at: null as string | null,
};
type Body = typeof ANCESTOR;

let counter = 0;
let db: PouchDB.Database;
const opened: ConflictsStore[] = [];

beforeEach(() => {
  counter += 1;
  db = new PouchDB(`conflicts-test-${counter}`, { adapter: "memory" });
});

afterEach(() => {
  opened.splice(0).forEach((store) => store.close());
});

async function open(now = () => NOW): Promise<ConflictsStore> {
  const store = await openConflicts(db, { now });
  opened.push(store);
  return store;
}

/** Inserta revisiones tal como las trae la replicación (`new_edits: false`). */
async function insert(...docs: { hashes: string[]; body: Partial<Body> }[]): Promise<void> {
  await db.bulkDocs(
    docs.map(({ hashes, body }) => ({
      _id: ID,
      _rev: `${hashes.length}-${hashes[0]}`,
      _revisions: { start: hashes.length, ids: hashes },
      ...ANCESTOR,
      ...body,
    })),
    { new_edits: false },
  );
}

/** Ancestro `1-aaaa` y dos hijas en conflicto: `2-ffff` (W) y `2-1111` (L). */
async function conflict(w: Partial<Body>, l: Partial<Body>): Promise<void> {
  await insert({ hashes: [A], body: {} });
  await insert({ hashes: [W, A], body: { updated_at: T1, ...w } }, { hashes: [L, A], body: { updated_at: T2, ...l } });
}

/** Hojas del documento: `{ rev, deleted, parent }` ordenadas por rev. */
async function leaves() {
  const results = await db.get(ID, { open_revs: "all", revs: true });
  return (results as { ok: PouchDB.Core.ExistingDocument<{ _revisions: { ids: string[] } }> & { _deleted?: boolean } }[])
    .map(({ ok }) => ({ rev: ok._rev, deleted: ok._deleted === true, parent: ok._revisions.ids[1] }))
    .sort((x, y) => x.rev.localeCompare(y.rev));
}

async function winner() {
  return db.get<Body>(ID, { conflicts: true, revs: true });
}

describe("combinación automática", () => {
  it("al arrancar combina campos distintos: hija de W + lápida sobre L", async () => {
    await conflict({ name: "Uno W" }, { description: "desc L" });
    const store = await open();

    const doc = await winner();
    expect(doc._conflicts).toBeUndefined();
    expect(doc).toMatchObject({ name: "Uno W", description: "desc L", tags: ["a", "b"], updated_at: NOW, created_at: T0 });
    expect(doc._rev.startsWith("3-")).toBe(true);
    const tree = await leaves();
    expect(tree.filter((leaf) => !leaf.deleted)).toEqual([{ rev: doc._rev, deleted: false, parent: W }]);
    expect(tree.filter((leaf) => leaf.deleted)).toEqual([expect.objectContaining({ parent: L })]);
    expect(store.list()).toEqual([]);
  });

  it("detecta en `changes` un conflicto que llega después de arrancar (tags: altas y bajas)", async () => {
    const store = await open();
    await conflict({ tags: ["a", "b", "w"] }, { tags: ["b", "l"] });
    await waitForCondition(async () => expect((await winner())._conflicts).toBeUndefined());
    expect((await winner()).tags).toEqual(["b", "w", "l"]);
    expect(store.list()).toEqual([]);
  });

  it("si W y L sólo difieren en `updated_at`, sólo cierra la rama de L", async () => {
    await conflict({ name: "Igual" }, { name: "Igual" });
    await open();
    const doc = await winner();
    expect(doc._rev).toBe(`2-${W}`);
    expect(doc._conflicts).toBeUndefined();
    expect((await leaves()).filter((leaf) => leaf.deleted)).toEqual([expect.objectContaining({ parent: L })]);
  });

  it("la edición gana al borrado: restaurada con la edición (RF-014)", async () => {
    await conflict({ deleted_at: T1 }, { name: "Editada" });
    await open();
    expect(await winner()).toMatchObject({ name: "Editada", deleted_at: null });
  });

  it("combina varias perdedoras, una tras otra", async () => {
    await insert({ hashes: [A], body: {} });
    await insert(
      { hashes: [W, A], body: { name: "Uno W" } },
      { hashes: [L, A], body: { description: "desc L" } },
      { hashes: [L2, A], body: { tags: ["a", "b", "c"] } },
    );
    await open();
    const doc = await winner();
    expect(doc._conflicts).toBeUndefined();
    expect(doc).toMatchObject({ name: "Uno W", description: "desc L", tags: ["a", "b", "c"] });
  });

  it("dos pestañas que combinan a la vez convergen en una sola hoja viva", async () => {
    await conflict({ name: "Uno W" }, { description: "desc L" });
    await Promise.all([open(), open()]);
    await waitForCondition(async () => {
      expect((await winner())._conflicts).toBeUndefined();
      expect((await leaves()).filter((leaf) => !leaf.deleted)).toHaveLength(1);
    });
    expect(await winner()).toMatchObject({ name: "Uno W", description: "desc L" });
  });
});

describe("conflictos manuales", () => {
  it("choque en el mismo campo → en la lista con ambas versiones; no se escribe nada (RF-013)", async () => {
    await conflict({ name: "Nombre W" }, { name: "Nombre L" });
    const store = await open();
    expect(store.list()).toEqual([
      {
        kind: "vault",
        id: ID,
        reason: "clash",
        fields: ["name"],
        winner: { rev: `2-${W}`, doc: expect.objectContaining({ name: "Nombre W" }) },
        loser: { rev: `2-${L}`, doc: expect.objectContaining({ name: "Nombre L" }) },
      },
    ]);
    expect((await winner())._conflicts).toEqual([`2-${L}`]);
  });

  it("sin ancestro común → manual con motivo 'no-ancestor'", async () => {
    await insert({ hashes: [W], body: { name: "Raíz W" } }, { hashes: [L], body: { name: "Raíz L" } });
    const store = await open();
    expect(store.list()).toEqual([expect.objectContaining({ reason: "no-ancestor", fields: [] })]);
  });

  it("combinación que incumple las reglas → manual con motivo 'invalid' (RF-015)", async () => {
    const many = (prefix: string) => Array.from({ length: 10 }, (_, i) => `${prefix}${i}`);
    await conflict({ tags: ["a", "b", ...many("w")] }, { tags: ["a", "b", ...many("l")] });
    const store = await open();
    expect(store.list()).toEqual([expect.objectContaining({ reason: "invalid", fields: ["tags"] })]);
  });

  it("sale de la lista cuando otra réplica cierra la rama perdedora", async () => {
    await conflict({ name: "Nombre W" }, { name: "Nombre L" });
    const store = await open();
    expect(store.list()).toHaveLength(1);
    await db.remove(ID, `2-${L}`);
    await waitForCondition(() => expect(store.list()).toEqual([]));
  });

  it("avisa a los suscriptores", async () => {
    const store = await open();
    const seen: number[] = [];
    store.subscribe((items) => seen.push(items.length));
    await conflict({ name: "Nombre W" }, { name: "Nombre L" });
    await waitForCondition(() => expect(seen).toEqual([1]));
  });

  it("`resolve` escribe la elección como hija de W y cierra la rama de L", async () => {
    await conflict({ name: "Nombre W" }, { name: "Nombre L" });
    const store = await open();
    await store.resolve(ID, `2-${L}`, { name: "  Elegido ", description: null, tags: ["a"], deleted_at: null });
    const doc = await winner();
    expect(doc._conflicts).toBeUndefined();
    expect(doc).toMatchObject({ name: "Elegido", tags: ["a"], updated_at: NOW, created_at: T0, owner_id: "u1" });
    expect(doc._revisions?.ids[1]).toBe(W);
    await waitForCondition(() => expect(store.list()).toEqual([]));
  });

  it("`resolve` con una elección inválida no escribe nada", async () => {
    await conflict({ name: "Nombre W" }, { name: "Nombre L" });
    const store = await open();
    await expect(store.resolve(ID, `2-${L}`, { name: " ", description: null, tags: [], deleted_at: null }))
      .rejects.toEqual(new VaultValidationError(["name"]));
    expect((await winner())._rev).toBe(`2-${W}`);
    expect(store.list()).toHaveLength(1);
  });
});

describe("revisiones deterministas (VC-2, enmienda 1)", () => {
  const HEX32 = /^\d+-[0-9a-f]{32}$/;

  /**
   * Prepara el mismo conflicto en una réplica nueva, deja que `run` lo resuelva y devuelve
   * sus hojas. Cada réplica es un dispositivo distinto con su propio reloj.
   */
  async function onReplica(run: () => Promise<unknown>) {
    counter += 1;
    db = new PouchDB(`conflicts-test-${counter}`, { adapter: "memory" });
    await run();
    await waitForCondition(async () => expect((await winner())._conflicts).toBeUndefined());
    return leaves();
  }

  it("la misma combinación en dos réplicas escribe las mismas revisiones", async () => {
    const combine = async () => {
      await conflict({ name: "Uno W" }, { description: "desc L" });
      await open();
    };
    const first = await onReplica(combine);
    const second = await onReplica(combine);
    expect(second).toEqual(first);
    first.filter((leaf) => leaf.rev.startsWith("3-")).forEach((leaf) => expect(leaf.rev).toMatch(HEX32));
  });

  it("con relojes distintos, la lápida sobre L es la misma revisión en ambas réplicas", async () => {
    const combineAt = (now: string) => async () => {
      await conflict({ name: "Uno W" }, { description: "desc L" });
      await open(() => now);
    };
    const tombstone = (tree: Awaited<ReturnType<typeof leaves>>) => tree.find((leaf) => leaf.deleted && leaf.parent === L);
    const first = tombstone(await onReplica(combineAt(NOW)));
    const second = tombstone(await onReplica(combineAt(T2)));
    expect(first?.rev).toMatch(HEX32);
    expect(second).toEqual(first);
  });

  it("la misma resolución manual en dos réplicas cierra L con la misma lápida", async () => {
    const resolveAt = (now: string) => async () => {
      await conflict({ name: "Nombre W" }, { name: "Nombre L" });
      const store = await open(() => now);
      await store.resolve(ID, `2-${L}`, { name: "Elegido", description: null, tags: ["a"], deleted_at: null });
    };
    const first = await onReplica(resolveAt(NOW));
    const second = await onReplica(resolveAt(T2));
    expect(second.filter((leaf) => leaf.deleted)).toEqual(first.filter((leaf) => leaf.deleted));
    first.filter((leaf) => leaf.rev.startsWith("3-")).forEach((leaf) => expect(leaf.rev).toMatch(HEX32));
  });
});

// --- Notas (SPEC-0008 RF-009, RF-014; PLAN-0008 §2.6) ---

const VAULT_ID = "33333333-3333-4333-8333-333333333333";
const NOTE_ID = `note:${VAULT_ID}:44444444-4444-4444-8444-444444444444`;
const VAULT_DOC_ID = `vault:${VAULT_ID}`;

const NOTE_ANCESTOR = {
  type: "note",
  vault_id: VAULT_ID,
  path: "a.md",
  frontmatter: {},
  content: "base",
  created_at: T0,
  updated_at: T0,
  deleted_at: null as string | null,
};
type NoteDocBody = typeof NOTE_ANCESTOR;

/** Bóveda activa (o en la papelera si `deleted_at`): la que da paso a sus conflictos de nota. */
async function putVault(deletedAt: string | null = null): Promise<void> {
  const existing = await db.get<{ _rev: string }>(VAULT_DOC_ID).catch(() => null);
  await db.put({
    _id: VAULT_DOC_ID, ...(existing ? { _rev: existing._rev } : {}), ...ANCESTOR, deleted_at: deletedAt,
  });
}

/** Ancestro `1-aaaa` y dos hijas de la nota en conflicto: `2-ffff` (W) y `2-1111` (L). */
async function noteConflict(w: Partial<NoteDocBody>, l: Partial<NoteDocBody>): Promise<void> {
  const rev = (hashes: string[], body: Partial<NoteDocBody>) => ({
    _id: NOTE_ID, _rev: `${hashes.length}-${hashes[0]}`, _revisions: { start: hashes.length, ids: hashes },
    ...NOTE_ANCESTOR, ...body,
  });
  await db.bulkDocs([rev([A], {})], { new_edits: false });
  await db.bulkDocs([rev([W, A], { updated_at: T1, ...w }), rev([L, A], { updated_at: T2, ...l })], { new_edits: false });
}

async function noteWinner() {
  return db.get<NoteDocBody>(NOTE_ID, { conflicts: true, revs: true });
}

describe("RF-009, RNF-001: el barrido de conflictos va sin cuerpos (S-1)", () => {
  it("el barrido inicial no lee el contenido de las notas (sin `allDocs` con `include_docs`)", async () => {
    await putVault();
    await noteConflict({ content: "texto W" }, { content: "texto L" });
    const allDocs = vi.spyOn(db, "allDocs");
    const store = await open();
    expect(store.list()).toHaveLength(1); // sigue detectando el conflicto
    expect(allDocs.mock.calls.filter(([options]) => options?.include_docs)).toEqual([]);
  });
});

describe("RF-009: conflictos de nota", () => {
  it("el barrido inicial detecta una nota en conflicto y la deja manual, con ambas versiones", async () => {
    await putVault();
    await noteConflict({ content: "texto W" }, { content: "texto L" });
    const store = await open();
    expect(store.list()).toEqual([
      {
        kind: "note",
        id: NOTE_ID,
        winner: { rev: `2-${W}`, doc: expect.objectContaining({ content: "texto W", path: "a.md" }) },
        loser: { rev: `2-${L}`, doc: expect.objectContaining({ content: "texto L" }) },
      },
    ]);
    // Nada se escribe ni se pierde: la rama perdedora sigue viva.
    expect((await noteWinner())._conflicts).toEqual([`2-${L}`]);
  });

  it("el feed detecta una nota que entra en conflicto después de arrancar", async () => {
    await putVault();
    const store = await open();
    await noteConflict({ path: "w.md" }, { path: "l.md" });
    await waitForCondition(() => expect(store.list()).toEqual([expect.objectContaining({ kind: "note", id: NOTE_ID })]));
  });

  it.each<[string, Partial<NoteDocBody>]>([
    ["ruta", { path: "otra.md" }],
    ["frontmatter", { frontmatter: { k: 1 } }],
    ["borrado", { deleted_at: T2 }],
  ])("una diferencia de %s también es manual", async (_label, change) => {
    await putVault();
    await noteConflict({}, change);
    expect((await open()).list()).toEqual([expect.objectContaining({ kind: "note" })]);
  });

  it("mergeNote cierra la perdedora si sólo difiere en `updated_at` (convergencia)", async () => {
    await putVault();
    await noteConflict({ content: "igual" }, { content: "igual" });
    const store = await open();
    const doc = await noteWinner();
    expect(doc._rev).toBe(`2-${W}`);
    expect(doc._conflicts).toBeUndefined();
    expect(store.list()).toEqual([]);
  });

  // S-3 (PLAN-0008 §17): cuota llena al resolver → el mismo error que el resto de las escrituras.
  it("`resolve` con la cuota llena rechaza con StorageFullError y no escribe", async () => {
    await putVault();
    await noteConflict({ content: "texto W" }, { content: "texto L" });
    const store = await open();
    vi.spyOn(db, "bulkDocs").mockRejectedValueOnce({ name: "indexed_db_went_bad", reason: "QuotaExceededError" });
    await expect(
      store.resolve(NOTE_ID, `2-${L}`, { path: "a.md", content: "texto L", frontmatter: {}, deleted_at: null }),
    ).rejects.toBeInstanceOf(StorageFullError);
    expect((await noteWinner())._conflicts).toEqual([`2-${L}`]);
  });

  it("`resolve` de nota escribe la elección como hija de W y cierra la rama de L", async () => {
    await putVault();
    await noteConflict({ content: "texto W" }, { content: "texto L" });
    const store = await open();
    await store.resolve(NOTE_ID, `2-${L}`, { path: "a.md", content: "texto L", frontmatter: {}, deleted_at: null });
    const doc = await noteWinner();
    expect(doc._conflicts).toBeUndefined();
    expect(doc).toMatchObject({ content: "texto L", path: "a.md", updated_at: NOW, created_at: T0, vault_id: VAULT_ID });
    expect(doc._revisions?.ids[1]).toBe(W);
    await waitForCondition(() => expect(store.list()).toEqual([]));
  });

  it("`resolve` de nota con una elección inválida no escribe nada", async () => {
    await putVault();
    await noteConflict({ content: "texto W" }, { content: "texto L" });
    const store = await open();
    await expect(store.resolve(NOTE_ID, `2-${L}`, { path: "a//b.md", content: "x", frontmatter: {}, deleted_at: null }))
      .rejects.toEqual(new NoteValidationError(["path"]));
    expect((await noteWinner())._rev).toBe(`2-${W}`);
  });
});

describe("RF-014: notas de una bóveda que no está activa", () => {
  it("no se listan las de una bóveda desconocida (aún no llegó) ni las de una en la papelera", async () => {
    await noteConflict({ content: "texto W" }, { content: "texto L" });
    expect((await open()).list()).toEqual([]); // sin documento de bóveda
    counter += 1;
    db = new PouchDB(`conflicts-test-${counter}`, { adapter: "memory" });
    await putVault(T1);
    await noteConflict({ content: "texto W" }, { content: "texto L" });
    expect((await open()).list()).toEqual([]); // bóveda en la papelera
  });

  it("al restaurar la bóveda sus conflictos de nota aparecen, y al borrarla desaparecen", async () => {
    await putVault(T1);
    await noteConflict({ content: "texto W" }, { content: "texto L" });
    const store = await open();
    expect(store.list()).toEqual([]);
    await putVault(null);
    await waitForCondition(() => expect(store.list()).toEqual([expect.objectContaining({ kind: "note", id: NOTE_ID })]));
    await putVault(T2);
    await waitForCondition(() => expect(store.list()).toEqual([]));
  });

  // N-3 / RD-1 (P-9): una bóveda con ramas vivas distintas cuenta como activa si alguna lo es.
  it("una bóveda en conflicto (ganadora en la papelera, perdedora activa) deja pasar sus conflictos de nota", async () => {
    // Los nombres chocan, así que la bóveda queda en conflicto manual (no se funde sola).
    const rev = (hashes: string[], body: object) => ({
      _id: VAULT_DOC_ID, _rev: `${hashes.length}-${hashes[0]}`, _revisions: { start: hashes.length, ids: hashes },
      ...ANCESTOR, ...body,
    });
    await db.bulkDocs([rev([A], {})], { new_edits: false });
    await db.bulkDocs(
      [rev([W, A], { name: "Uno W", deleted_at: T1, updated_at: T1 }), rev([L, A], { name: "Uno L", updated_at: T2 })],
      { new_edits: false },
    );
    await noteConflict({ content: "texto W" }, { content: "texto L" });
    const store = await open();
    expect(store.list().map((item) => item.kind).sort()).toEqual(["note", "vault"]);
    // La bóveda sigue en conflicto: ganadora en la papelera, perdedora activa.
    expect((await db.get(VAULT_DOC_ID, { conflicts: true }))._conflicts).toEqual([`2-${L}`]);
  });

  it("los conflictos de nota no se mezclan con los de bóveda en la lista", async () => {
    await putVault();
    await conflict({ name: "Nombre W" }, { name: "Nombre L" });
    await noteConflict({ content: "texto W" }, { content: "texto L" });
    const store = await open();
    expect(store.list().map((item) => item.kind).sort()).toEqual(["note", "vault"]);
  });
});

describe("canonical (VD-4, enmienda 2)", () => {
  it("el orden de las claves no cambia el texto, en ningún nivel", () => {
    expect(canonical({ b: 1, a: { d: [1, 2], c: "x" } })).toBe(canonical({ a: { c: "x", d: [1, 2] }, b: 1 }));
    expect(canonical({ b: 1, a: { d: [1, 2], c: "x" } })).toBe('{"a":{"c":"x","d":[1,2]},"b":1}');
  });

  it("omite las claves de valor `undefined` en los objetos", () => {
    expect(canonical({ a: undefined, b: null })).toBe('{"b":null}');
  });

  it("da `null` para un `undefined` dentro de una lista, como JSON.stringify", () => {
    const list = [1, undefined, "x"];
    expect(canonical(list)).toBe("[1,null,\"x\"]");
    expect(canonical(list)).toBe(JSON.stringify(list));
  });

  it("escapa los textos como JSON", () => {
    expect(canonical({ 'a"b': 'c"d' })).toBe(JSON.stringify({ 'a"b': 'c"d' }));
  });
});

// SPEC-0009 RF-012: `icon` viaja en la combinación automática y la resolución manual lo conserva de W.
describe("icon (RF-012)", () => {
  const withIcon = (icon: string | null, body: Partial<Body> = {}) => ({ icon, ...body }) as Partial<Body>;

  it("la combinación automática lleva el icon que cambió sólo L junto al nombre que cambió W", async () => {
    await insert({ hashes: [A], body: withIcon("folder") });
    await insert(
      { hashes: [W, A], body: withIcon("folder", { updated_at: T1, name: "Nombre W" }) },
      { hashes: [L, A], body: withIcon("rocket", { updated_at: T2 }) },
    );
    await open();
    await waitForCondition(async () => expect((await winner())._conflicts).toBeUndefined());
    expect(await winner()).toMatchObject({ name: "Nombre W", icon: "rocket" });
  });

  it("un choque de icon se resuelve solo y gana el de W", async () => {
    await insert({ hashes: [A], body: withIcon("folder") });
    await insert(
      { hashes: [W, A], body: withIcon("star:info", { updated_at: T1 }) },
      { hashes: [L, A], body: withIcon("rocket", { updated_at: T2 }) },
    );
    const store = await open();
    await waitForCondition(async () => expect((await winner())._conflicts).toBeUndefined());
    expect(await winner()).toMatchObject({ icon: "star:info" });
    expect(store.list()).toEqual([]);
  });

  it("`resolve` manual conserva el icon de la ganadora", async () => {
    await insert({ hashes: [A], body: withIcon("folder") });
    await insert(
      { hashes: [W, A], body: withIcon("heart", { updated_at: T1, name: "Nombre W" }) },
      { hashes: [L, A], body: withIcon("rocket", { updated_at: T2, name: "Nombre L" }) },
    );
    const store = await open();
    await store.resolve(ID, `2-${L}`, { name: "Elegido", description: null, tags: ["a"], deleted_at: null });
    expect(await winner()).toMatchObject({ name: "Elegido", icon: "heart" });
  });
});
