// Conflictos de la réplica local (SPEC-0005 RF-012…RF-015; PLAN-0005 §2.6).
import PouchDB from "pouchdb-browser";
import memory from "pouchdb-adapter-memory";
import { openConflicts, type ConflictsStore } from "./conflicts";
import { VaultValidationError } from "./vaultStore";

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
    await vi.waitFor(async () => expect((await winner())._conflicts).toBeUndefined());
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
    await vi.waitFor(async () => {
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
    await vi.waitFor(() => expect(store.list()).toEqual([]));
  });

  it("avisa a los suscriptores", async () => {
    const store = await open();
    const seen: number[] = [];
    store.subscribe((items) => seen.push(items.length));
    await conflict({ name: "Nombre W" }, { name: "Nombre L" });
    await vi.waitFor(() => expect(seen).toEqual([1]));
  });

  it("`resolve` escribe la elección como hija de W y cierra la rama de L", async () => {
    await conflict({ name: "Nombre W" }, { name: "Nombre L" });
    const store = await open();
    await store.resolve(ID, `2-${L}`, { name: "  Elegido ", description: null, tags: ["a"], deleted_at: null });
    const doc = await winner();
    expect(doc._conflicts).toBeUndefined();
    expect(doc).toMatchObject({ name: "Elegido", tags: ["a"], updated_at: NOW, created_at: T0, owner_id: "u1" });
    expect(doc._revisions?.ids[1]).toBe(W);
    await vi.waitFor(() => expect(store.list()).toEqual([]));
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
    await vi.waitFor(async () => expect((await winner())._conflicts).toBeUndefined());
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
