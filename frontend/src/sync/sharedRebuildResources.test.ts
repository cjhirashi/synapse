// Reconstruir la réplica compartida cuando cambian las concesiones (H-064 F7e).
import PouchDB from "pouchdb-browser";
import memory from "pouchdb-adapter-memory";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Grant } from "../sharing/sharingApi";
import { memoryDb, memoryEnv, uniqueName } from "../test-utils/sync";
import { openSyncResources, type SyncResources } from "./resources";
import { storedGrantsKey } from "./sharedRebuild";

PouchDB.plugin(memory);

const VAULT = "11111111-1111-4111-8111-111111111111";
const NOTE = `note:${VAULT}:00000001-0000-4000-8000-000000000000`;
const READ_PUB: Grant[] = [{ folder: "Pub", level: "lectura" }];
const READ_PUB_DOCS: Grant[] = [{ folder: "Pub", level: "lectura" }, { folder: "Docs", level: "lectura" }];
const opened: SyncResources[] = [];

beforeEach(() => localStorage.clear());
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(opened.splice(0).map((r) => r.close()));
});

/** Abre y cierra la réplica compartida `times` veces con el mismo entorno (misma réplica en memoria). */
function setup() {
  const { env, fake } = memoryEnv();
  const remote = memoryDb(uniqueName("remote"));
  const open = async (grants: readonly Grant[], extra: { rebuild?: boolean } = {}) => {
    const res = await openSyncResources("u1", { ...env, createRemote: () => remote }, { vaultId: VAULT, grants, ...extra });
    opened.push(res);
    return res;
  };
  const close = async (res: SyncResources) => { await res.close(); opened.splice(opened.indexOf(res), 1); };
  return { open, close, remote, fake };
}

const put = (res: SyncResources, content: string) => res.db.put({ _id: NOTE, type: "note", vault_id: VAULT, path: "Pub/a.md", content });
const has = (res: SyncResources) => res.db.get(NOTE).then(() => true, () => false);

describe("abrir la réplica compartida", () => {
  it("la primera vez guarda la marca de concesiones y no reconstruye", async () => {
    const { open } = setup();
    const res = await open(READ_PUB);
    expect(await storedGrantsKey(res.db)).not.toBeNull();
    expect(res.discarded).toBe(0);
  });

  it("con las mismas concesiones (en otro orden) conserva la réplica", async () => {
    const { open, close } = setup();
    const first = await open(READ_PUB_DOCS);
    await put(first, "local");
    await close(first);
    const again = await open([...READ_PUB_DOCS].reverse());
    expect(await has(again)).toBe(true);
  });

  it("con otras concesiones sube lo pendiente, destruye la réplica y la deja vacía con la marca nueva", async () => {
    const { open, close, remote } = setup();
    const first = await open(READ_PUB);
    await put(first, "pendiente de subir");
    await close(first);
    const rebuilt = await open(READ_PUB_DOCS);
    expect(await has(rebuilt)).toBe(false);
    expect((await remote.get<{ content: string }>(NOTE)).content).toBe("pendiente de subir");
    expect(await storedGrantsKey(rebuilt.db)).toContain("Docs");
  });

  it("`rebuild` reconstruye aunque las concesiones no hayan cambiado", async () => {
    const { open, close } = setup();
    const first = await open(READ_PUB);
    await put(first, "x");
    await close(first);
    expect(await has(await open(READ_PUB, { rebuild: true }))).toBe(false);
  });

  it("sin conexión NO reconstruye: conserva la réplica y la marca vieja, para reintentar al volver", async () => {
    const { open, close, remote } = setup();
    const first = await open(READ_PUB);
    await put(first, "pendiente");
    const oldKey = await storedGrantsKey(first.db);
    await close(first);
    vi.spyOn(remote, "revsDiff").mockRejectedValue(Object.assign(new Error("sin red"), { status: 503 }));
    vi.spyOn(remote, "bulkDocs").mockRejectedValue(Object.assign(new Error("sin red"), { status: 503 }));
    const offline = await open(READ_PUB_DOCS);
    expect(await has(offline)).toBe(true);
    expect(await storedGrantsKey(offline.db)).toBe(oldKey);
  });

  it("la réplica propia (sin `shared`) no sabe nada de esto", async () => {
    const { env } = memoryEnv();
    const own = await openSyncResources("u1", env);
    opened.push(own);
    expect(await storedGrantsKey(own.db)).toBeNull();
    expect(own.discarded).toBe(0);
  });

  it("avisa de que se puso al día solo cuando termina de bajar (no sin conexión ni al subir)", async () => {
    const { env, fake } = memoryEnv();
    const onCaughtUp = vi.fn();
    opened.push(await openSyncResources("u1", env, { vaultId: VAULT, grants: READ_PUB, onCaughtUp }));
    fake.emit({ type: "paused", direction: "push", offline: false });
    fake.emit({ type: "paused", direction: "pull", offline: true });
    fake.emit({ type: "active", direction: "pull" });
    expect(onCaughtUp).not.toHaveBeenCalled();
    fake.emit({ type: "paused", direction: "pull", offline: false });
    expect(onCaughtUp).toHaveBeenCalledTimes(1);
  });
});
