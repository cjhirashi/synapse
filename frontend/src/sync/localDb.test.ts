// Réplica local, su dueño y su borrado pendiente (SPEC-0005 RF-017, RF-018; PLAN-0005 §2.5, §13).
import PouchDB from "pouchdb-browser";
import memory from "pouchdb-adapter-memory";
import { DISCARD_MARK_PREFIX, OWNER_DOC_ID, destroyLocalDb, markDiscarded, openLocalDb } from "./localDb";

PouchDB.plugin(memory);

let counter = 0;
/** Cada test con su propia base: el adaptador en memoria comparte datos por nombre. */
function options() {
  counter += 1;
  return { name: `localdb-test-${counter}`, adapter: "memory" };
}

async function ownerOf(db: PouchDB.Database): Promise<string> {
  return ((await db.get(OWNER_DOC_ID)) as unknown as { sub: string }).sub;
}

describe("RF-018: la réplica pertenece a un único usuario", () => {
  it("una réplica nueva queda a nombre del usuario", async () => {
    const db = await openLocalDb("user-a", options());
    expect(await ownerOf(db)).toBe("user-a");
    expect((await db.info()).doc_count).toBe(0);
  });

  it("el mismo usuario conserva sus datos al volver", async () => {
    const opts = options();
    const first = await openLocalDb("user-a", opts);
    await first.put({ _id: "vault:1", name: "Notas" });
    await first.close();

    const again = await openLocalDb("user-a", opts);
    expect((await again.get("vault:1")) as unknown).toMatchObject({ name: "Notas" });
  });

  it("otro usuario recibe una réplica destruida y vacía antes de replicar", async () => {
    const opts = options();
    const first = await openLocalDb("user-a", opts);
    await first.put({ _id: "vault:1", name: "De A" });
    await first.put({ _id: "_local/checkpoint", last_seq: "9" });
    await first.close();

    const other = await openLocalDb("user-b", opts);
    expect(await ownerOf(other)).toBe("user-b");
    expect((await other.allDocs()).rows).toEqual([]);
    await expect(other.get("_local/checkpoint")).rejects.toMatchObject({ status: 404 });
  });

  it("una réplica sin dueño conocido se destruye, también sus documentos `_local`", async () => {
    const opts = options();
    const orphan = new PouchDB(opts.name, { adapter: opts.adapter });
    await orphan.put({ _id: "vault:1", name: "¿De quién?" });
    await orphan.put({ _id: "_local/checkpoint", last_seq: "3" });

    const db = await openLocalDb("user-a", opts);
    expect((await db.allDocs()).rows).toEqual([]);
    await expect(db.get("_local/checkpoint")).rejects.toMatchObject({ status: 404 });
  });

  it("almacenamiento borrado → réplica vacía nueva del usuario", async () => {
    const opts = options();
    const first = await openLocalDb("user-a", opts);
    await first.put({ _id: "vault:1", name: "Notas" });
    // El navegador borra los datos del sitio: la base vuelve a no existir.
    await new PouchDB(opts.name, { adapter: opts.adapter }).destroy();

    const fresh = await openLocalDb("user-a", opts);
    expect(await ownerOf(fresh)).toBe("user-a");
    expect((await fresh.info()).doc_count).toBe(0);
  });

  it("sin compactación: el cuerpo de una revisión anterior sigue disponible (ADR-003)", async () => {
    const db = await openLocalDb("user-a", options());
    const first = await db.put({ _id: "vault:1", name: "v1" });
    await db.put({ _id: "vault:1", _rev: first.rev, name: "v2" });
    expect((await db.get("vault:1", { rev: first.rev })) as unknown).toMatchObject({ name: "v1" });
  });

  it("destroyLocalDb borra la réplica entera (cierre de sesión, RF-017)", async () => {
    const opts = options();
    const db = await openLocalDb("user-a", opts);
    await db.put({ _id: "vault:1", name: "Notas" });
    await destroyLocalDb(db);

    const reopened = new PouchDB(opts.name, { adapter: opts.adapter });
    expect((await reopened.info()).doc_count).toBe(0);
    await expect(reopened.get(OWNER_DOC_ID)).rejects.toMatchObject({ status: 404 });
  });
});

describe("RF-017: la réplica descartada nunca vuelve a usarse (VF-4)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("markDiscarded anota el borrado pendiente por nombre de base", async () => {
    const opts = options();
    const db = await openLocalDb("user-a", opts);
    expect(markDiscarded(db)).toBe(true);
    expect(localStorage.getItem(DISCARD_MARK_PREFIX + opts.name)).not.toBeNull();
  });

  it("con la marca, el mismo usuario recibe una réplica vacía y la marca se quita", async () => {
    const opts = options();
    const db = await openLocalDb("user-a", opts);
    await db.put({ _id: "vault:1", name: "descartada" });
    markDiscarded(db);

    const reopened = await openLocalDb("user-a", opts);
    expect((await reopened.allDocs()).rows).toEqual([]);
    expect(await ownerOf(reopened)).toBe("user-a");
    expect(localStorage.getItem(DISCARD_MARK_PREFIX + opts.name)).toBeNull();
  });

  it("destroyLocalDb quita la marca sólo tras borrar", async () => {
    const opts = options();
    const db = await openLocalDb("user-a", opts);
    markDiscarded(db);
    await destroyLocalDb(db);
    expect(localStorage.getItem(DISCARD_MARK_PREFIX + opts.name)).toBeNull();

    const failing = await openLocalDb("user-a", opts);
    markDiscarded(failing);
    vi.spyOn(failing, "destroy").mockRejectedValue(new Error("IndexedDB no disponible"));
    await expect(destroyLocalDb(failing)).rejects.toThrow("IndexedDB no disponible");
    expect(localStorage.getItem(DISCARD_MARK_PREFIX + opts.name)).not.toBeNull();
  });

  it("si destruir la réplica marcada falla al abrir, rechaza y la marca sigue", async () => {
    const opts = options();
    markDiscarded(await openLocalDb("user-a", opts));
    // `destroy` es propio de cada instancia (no del prototipo): se sustituye la clase que usa
    // `localDb.ts` por una cuyas instancias no pueden destruirse (IndexedDB con error).
    vi.resetModules();
    vi.doMock("pouchdb-browser", async (importOriginal) => {
      const Real = (await importOriginal<{ default: typeof PouchDB }>()).default;
      class Broken extends Real {
        constructor(name?: string, options?: PouchDB.Configuration.DatabaseConfiguration) {
          super(name, options);
          this.destroy = (() => Promise.reject(new Error("IndexedDB no disponible"))) as never;
        }
      }
      return { default: Broken };
    });
    const broken = await import("./localDb");
    await expect(broken.openLocalDb("user-a", opts)).rejects.toThrow("IndexedDB no disponible");
    vi.doUnmock("pouchdb-browser");
    expect(localStorage.getItem(DISCARD_MARK_PREFIX + opts.name)).not.toBeNull();
  });

  it("sin localStorage, markDiscarded devuelve false y lo registra", async () => {
    const db = await openLocalDb("user-a", options());
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
    expect(markDiscarded(db)).toBe(false);
    expect(error).toHaveBeenCalledOnce();
  });

  it("una marca ilegible cuenta como ausente: el mismo usuario conserva sus datos", async () => {
    const opts = options();
    const db = await openLocalDb("user-a", opts);
    await db.put({ _id: "vault:1", name: "sin confirmar" });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
    const reopened = await openLocalDb("user-a", opts);
    expect(((await reopened.get("vault:1")) as unknown as { name: string }).name).toBe("sin confirmar");
    expect(error).toHaveBeenCalledOnce();
  });
});
