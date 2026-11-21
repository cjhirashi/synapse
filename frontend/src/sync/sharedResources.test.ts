// Réplica local de una bóveda compartida (H-064 F7c): nombre propio, remota y cerrojo propios, registro de limpieza y almacenes de solo lectura.
import PouchDB from "pouchdb-browser";
import memory from "pouchdb-adapter-memory";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryDb, memoryEnv, uniqueName } from "../test-utils/sync";
import { createRemoteDb } from "./remote";
import { openSyncResources, type SyncResources } from "./resources";
import { ReadOnlyReplicaError } from "./readOnly";

PouchDB.plugin(memory);
vi.mock("./remote", async (original) => ({ ...(await original<typeof import("./remote")>()), createRemoteDb: vi.fn() }));

const VAULT = "11111111-1111-4111-8111-111111111111";
const opened: SyncResources[] = [];

beforeEach(() => {
  localStorage.clear();
  vi.mocked(createRemoteDb).mockReset().mockImplementation(() => memoryDb(uniqueName("remote")));
});
afterEach(async () => {
  await Promise.all(opened.splice(0).map((r) => r.close()));
});

async function open(sub: string, env: ReturnType<typeof memoryEnv>["env"], shared?: { vaultId: string }) {
  const resources = await openSyncResources(sub, env, shared);
  opened.push(resources);
  return resources;
}

// `createRemote` del entorno de pruebas sustituye a `createRemoteDb`; para ver el `path` real se quita.
const realRemoteEnv = () => {
  const { env, fake, localName } = memoryEnv();
  const { createRemote: _createRemote, ...rest } = env;
  return { env: rest, fake, localName };
};

describe("la réplica compartida", () => {
  it("vive en una base aparte con el nombre de la bóveda", async () => {
    const { env, localName } = memoryEnv();
    const shared = await open("u1", env, { vaultId: VAULT });
    expect(shared.db.name).toBe(`${localName}-shared-${VAULT}`);
    const own = await open("u1", env);
    expect(own.db.name).toBe(localName);
  });

  it("pide la remota con la ruta de la bóveda compartida; la propia, sin ruta", async () => {
    const { env } = realRemoteEnv();
    await open("u1", env, { vaultId: VAULT });
    expect(vi.mocked(createRemoteDb).mock.calls[0][0]).toMatchObject({ path: `/sync/shared/${VAULT}/db` });
    await open("u1", { ...env, localDb: { ...env.localDb, name: uniqueName("otra") } });
    expect(vi.mocked(createRemoteDb).mock.calls[1][0]).not.toHaveProperty("path");
  });

  it("su replicador tiene cerrojo y canal propios (la propia usa los de siempre)", async () => {
    const { env, fake } = memoryEnv();
    await open("u1", env, { vaultId: VAULT });
    expect(fake.create.mock.calls[0][0]).toMatchObject({ lockName: `synapse-sync-shared-${VAULT}`, channelName: `synapse-sync-shared-${VAULT}` });
    await open("u1", env);
    expect(fake.create.mock.calls[1][0]).not.toHaveProperty("lockName");
  });

  it("se anota para limpiarla; la propia no", async () => {
    const { env, localName } = memoryEnv();
    await open("u1", env);
    expect(localStorage.getItem("synapse-shared-replicas")).toBeNull();
    await open("u1", env, { vaultId: VAULT });
    expect(JSON.parse(localStorage.getItem("synapse-shared-replicas")!)).toEqual([{ name: `${localName}-shared-${VAULT}`, sub: "u1" }]);
  });

  it("no tiene el reintento dirigido de las bóvedas propias", async () => {
    const { env } = memoryEnv();
    expect((await open("u1", env, { vaultId: VAULT })).repush).toBeNull();
    expect((await open("u1", env)).repush).not.toBeNull();
  });

  it("no se mezcla con la réplica propia: lo escrito en una no aparece en la otra", async () => {
    const { env } = memoryEnv();
    const own = await open("u1", env);
    const shared = await open("u1", env, { vaultId: VAULT });
    await own.vaults.create({ name: "Mía", description: null, tags: [] });
    expect(await own.vaults.list()).toHaveLength(1);
    expect(await shared.vaults.list()).toHaveLength(0);
  });
});

describe("los almacenes de la réplica compartida son de solo lectura", () => {
  const NOTE_VAULT = "22222222-2222-4222-8222-222222222222";

  async function sharedWithData() {
    const { env } = memoryEnv();
    const shared = await open("u1", env, { vaultId: VAULT });
    await shared.db.put({ _id: `vault:${VAULT}`, type: "vault", name: "Compartida", description: null, tags: [], icon: null, attributes: null, owner_id: "dueño", created_at: "2026-11-20T00:00:00.000000Z", updated_at: "2026-11-20T00:00:00.000000Z", deleted_at: null });
    const id = `note:${NOTE_VAULT}:33333333-3333-4333-8333-333333333333`;
    await shared.db.put({ _id: id, type: "note", vault_id: NOTE_VAULT, path: "Pub/a.md", frontmatter: {}, content: "# a", created_at: "2026-11-20T00:00:00.000000Z", updated_at: "2026-11-20T00:00:00.000000Z", deleted_at: null });
    return { shared, noteId: id };
  }

  it("lee bóvedas y notas", async () => {
    const { shared, noteId } = await sharedWithData();
    expect((await shared.vaults.list()).map((v) => v.name)).toEqual(["Compartida"]);
    expect((await shared.vaults.get(VAULT)).owner_id).toBe("dueño");
    expect((await shared.notes.list(NOTE_VAULT)).map((n) => n.path)).toEqual(["Pub/a.md"]);
    expect((await shared.notes.get(noteId)).content).toBe("# a");
  });

  it("cada operación de escritura rechaza y la réplica no cambia", async () => {
    const { shared, noteId } = await sharedWithData();
    const before = (await shared.db.info()).update_seq;
    const writes: Array<() => Promise<unknown>> = [
      () => shared.vaults.create({ name: "X", description: null, tags: [] }),
      () => shared.vaults.update(VAULT, { name: "Y" }, "1-x"),
      () => shared.vaults.setAttributes(VAULT, null, "1-x"),
      () => shared.vaults.softDelete(VAULT, "1-x"),
      () => shared.vaults.restore(VAULT, "1-x"),
      () => shared.notes.create(NOTE_VAULT, "Nueva"),
      () => shared.notes.createTemplate(NOTE_VAULT, "Plantilla"),
      () => shared.notes.rename(noteId, "Pub/b.md", "1-x"),
      () => shared.notes.moveFolder(NOTE_VAULT, "Pub", "Otra"),
      () => shared.notes.renameFolder(NOTE_VAULT, "Pub", "Otra"),
      () => shared.notes.softDeleteFolder(NOTE_VAULT, "Pub"),
      () => shared.notes.softDelete(noteId, "1-x"),
      () => shared.notes.restore(noteId, "1-x"),
      () => shared.notes.createFolder(NOTE_VAULT, "Nueva"),
      () => shared.notes.ensureIndexes(NOTE_VAULT),
      () => shared.notes.save(noteId, "cambiado", "1-x"),
    ];
    for (const write of writes) await expect(write()).rejects.toBeInstanceOf(ReadOnlyReplicaError);
    expect((await shared.db.info()).update_seq).toBe(before);
  });

  it("la réplica propia sigue escribiendo", async () => {
    const { env } = memoryEnv();
    const own = await open("u1", env);
    await expect(own.vaults.create({ name: "Mía", description: null, tags: [] })).resolves.toMatchObject({ name: "Mía" });
  });
});
