// Registro y limpieza de las réplicas de bóvedas compartidas (H-064 F7c): contienen datos de otra persona.
import PouchDB from "pouchdb-browser";
import memory from "pouchdb-adapter-memory";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetSharedReplica, purgeSharedReplicas, rememberSharedReplica } from "./sharedReplicas";
import { uniqueName } from "../test-utils/sync";

// Las bases de PouchDB asignan `destroy` por instancia: se envuelve el constructor para poder hacer que una falle.
const hook = vi.hoisted(() => ({ destroy: null as null | ((name: string, original: () => Promise<unknown>) => Promise<unknown>) }));
vi.mock("pouchdb-browser", async (importOriginal) => {
  const actual = await importOriginal<{ default: new (name: string, options?: object) => PouchDB.Database }>();
  const Real = actual.default;
  function Wrapped(name: string, options?: object) {
    const db = new Real(name, options);
    const destroy = db.destroy.bind(db) as () => Promise<unknown>;
    db.destroy = (() => (hook.destroy ? hook.destroy(name, destroy) : destroy())) as typeof db.destroy;
    return db;
  }
  Object.setPrototypeOf(Wrapped, Real);
  return { ...actual, default: Wrapped };
});

PouchDB.plugin(memory);
const KEY = "synapse-shared-replicas";
const MEMORY = { adapter: "memory" };

const registry = () => JSON.parse(localStorage.getItem(KEY) ?? "[]") as Array<{ name: string; sub: string }>;

/** Una réplica en memoria con un documento: tras destruirla, al reabrir el nombre queda vacía. */
async function replica(sub: string) {
  const name = uniqueName("synapse-shared-test");
  const db = new PouchDB(name, MEMORY);
  await db.put({ _id: "doc", dato: "de otra persona" });
  rememberSharedReplica(name, sub);
  return name;
}
const docCount = async (name: string) => (await new PouchDB(name, MEMORY).info()).doc_count;

beforeEach(() => localStorage.clear());
afterEach(() => {
  hook.destroy = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("el registro", () => {
  it("anota sin duplicar y olvida por nombre", () => {
    rememberSharedReplica("a", "u1");
    rememberSharedReplica("a", "u1");
    rememberSharedReplica("b", "u2");
    expect(registry()).toEqual([{ name: "a", sub: "u1" }, { name: "b", sub: "u2" }]);
    forgetSharedReplica("a");
    expect(registry()).toEqual([{ name: "b", sub: "u2" }]);
  });

  it("tolera JSON dañado y entradas con otra forma", async () => {
    localStorage.setItem(KEY, "{no es json");
    rememberSharedReplica("a", "u1");
    expect(registry()).toEqual([{ name: "a", sub: "u1" }]);
    localStorage.setItem(KEY, JSON.stringify([{ name: 1 }, null, { name: "ok", sub: "u1" }, "x"]));
    await purgeSharedReplicas({ pouch: MEMORY });
    expect(registry()).toEqual([]);
  });

  it("con `localStorage` bloqueado no lanza", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("bloqueado"); });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("bloqueado"); });
    expect(() => rememberSharedReplica("a", "u1")).not.toThrow();
    expect(() => forgetSharedReplica("a")).not.toThrow();
    await expect(purgeSharedReplicas({ pouch: MEMORY })).resolves.toBeUndefined();
  });
});

describe("purgeSharedReplicas", () => {
  it("sin `exceptSub` destruye todas las anotadas y las quita del registro", async () => {
    const [a, b] = [await replica("u1"), await replica("u2")];
    expect(await docCount(a)).toBe(1);
    await purgeSharedReplicas({ pouch: MEMORY });
    expect([await docCount(a), await docCount(b)]).toEqual([0, 0]);
    expect(registry()).toEqual([]);
  });

  it("con `exceptSub` destruye las de otras cuentas y conserva las de esa", async () => {
    const [mine, theirs] = [await replica("u1"), await replica("u2")];
    await purgeSharedReplicas({ exceptSub: "u1", pouch: MEMORY });
    expect(await docCount(mine)).toBe(1);
    expect(await docCount(theirs)).toBe(0);
    expect(registry()).toEqual([{ name: mine, sub: "u1" }]);
  });

  it("una réplica que no se destruye sigue anotada y las demás se destruyen", async () => {
    const [first, second] = [await replica("u1"), await replica("u1")];
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    hook.destroy = (name, original) => (name === first ? Promise.reject(new Error("IndexedDB con error")) : original());
    await purgeSharedReplicas({ pouch: MEMORY });
    expect(registry()).toEqual([{ name: first, sub: "u1" }]);
    expect(await docCount(second)).toBe(0);
    expect(await docCount(first)).toBe(1);
    expect(console.error).toHaveBeenCalled();
  });

  it("no pierde una réplica que se anota mientras se purga", async () => {
    const first = await replica("u2");
    hook.destroy = (_name, original) => {
      rememberSharedReplica("llegó-tarde", "u1");
      return original();
    };
    await purgeSharedReplicas({ exceptSub: "u1", pouch: MEMORY });
    expect(registry()).toEqual([{ name: "llegó-tarde", sub: "u1" }]);
    expect(await docCount(first)).toBe(0);
  });
});

describe("el barrido de respaldo al cerrar sesión", () => {
  async function stored(name: string) {
    const db = new PouchDB(name, MEMORY);
    await db.put({ _id: "doc", dato: name });
  }

  it("destruye las compartidas que `indexedDB` conserva sin anotar y NUNCA la réplica principal", async () => {
    await stored("synapse-shared-sin-anotar");
    await stored("synapse");
    await stored("otra-base");
    vi.stubGlobal("indexedDB", { databases: async () => [{ name: "_pouch_synapse-shared-sin-anotar" }, { name: "_pouch_synapse" }, { name: "_pouch_otra-base" }, {}] });
    await purgeSharedReplicas({ pouch: MEMORY });
    expect(await docCount("synapse-shared-sin-anotar")).toBe(0);
    expect(await docCount("synapse")).toBe(1);
    expect(await docCount("otra-base")).toBe(1);
  });

  it("al entrar una cuenta (con `exceptSub`) no barre lo que no está anotado", async () => {
    await stored("synapse-shared-sin-anotar");
    vi.stubGlobal("indexedDB", { databases: async () => [{ name: "_pouch_synapse-shared-sin-anotar" }] });
    await purgeSharedReplicas({ exceptSub: "u1", pouch: MEMORY });
    expect(await docCount("synapse-shared-sin-anotar")).toBe(1);
  });

  it("si `indexedDB.databases` falla o no existe, no lanza", async () => {
    vi.stubGlobal("indexedDB", { databases: async () => { throw new Error("no disponible"); } });
    await expect(purgeSharedReplicas({ pouch: MEMORY })).resolves.toBeUndefined();
    vi.stubGlobal("indexedDB", {});
    await expect(purgeSharedReplicas({ pouch: MEMORY })).resolves.toBeUndefined();
  });
});
