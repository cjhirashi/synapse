// Estado de la sincronización (SPEC-0005 RF-009, RF-010, RF-019; PLAN-0005 §2.5).
import PouchDB from "pouchdb-browser";
import memory from "pouchdb-adapter-memory";
import { SYNC_STATE_DOC_ID, openSyncStatus, type SyncStatusStore } from "./status";

PouchDB.plugin(memory);

const T1 = "2026-10-13T10:00:00.000000Z";
const T2 = "2026-10-13T11:00:00.000000Z";

let counter = 0;
let db: PouchDB.Database;
const opened: SyncStatusStore[] = [];

beforeEach(() => {
  counter += 1;
  db = new PouchDB(`status-test-${counter}`, { adapter: "memory" });
});

afterEach(() => {
  opened.splice(0).forEach((store) => store.close());
});

async function open(now = () => T1): Promise<SyncStatusStore> {
  const store = await openSyncStatus(db, { now });
  opened.push(store);
  return store;
}

/** Ambos sentidos al día: lo que emite PouchDB tras una sincronización correcta. */
async function caughtUp(store: SyncStatusStore): Promise<void> {
  await store.handle({ type: "paused", direction: "push", offline: false });
  await store.handle({ type: "paused", direction: "pull", offline: false });
}

describe("transiciones", () => {
  it("empieza 'sincronizando' (intentando), sin pendientes y sin hora de última sync", async () => {
    expect((await open()).current()).toEqual({ state: "syncing", pending: false, lastSyncAt: null });
  });

  it("al día en ambos sentidos → en línea, con la hora persistida", async () => {
    const store = await open();
    await store.handle({ type: "paused", direction: "push", offline: false });
    expect(store.current().state).toBe("syncing"); // falta el pull
    await store.handle({ type: "paused", direction: "pull", offline: false });
    expect(store.current()).toEqual({ state: "online", pending: false, lastSyncAt: T1 });
    expect(await db.get(SYNC_STATE_DOC_ID)).toMatchObject({ last_sync_at: T1 });
  });

  it("RF-019: 503 o sin respuesta en cualquier sentido → sin conexión; al reanudar → sincronizando", async () => {
    const store = await open();
    await caughtUp(store);
    await store.handle({ type: "paused", direction: "pull", offline: true });
    expect(store.current().state).toBe("offline");
    await store.handle({ type: "active", direction: "pull" });
    expect(store.current().state).toBe("syncing");
    await store.handle({ type: "paused", direction: "pull", offline: false });
    expect(store.current().state).toBe("online");
  });

  it("un error que PouchDB no reintenta se muestra como sin conexión", async () => {
    const store = await open();
    await caughtUp(store);
    await store.handle({ type: "error", message: "boom" });
    expect(store.current().state).toBe("offline");
  });

  it("RF-016: sesión caducada hasta que la replicación vuelve a estar activa", async () => {
    const store = await open();
    await caughtUp(store);
    await store.handle({ type: "session-expired" });
    expect(store.current().state).toBe("session-expired");
    await store.handle({ type: "paused", direction: "push", offline: true });
    expect(store.current().state).toBe("session-expired");
    await store.handle({ type: "active", direction: "push" });
    expect(store.current().state).toBe("syncing");
  });

  it("la hora de la última sync sólo cambia con una sincronización correcta", async () => {
    let now = T1;
    const store = await open(() => now);
    await caughtUp(store);
    now = T2;
    await store.handle({ type: "paused", direction: "push", offline: true });
    await store.handle({ type: "paused", direction: "pull", offline: true });
    expect(store.current().lastSyncAt).toBe(T1);
  });
});

describe("RF-010: cambios pendientes hasta que el servidor los confirme", () => {
  it("una escritura local queda pendiente hasta el checkpoint del push que la cubre", async () => {
    const store = await open();
    await caughtUp(store);
    await db.put({ _id: "vault:1", name: "Notas" });
    await vi.waitFor(() => expect(store.current()).toMatchObject({ state: "pending", pending: true }));

    const seq = (await db.info()).update_seq;
    await store.handle({ type: "checkpoint", seq });
    expect(store.current()).toMatchObject({ state: "online", pending: false });
  });

  it("sin conexión con pendientes: estado sin conexión y la marca de pendientes", async () => {
    const store = await open();
    await db.put({ _id: "vault:1", name: "Notas" });
    await store.handle({ type: "paused", direction: "push", offline: true });
    await vi.waitFor(() => expect(store.current()).toMatchObject({ state: "offline", pending: true }));
  });

  it("los pendientes y la hora sobreviven a recargar (`_local/synapse-sync-state`)", async () => {
    const first = await open();
    await db.put({ _id: "vault:1", name: "Notas" });
    await first.handle({ type: "checkpoint", seq: (await db.info()).update_seq });
    await caughtUp(first);
    await db.put({ _id: "vault:2", name: "Sin subir" });
    first.close();

    const reloaded = await open(() => T2);
    expect(reloaded.current()).toEqual({ state: "syncing", pending: true, lastSyncAt: T1 });
  });

  it("un checkpoint anterior no hace retroceder la secuencia confirmada", async () => {
    const store = await open();
    await db.put({ _id: "vault:1", name: "Notas" });
    const seq = (await db.info()).update_seq as number;
    await store.handle({ type: "checkpoint", seq });
    await store.handle({ type: "checkpoint", seq: seq - 1 });
    expect(store.current().pending).toBe(false);
    expect(await db.get(SYNC_STATE_DOC_ID)).toMatchObject({ push_seq: seq });
  });
});

describe("suscripción y varias pestañas", () => {
  it("avisa a los suscriptores en cada cambio y deja de hacerlo al desuscribirse", async () => {
    const store = await open();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    await store.handle({ type: "paused", direction: "push", offline: true });
    expect(listener).toHaveBeenLastCalledWith({ state: "offline", pending: false, lastSyncAt: null });
    unsubscribe();
    await store.handle({ type: "active", direction: "push" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("no avisa si el estado no cambió (backlog 8)", async () => {
    const store = await open();
    await caughtUp(store);
    const listener = vi.fn();
    store.subscribe(listener);
    await db.put({ _id: "vault:11111111-1111-4111-8111-111111111111", type: "vault" });
    await store.refresh();
    expect(listener).toHaveBeenCalledTimes(1);
    // Releer la misma secuencia (como hace el feed tras un `refresh()`) no vuelve a avisar.
    await store.refresh();
    await store.handle({ type: "error", message: "caído" });
    await store.handle({ type: "error", message: "caído" });
    expect(listener.mock.calls.map(([status]) => status.state)).toEqual(["pending", "offline"]);
  });

  it("avisa si sólo cambia la hora de la última sincronización", async () => {
    const times = [T1, T2];
    const store = await open(() => times.shift() ?? T2);
    await caughtUp(store);
    const listener = vi.fn();
    store.subscribe(listener);
    await caughtUp(store);
    expect(listener).toHaveBeenLastCalledWith({ state: "online", pending: false, lastSyncAt: T2 });
  });

  it("dos pestañas que procesan los mismos eventos escriben el estado sin conflicto", async () => {
    const a = await open();
    const b = await open(() => T2);
    await db.put({ _id: "vault:1", name: "Notas" });
    const seq = (await db.info()).update_seq;
    await Promise.all([a.handle({ type: "checkpoint", seq }), b.handle({ type: "checkpoint", seq }), caughtUp(a), caughtUp(b)]);
    expect(await db.get(SYNC_STATE_DOC_ID)).toMatchObject({ push_seq: seq, last_sync_at: T2 });
  });
});

describe("refresh (VC-4, enmienda 1)", () => {
  it("relee la secuencia local sin esperar al feed y avisa del pendiente", async () => {
    const store = await open();
    await caughtUp(store);
    const seen: boolean[] = [];
    store.subscribe((status) => seen.push(status.pending));
    await db.put({ _id: "vault:11111111-1111-4111-8111-111111111111", type: "vault" });
    // Justo después de escribir, antes de que el feed de cambios lo procese.
    expect(await store.refresh()).toEqual({ state: "pending", pending: true, lastSyncAt: T1 });
    expect(store.current().pending).toBe(true);
    expect(seen).toContain(true);
  });

  it("sin cambios nuevos devuelve el mismo estado", async () => {
    const store = await open();
    await caughtUp(store);
    expect(await store.refresh()).toEqual({ state: "online", pending: false, lastSyncAt: T1 });
  });
});

describe("persistencia tras un fallo", () => {
  it("una escritura fallida del estado no bloquea las siguientes", async () => {
    const store = await open();
    const put = vi.spyOn(db, "put").mockRejectedValueOnce(new Error("disco lleno"));
    await expect(store.handle({ type: "checkpoint", seq: 1 })).rejects.toThrow("disco lleno");
    put.mockRestore();
    await store.handle({ type: "checkpoint", seq: 2 });
    expect(await db.get<{ push_seq: number }>(SYNC_STATE_DOC_ID)).toMatchObject({ push_seq: 2 });
  });
});
