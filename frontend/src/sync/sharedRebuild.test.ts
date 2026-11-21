import PouchDB from "pouchdb-browser";
import memory from "pouchdb-adapter-memory";
import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryDb } from "../test-utils/sync";
import { grantsKey, pushPending, storedGrantsKey, storeGrantsKey, unreadableLocalNotes } from "./sharedRebuild";

PouchDB.plugin(memory);
afterEach(() => vi.restoreAllMocks());

const NOTE = (n: number) => `note:11111111-1111-4111-8111-111111111111:0000000${n}-0000-4000-8000-000000000000`;

/** Un servidor falso: `readable` es lo que lista a esta persona; `known` lo que existe aunque no pueda leerlo. */
function server(readable: string[], known: Record<string, string>) {
  return {
    allDocs: async () => ({ rows: readable.map((id) => ({ id })) }),
    revsDiff: async (request: Record<string, string[]>) => Object.fromEntries(Object.entries(request).filter(([id, revs]) => known[id] !== revs[0]).map(([id, revs]) => [id, { missing: revs }])),
  } as unknown as PouchDB.Database;
}

describe("grantsKey", () => {
  it("no depende del orden y distingue carpeta y nivel", () => {
    const a = { folder: "Pub", level: "lectura" as const };
    const b = { folder: "Docs", level: "escritura" as const };
    expect(grantsKey([a, b])).toBe(grantsKey([b, a]));
    expect(grantsKey([a])).not.toBe(grantsKey([{ ...a, level: "escritura" }]));
    expect(grantsKey([a])).not.toBe(grantsKey([{ ...a, folder: "Pub/Sub" }]));
    expect(grantsKey([])).toBe("[]");
  });
});

describe("la marca de concesiones", () => {
  it("no existe al principio, se guarda y se reemplaza", async () => {
    const db = memoryDb();
    expect(await storedGrantsKey(db)).toBeNull();
    await storeGrantsKey(db, "uno");
    expect(await storedGrantsKey(db)).toBe("uno");
    await storeGrantsKey(db, "dos");
    expect(await storedGrantsKey(db)).toBe("dos");
  });

  it("no se replica: es un documento `_local`", async () => {
    const db = memoryDb();
    await storeGrantsKey(db, "uno");
    expect((await db.allDocs()).rows).toHaveLength(0);
  });
});

describe("unreadableLocalNotes", () => {
  async function replica(notes: Record<string, string>) {
    const db = memoryDb();
    const revs: Record<string, string> = {};
    for (const [id, content] of Object.entries(notes)) revs[id] = (await db.put({ _id: id, content })).rev;
    return { db, revs };
  }

  it("una nota que el servidor tiene pero ya no lista (la movieron o se redujeron las concesiones) es ilegible", async () => {
    const { db, revs } = await replica({ [NOTE(1)]: "visible", [NOTE(2)]: "ya no" });
    expect(await unreadableLocalNotes(db, server([NOTE(1)], revs))).toEqual([NOTE(2)]);
  });

  it("una nota creada sin conexión y aún sin subir NO es ilegible: el servidor no conoce su revisión", async () => {
    const { db } = await replica({ [NOTE(1)]: "visible", [NOTE(3)]: "solo aquí" });
    expect(await unreadableLocalNotes(db, server([NOTE(1)], {}))).toEqual([]);
  });

  it("sin nada ilegible no pregunta por revisiones", async () => {
    const { db, revs } = await replica({ [NOTE(1)]: "visible" });
    const remote = server([NOTE(1)], revs);
    const spy = vi.spyOn(remote, "revsDiff");
    expect(await unreadableLocalNotes(db, remote)).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("sin notas locales no consulta al servidor y no mira lo que no es nota", async () => {
    const db = memoryDb();
    await db.put({ _id: `vault:11111111-1111-4111-8111-111111111111`, name: "B" });
    const remote = server([], {});
    const spy = vi.spyOn(remote, "allDocs");
    expect(await unreadableLocalNotes(db, remote)).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("una revisión vieja que el servidor ya reemplazó cuenta como pendiente de subir, no como ilegible", async () => {
    const { db } = await replica({ [NOTE(2)]: "cambié esto sin conexión" });
    expect(await unreadableLocalNotes(db, server([], { [NOTE(2)]: "1-otra-revision" }))).toEqual([]);
  });
});

describe("pushPending", () => {
  it("sube lo pendiente y dice que pudo", async () => {
    const local = memoryDb();
    const remote = memoryDb();
    await local.put({ _id: NOTE(1), content: "pendiente" });
    expect(await pushPending(local, remote)).toEqual({ ok: true, discarded: 0 });
    expect((await remote.get<{ content: string }>(NOTE(1))).content).toBe("pendiente");
  });

  it("sin conexión (falla la subida) dice que no pudo, sin lanzar", async () => {
    const local = memoryDb();
    await local.put({ _id: NOTE(1), content: "pendiente" });
    const remote = memoryDb();
    vi.spyOn(remote, "bulkDocs").mockRejectedValue(Object.assign(new Error("sin red"), { status: 503 }));
    vi.spyOn(remote, "revsDiff").mockRejectedValue(Object.assign(new Error("sin red"), { status: 503 }));
    expect((await pushPending(local, remote)).ok).toBe(false);
  });

  it("cuenta los cambios que el servidor rechaza", async () => {
    const local = memoryDb();
    vi.spyOn(local.replicate, "to").mockImplementation((() => {
      const handlers = new Map<string, () => void>();
      const done = new Promise((resolve) => queueMicrotask(() => { handlers.get("denied")?.(); handlers.get("denied")?.(); resolve({ ok: true }); }));
      return Object.assign(done, { on: (event: string, fn: () => void) => { handlers.set(event, fn); return done; } });
    }) as never);
    expect(await pushPending(local, memoryDb())).toEqual({ ok: true, discarded: 2 });
  });
});
