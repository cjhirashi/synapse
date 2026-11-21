// Escribir como invitado en una réplica compartida (H-064 F7d): solo donde hay escritura, sin mover y sin tocar nada más.
import PouchDB from "pouchdb-browser";
import memory from "pouchdb-adapter-memory";
import { afterEach, describe, expect, it } from "vitest";
import { memoryEnv } from "../test-utils/sync";
import type { Grant } from "../sharing/sharingApi";
import { ReadOnlyReplicaError } from "./readOnly";
import { openSyncResources, type SyncResources } from "./resources";
import { guardSharedDb, SharedWriteDeniedError } from "./sharedWriteGuard";

PouchDB.plugin(memory);

const VAULT = "11111111-1111-4111-8111-111111111111";
const OTHER_VAULT = "22222222-2222-4222-8222-222222222222";
const GRANTS: Grant[] = [{ folder: "Pub", level: "lectura" }, { folder: "Docs", level: "escritura" }];
const STAMP = "2026-11-20T00:00:00.000000Z";
const opened: SyncResources[] = [];
afterEach(async () => { await Promise.all(opened.splice(0).map((r) => r.close())); });

const noteDoc = (path: string, over: object = {}) => ({
  _id: `note:${VAULT}:${crypto.randomUUID()}`, type: "note", vault_id: VAULT, path, frontmatter: {}, content: "# original",
  created_at: STAMP, updated_at: STAMP, deleted_at: null, ...over,
});

async function guestWith(grants: readonly Grant[], seed: Array<ReturnType<typeof noteDoc>> = []) {
  const { env } = memoryEnv();
  const res = await openSyncResources("u1", env, { vaultId: VAULT, grants });
  opened.push(res);
  for (const doc of seed) await res.db.put(doc);
  const rev = async (id: string) => (await res.db.get<{ _rev: string }>(id))._rev;
  const stored = async (id: string) => res.db.get<{ path: string; content: string; deleted_at: string | null }>(id);
  return { res, rev, stored };
}

describe("el almacén de notas del invitado con escritura", () => {
  it("crea y guarda en una carpeta con escritura, y la nota queda en la réplica", async () => {
    const { res } = await guestWith(GRANTS);
    const created = await res.notes.create(VAULT, "Docs/Nueva");
    expect(created.path).toBe("Docs/Nueva.md");
    const saved = await res.notes.save(created.id, "# escrito por el invitado", created.rev);
    expect(saved.content).toBe("# escrito por el invitado");
    expect((await res.notes.list(VAULT)).map((n) => n.path)).toEqual(["Docs/Nueva.md"]);
  });

  it("no escribe INDICEs: crear una nota no deja documentos extra (el servidor rechazaría el de la raíz)", async () => {
    const { res } = await guestWith(GRANTS);
    await res.notes.create(VAULT, "Docs/Sub/Profunda");
    expect((await res.db.allDocs({ startkey: "note:", endkey: "note:￰" })).rows).toHaveLength(1);
  });

  it("no crea donde solo lee, ni en la raíz, ni en las zonas del sistema", async () => {
    const { res } = await guestWith(GRANTS);
    // Las zonas del sistema ya las rechaza la validación del almacén (otro error); las demás, la guarda.
    for (const title of ["Pub/Nueva", "Nueva", "Otra/Nueva"]) await expect(res.notes.create(VAULT, title), title).rejects.toBeInstanceOf(SharedWriteDeniedError);
    for (const title of ["BITACORA/x", "AG - AGENTES/x", "PLANTILLAS/x"]) await expect(res.notes.create(VAULT, title), title).rejects.toThrow();
    expect((await res.db.allDocs({ startkey: "note:", endkey: "note:￰" })).rows).toHaveLength(0);
  });

  it("no guarda ni borra una nota que solo puede leer", async () => {
    const readable = noteDoc("Pub/a.md");
    const { res, rev, stored } = await guestWith(GRANTS, [readable]);
    await expect(res.notes.save(readable._id, "# cambiado", await rev(readable._id))).rejects.toBeInstanceOf(SharedWriteDeniedError);
    await expect(res.notes.softDelete(readable._id, await rev(readable._id))).rejects.toBeInstanceOf(SharedWriteDeniedError);
    expect((await stored(readable._id)).content).toBe("# original");
    expect((await stored(readable._id)).deleted_at).toBeNull();
  });

  it("borra y restaura una nota donde puede escribir", async () => {
    const mine = noteDoc("Docs/a.md");
    const { res, rev, stored } = await guestWith(GRANTS, [mine]);
    const deleted = await res.notes.softDelete(mine._id, await rev(mine._id));
    expect(deleted.deleted_at).not.toBeNull();
    await res.notes.restore(mine._id, await rev(mine._id));
    expect((await stored(mine._id)).deleted_at).toBeNull();
  });

  it("guarda sobre una revisión desfasada como rama (conflicto) sin perder lo escrito ni cambiar la ruta", async () => {
    const mine = noteDoc("Docs/a.md");
    const { res, rev } = await guestWith(GRANTS, [mine]);
    const base = await rev(mine._id);
    await res.notes.save(mine._id, "# primero", base);
    const branch = await res.notes.save(mine._id, "# desde la revisión vieja", base);
    expect(branch.path).toBe("Docs/a.md");
    const withConflicts = await res.db.get<{ _conflicts?: string[] }>(mine._id, { conflicts: true });
    expect(withConflicts._conflicts).toHaveLength(1);
  });

  it("mover, renombrar, carpetas, plantillas e índices siguen siendo del propietario", async () => {
    const mine = noteDoc("Docs/a.md");
    const { res, rev, stored } = await guestWith(GRANTS, [mine]);
    const writes: Array<() => Promise<unknown>> = [
      async () => res.notes.rename(mine._id, "Docs/b.md", await rev(mine._id)),
      () => res.notes.moveFolder(VAULT, "Docs", "Otra"),
      () => res.notes.renameFolder(VAULT, "Docs", "Otra"),
      () => res.notes.softDeleteFolder(VAULT, "Docs"),
      () => res.notes.createFolder(VAULT, "Docs/Nueva"),
      () => res.notes.createTemplate(VAULT, "Plantilla"),
      () => res.notes.ensureIndexes(VAULT),
      () => res.vaults.update(VAULT, { name: "X" }, "1-x"),
    ];
    for (const write of writes) await expect(write()).rejects.toBeInstanceOf(ReadOnlyReplicaError);
    expect((await stored(mine._id)).path).toBe("Docs/a.md");
  });
});

describe("sin concesión de escritura la réplica sigue de solo lectura", () => {
  it("con solo lectura, nada escribe", async () => {
    const { res } = await guestWith([{ folder: "*", level: "lectura" }]);
    await expect(res.notes.create(VAULT, "Docs/Nueva")).rejects.toBeInstanceOf(ReadOnlyReplicaError);
  });
  it("sin concesiones, nada escribe", async () => {
    const { res } = await guestWith([]);
    await expect(res.notes.create(VAULT, "Docs/Nueva")).rejects.toBeInstanceOf(ReadOnlyReplicaError);
  });
});

describe("la guarda de la base, sola, por si algo la rodeara", () => {
  async function guarded(grants: readonly Grant[] = GRANTS) {
    const db = new PouchDB(`guard-${crypto.randomUUID()}`, { adapter: "memory" });
    return { db, guard: guardSharedDb(db, VAULT, grants) };
  }

  it("deja pasar lecturas y rechaza todo lo que no es escritura vigilada", async () => {
    const { db, guard } = await guarded();
    await db.put({ _id: "doc-cualquiera" });
    expect((await guard.get<{ _id: string }>("doc-cualquiera"))._id).toBe("doc-cualquiera");
    expect((await guard.allDocs()).rows).toHaveLength(1);
    await expect((guard as unknown as { destroy(): Promise<void> }).destroy()).rejects.toBeInstanceOf(SharedWriteDeniedError);
    await expect((guard as unknown as { compact(): Promise<void> }).compact()).rejects.toBeInstanceOf(SharedWriteDeniedError);
    await expect(guard.remove("doc-cualquiera", (await db.get("doc-cualquiera"))._rev)).rejects.toBeInstanceOf(SharedWriteDeniedError);
    await expect(guard.post({ nota: 1 })).rejects.toBeInstanceOf(SharedWriteDeniedError);
    expect((await db.info()).doc_count).toBe(1);
  });

  it("rechaza documentos que no son notas de esta bóveda: la bóveda, otra bóveda, otros ids", async () => {
    const { db, guard } = await guarded();
    for (const doc of [
      { _id: `vault:${VAULT}`, path: "Docs/x.md" }, { _id: `note:${OTHER_VAULT}:${crypto.randomUUID()}`, path: "Docs/x.md" },
      { _id: "_local/x", path: "Docs/x.md" }, { _id: "otro", path: "Docs/x.md" },
    ]) await expect(guard.put(doc)).rejects.toMatchObject({ reason: "vault" });
    expect((await db.info()).doc_count).toBe(0);
  });

  it("rechaza una ruta que falta o no es texto, y una lápida (no hay `path`)", async () => {
    const { guard } = await guarded();
    const id = `note:${VAULT}:${crypto.randomUUID()}`;
    for (const doc of [{ _id: id }, { _id: id, path: 5 }, { _id: id, _deleted: true }]) await expect(guard.put(doc as never)).rejects.toBeInstanceOf(SharedWriteDeniedError);
  });

  it("un lote se rechaza entero si uno solo no pasa: ninguno se escribe", async () => {
    const { db, guard } = await guarded();
    const good = { _id: `note:${VAULT}:${crypto.randomUUID()}`, path: "Docs/a.md" };
    const bad = { _id: `note:${VAULT}:${crypto.randomUUID()}`, path: "Pub/b.md" };
    await expect(guard.bulkDocs([good, bad])).rejects.toBeInstanceOf(SharedWriteDeniedError);
    expect((await db.info()).doc_count).toBe(0);
  });

  it("no cambia la ruta de una nota existente ni la «roba» de donde no escribe", async () => {
    const { db, guard } = await guarded();
    const mine = { _id: `note:${VAULT}:${crypto.randomUUID()}`, path: "Docs/a.md" };
    const theirs = { _id: `note:${VAULT}:${crypto.randomUUID()}`, path: "Pub/p.md" };
    const mineRev = (await db.put(mine)).rev;
    const theirsRev = (await db.put(theirs)).rev;
    await expect(guard.put({ ...mine, _rev: mineRev, path: "Docs/b.md" })).rejects.toMatchObject({ reason: "move" });
    await expect(guard.put({ ...theirs, _rev: theirsRev, path: "Docs/robada.md" })).rejects.toMatchObject({ reason: "path" });
    await expect(guard.put({ ...mine, _rev: mineRev, path: "Pub/x.md" })).rejects.toMatchObject({ reason: "path" });
    expect((await db.get<{ path: string }>(mine._id)).path).toBe("Docs/a.md");
    expect((await db.get<{ path: string }>(theirs._id)).path).toBe("Pub/p.md");
  });

  it("deja escribir donde hay escritura, también como rama con new_edits:false", async () => {
    const { db, guard } = await guarded();
    const doc = { _id: `note:${VAULT}:${crypto.randomUUID()}`, path: "Docs/a.md", content: "uno" };
    const rev = (await guard.put(doc) as { rev: string }).rev;
    await guard.put({ ...doc, _rev: rev, content: "dos" });
    await guard.bulkDocs([{ ...doc, _rev: `2-${"a".repeat(32)}`, _revisions: { start: 2, ids: ["a".repeat(32), rev.split("-")[1]] }, content: "rama" }], { new_edits: false });
    expect((await db.info()).doc_count).toBe(1);
  });

  it("los nombres cuentan con la misma equivalencia que el servidor (mayúsculas y ancho completo)", async () => {
    const { guard } = await guarded();
    for (const path of ["docs/a.md", "DOCS/A.MD", "ｄocs/a.md"]) await expect(guard.put({ _id: `note:${VAULT}:${crypto.randomUUID()}`, path })).resolves.toBeDefined();
    for (const path of ["pub/a.md", "bitacora/a.md"]) await expect(guard.put({ _id: `note:${VAULT}:${crypto.randomUUID()}`, path })).rejects.toBeInstanceOf(SharedWriteDeniedError);
  });
});
