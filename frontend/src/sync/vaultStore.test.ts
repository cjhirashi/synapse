// Operaciones de la UI sobre la réplica local (SPEC-0005 RF-009, RF-011; PLAN-0005 §2.5).
import PouchDB from "pouchdb-browser";
import memory from "pouchdb-adapter-memory";
import {
  StorageFullError, VaultChangedError, VaultNameTakenError, VaultNotFoundError, VaultValidationError,
  createVaultStore, utcNow, type VaultStore,
} from "./vaultStore";

PouchDB.plugin(memory);

const OWNER = "owner-1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

let counter = 0;
let db: PouchDB.Database;
let store: VaultStore;
let clock: string[];

/** Reloj de prueba: cada lectura devuelve la siguiente marca (con el formato de `utc_now`). */
function nextTime(): string {
  const value = clock.shift();
  if (value === undefined) throw new Error("reloj de prueba agotado");
  return value;
}

beforeEach(() => {
  counter += 1;
  db = new PouchDB(`vaultstore-test-${counter}`, { adapter: "memory" });
  clock = Array.from({ length: 20 }, (_, i) => `2026-10-13T10:00:${String(i).padStart(2, "0")}.000000Z`);
  store = createVaultStore(db, OWNER, { now: nextTime });
});

const input = (name: string, extra: object = {}) => ({ name, description: null, tags: [], ...extra });

describe("create", () => {
  it("guarda un documento de bóveda completo y normalizado", async () => {
    const vault = await store.create({ name: "  Notas ", description: "Mis notas", tags: ["Work", "work", " Home "] });
    expect(vault.id).toMatch(UUID);
    const doc = await db.get(`vault:${vault.id}`);
    expect(doc).toEqual({
      _id: `vault:${vault.id}`, _rev: vault.rev, type: "vault", name: "Notas", description: "Mis notas",
      tags: ["work", "home"], owner_id: OWNER, created_at: "2026-10-13T10:00:00.000000Z",
      updated_at: "2026-10-13T10:00:00.000000Z", deleted_at: null,
    });
  });

  it("rechaza campos inválidos con la lista de campos, sin escribir", async () => {
    const err = await store.create({ name: " ", description: null, tags: Array(21).fill("a") }).catch((e) => e);
    expect(err).toBeInstanceOf(VaultValidationError);
    expect(err.fields).toEqual(["name", "tags"]);
    expect((await db.info()).doc_count).toBe(0);
  });

  it("nombre equivalente al de otra bóveda activa → nombre ocupado", async () => {
    await store.create(input("Straße"));
    await expect(store.create(input("STRASSE"))).rejects.toBeInstanceOf(VaultNameTakenError);
  });

  it("el nombre de una bóveda en la papelera queda libre", async () => {
    const first = await store.create(input("Notas"));
    await store.softDelete(first.id, first.rev);
    await expect(store.create(input("notas"))).resolves.toMatchObject({ name: "notas" });
  });
});

describe("get y list", () => {
  it("get devuelve la bóveda activa; inexistente o en la papelera → no encontrada", async () => {
    const vault = await store.create(input("Notas"));
    expect(await store.get(vault.id)).toEqual(vault);
    await expect(store.get("00000000-0000-4000-8000-000000000000")).rejects.toBeInstanceOf(VaultNotFoundError);
    await store.softDelete(vault.id, vault.rev);
    await expect(store.get(vault.id)).rejects.toBeInstanceOf(VaultNotFoundError);
  });

  it("list ordena por created_at desc y _id desc, y separa activas de la papelera", async () => {
    const ids = ["00000000-0000-4000-8000-00000000000a", "00000000-0000-4000-8000-00000000000b", "00000000-0000-4000-8000-00000000000c"];
    const fixed = createVaultStore(db, OWNER, { now: () => "2026-10-13T10:00:00.000000Z", newId: () => ids.shift()! });
    await fixed.create(input("A"));
    await fixed.create(input("B"));
    const later = createVaultStore(db, OWNER, { now: () => "2026-10-13T11:00:00.000000Z", newId: () => ids.shift()! });
    const c = await later.create(input("C"));
    await later.softDelete(c.id, c.rev);

    expect((await store.list()).map((v) => v.name)).toEqual(["B", "A"]);
    expect((await store.list({ deleted: true })).map((v) => v.name)).toEqual(["C"]);
  });

  it("no lista documentos que no son bóvedas", async () => {
    await db.put({ _id: "other:1", type: "note" });
    expect(await store.list()).toEqual([]);
  });
});

describe("update", () => {
  it("aplica sólo los campos enviados, normaliza y renueva updated_at", async () => {
    const vault = await store.create(input("Notas", { description: "d", tags: ["a"] }));
    const updated = await store.update(vault.id, { tags: [" B ", "b"] }, vault.rev);
    expect(updated).toMatchObject({ name: "Notas", description: "d", tags: ["b"], updated_at: "2026-10-13T10:00:01.000000Z" });
    expect(updated.created_at).toBe(vault.created_at);
    expect(updated.rev).not.toBe(vault.rev);
  });

  it("description: null borra la descripción", async () => {
    const vault = await store.create(input("Notas", { description: "d" }));
    expect(await store.update(vault.id, { description: null }, vault.rev)).toMatchObject({ description: null });
  });

  it("renombrar a una forma equivalente de su propio nombre no choca consigo misma", async () => {
    const vault = await store.create(input("Notas"));
    await expect(store.update(vault.id, { name: "NOTAS" }, vault.rev)).resolves.toMatchObject({ name: "NOTAS" });
  });

  it("renombrar al nombre de otra bóveda activa → nombre ocupado", async () => {
    await store.create(input("Notas"));
    const other = await store.create(input("Diario"));
    await expect(store.update(other.id, { name: "notas" }, other.rev)).rejects.toBeInstanceOf(VaultNameTakenError);
  });

  it("con un _rev viejo → la bóveda cambió, sin escribir", async () => {
    const vault = await store.create(input("Notas"));
    const newer = await store.update(vault.id, { description: "x" }, vault.rev);
    await expect(store.update(vault.id, { description: "y" }, vault.rev)).rejects.toBeInstanceOf(VaultChangedError);
    expect(await store.get(vault.id)).toEqual(newer);
  });

  it("campos inválidos → error de validación", async () => {
    const vault = await store.create(input("Notas"));
    const err = await store.update(vault.id, { description: "x".repeat(2001) }, vault.rev).catch((e) => e);
    expect(err).toBeInstanceOf(VaultValidationError);
    expect(err.fields).toEqual(["description"]);
  });

  it("una bóveda en la papelera no se edita", async () => {
    const vault = await store.create(input("Notas"));
    await store.softDelete(vault.id, vault.rev);
    const trashed = (await store.list({ deleted: true }))[0];
    await expect(store.update(vault.id, { name: "Otra" }, trashed.rev)).rejects.toBeInstanceOf(VaultNotFoundError);
  });
});

describe("softDelete y restore (RF-011: viajan como cualquier edición)", () => {
  it("softDelete marca deleted_at y updated_at; restore lo quita", async () => {
    const vault = await store.create(input("Notas"));
    await store.softDelete(vault.id, vault.rev);
    const trashed = (await store.list({ deleted: true }))[0];
    expect(trashed).toMatchObject({ deleted_at: "2026-10-13T10:00:01.000000Z", updated_at: "2026-10-13T10:00:01.000000Z" });

    const restored = await store.restore(vault.id, trashed.rev);
    expect(restored).toMatchObject({ deleted_at: null, updated_at: "2026-10-13T10:00:02.000000Z" });
    expect(await store.list()).toEqual([restored]);
  });

  it("borrar es una revisión nueva, no una lápida de PouchDB", async () => {
    const vault = await store.create(input("Notas"));
    await store.softDelete(vault.id, vault.rev);
    expect(await db.get(`vault:${vault.id}`)).not.toHaveProperty("_deleted");
  });

  it("restaurar con el nombre ya usado por otra activa → nombre ocupado", async () => {
    const vault = await store.create(input("Notas"));
    await store.softDelete(vault.id, vault.rev);
    await store.create(input("NOTAS"));
    const trashed = (await store.list({ deleted: true }))[0];
    await expect(store.restore(vault.id, trashed.rev)).rejects.toBeInstanceOf(VaultNameTakenError);
  });

  it("_rev viejo al borrar o restaurar → la bóveda cambió", async () => {
    const vault = await store.create(input("Notas"));
    await store.update(vault.id, { description: "x" }, vault.rev);
    await expect(store.softDelete(vault.id, vault.rev)).rejects.toBeInstanceOf(VaultChangedError);
  });

  it("borrar una bóveda ya borrada o restaurar una activa → no encontrada", async () => {
    const vault = await store.create(input("Notas"));
    await expect(store.restore(vault.id, vault.rev)).rejects.toBeInstanceOf(VaultNotFoundError);
    await store.softDelete(vault.id, vault.rev);
    const trashed = (await store.list({ deleted: true }))[0];
    await expect(store.softDelete(vault.id, trashed.rev)).rejects.toBeInstanceOf(VaultNotFoundError);
  });
});

describe("almacenamiento", () => {
  it("cuota agotada del navegador → StorageFullError", async () => {
    // Así llega de IndexedDB a través de PouchDB: error genérico con el nombre de la causa.
    vi.spyOn(db, "put").mockRejectedValueOnce({ status: 500, name: "indexed_db_went_bad", reason: "QuotaExceededError" });
    await expect(store.create(input("Notas"))).rejects.toBeInstanceOf(StorageFullError);
  });

  it("utcNow tiene el formato de utc_now del servidor (microsegundos, Z)", () => {
    expect(utcNow()).toMatch(TIMESTAMP);
    expect(utcNow(new Date("2026-10-13T10:00:00.123Z"))).toBe("2026-10-13T10:00:00.123000Z");
  });
});
