// ¿Está activa una bóveda en la réplica? (SPEC-0008 RF-009, RF-014; PLAN-0008 §10 RD-1, P-9).
import PouchDB from "pouchdb-browser";
import memory from "pouchdb-adapter-memory";
import { vaultIsActive } from "./vaultActive";

PouchDB.plugin(memory);

const V = "11111111-1111-4111-8111-111111111111";
const T = "2026-10-22T10:00:00.000000Z";

let counter = 0;
let db: PouchDB.Database;

beforeEach(() => {
  counter += 1;
  db = new PouchDB(`vault-active-test-${counter}`, { adapter: "memory" });
});

/** Inserta una hoja tal como la trae la replicación; a igual profundidad gana el hash mayor. */
async function leaf(hash: string, deletedAt: string | null, deleted = false): Promise<void> {
  await db.bulkDocs(
    [{
      _id: `vault:${V}`, _rev: `1-${hash}`, _revisions: { start: 1, ids: [hash] }, type: "vault", name: "N",
      description: null, tags: [], owner_id: "u", created_at: T, updated_at: T, deleted_at: deletedAt,
      ...(deleted ? { _deleted: true } : {}),
    }] as PouchDB.Core.PutDocument<{}>[],
    { new_edits: false },
  );
}

describe("RF-014: vaultIsActive (P-9, todas las ramas vivas)", () => {
  it("una bóveda activa es activa", async () => {
    await leaf("aaaa", null);
    expect(await vaultIsActive(db, V)).toBe(true);
  });

  it("una bóveda en la papelera no es activa", async () => {
    await leaf("aaaa", T);
    expect(await vaultIsActive(db, V)).toBe(false);
  });

  it("una bóveda inexistente no es activa", async () => {
    expect(await vaultIsActive(db, V)).toBe(false);
  });

  it("RF-009: ganadora en la papelera y perdedora activa es activa", async () => {
    await leaf("ffff", T); // ganadora
    await leaf("1111", null); // perdedora viva
    expect(await vaultIsActive(db, V)).toBe(true);
  });

  it("RF-009: ganadora activa y perdedora en la papelera es activa", async () => {
    await leaf("ffff", null);
    await leaf("1111", T);
    expect(await vaultIsActive(db, V)).toBe(true);
  });

  it("ambas ramas en la papelera no es activa", async () => {
    await leaf("ffff", T);
    await leaf("1111", T);
    expect(await vaultIsActive(db, V)).toBe(false);
  });

  it("una rama cerrada (lápida) no cuenta aunque su cuerpo dijera activa", async () => {
    await leaf("ffff", T);
    await leaf("1111", null, true);
    expect(await vaultIsActive(db, V)).toBe(false);
  });
});
