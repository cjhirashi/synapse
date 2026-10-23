// Replicador de la réplica local (SPEC-0005 RF-010, RF-016, RF-019; R-10; PLAN-0005 §2.5).
import PouchDB from "pouchdb-browser";
import memory from "pouchdb-adapter-memory";
import { BATCH_SIZE, backOff, createReplicator, type Replicator, type SyncEvent } from "./replicator";
import { waitForCondition } from "../test-utils/waits";

PouchDB.plugin(memory);

let counter = 0;
let local: PouchDB.Database;
let remote: PouchDB.Database;
let channelName: string;
const running: Replicator[] = [];

beforeEach(() => {
  counter += 1;
  local = new PouchDB(`replicator-local-${counter}`, { adapter: "memory" });
  remote = new PouchDB(`replicator-remote-${counter}`, { adapter: "memory" });
  channelName = `replicator-test-${counter}`;
});

afterEach(async () => {
  await Promise.all(running.splice(0).map((replicator) => replicator.stop()));
});

/** Crea un replicador que se detiene al final del test, con sus eventos en una lista. */
function replicator(locks: LockManager | null = null) {
  const events: SyncEvent[] = [];
  const instance = createReplicator({ local, remote, onEvent: (event) => events.push(event), locks, channelName });
  running.push(instance);
  return { instance, events };
}

async function exists(db: PouchDB.Database, id: string): Promise<boolean> {
  return db.get(id).then(() => true, () => false);
}

/**
 * Espera fija corta para comprobar que algo NO ocurre. Justificada (F-3): la replicación real
 * entre dos réplicas en memoria no emite ninguna señal de «no hay nada que hacer». Con la CPU
 * cargada el plazo sólo da más margen a un fallo real; cada caso negativo tiene su par positivo
 * (`vi.waitFor` sobre la replicación al reanudar/soltar el cerrojo) que prueba que sí funciona.
 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

/**
 * `LockManager` mínimo (jsdom no trae Web Locks): un solo cerrojo exclusivo con cola y
 * cancelación por `signal`, como `navigator.locks.request(name, { signal }, callback)`.
 */
function fakeLocks(): LockManager {
  let held = false;
  const queue: (() => void)[] = [];
  return {
    request(_name: string, options: { signal?: AbortSignal }, callback: () => Promise<unknown>) {
      return new Promise((resolve, reject) => {
        const run = async () => {
          held = true;
          try {
            resolve(await callback());
          } finally {
            held = false;
            queue.shift()?.();
          }
        };
        options.signal?.addEventListener("abort", () => {
          const index = queue.indexOf(run);
          if (index >= 0) {
            queue.splice(index, 1);
            reject(new DOMException("aborted", "AbortError"));
          }
        });
        if (held) queue.push(run);
        else void run();
      });
    },
  } as unknown as LockManager;
}

describe("RF-019: espera creciente entre reintentos", () => {
  it("1, 2, 4… hasta 60 s y se queda en 60 s", () => {
    const delays: number[] = [];
    let delay = 0; // PouchDB empieza en 0
    for (let i = 0; i < 9; i += 1) {
      delay = backOff(delay);
      delays.push(delay / 1000);
    }
    expect(delays).toEqual([1, 2, 4, 8, 16, 32, 60, 60, 60]);
  });

  it("tras una sincronización correcta vuelve a 1 s (PouchDB reinicia la espera a 0 en `active`)", () => {
    expect(backOff(0)).toBe(1000);
  });

  it("la replicación es continua, con reintentos, lotes de 50 y esa espera", () => {
    const sync = vi.spyOn(local, "sync");
    replicator().instance.start();
    expect(sync).toHaveBeenCalledWith(remote, { live: true, retry: true, batch_size: BATCH_SIZE, back_off_function: backOff });
    expect(BATCH_SIZE).toBe(50);
  });
});

describe("RF-010: replica en ambos sentidos y avisa de cada paso", () => {
  it("push: el cambio local llega al servidor; eventos active, written, checkpoint y paused", async () => {
    const { instance, events } = replicator();
    instance.start();
    const { rev } = await local.put({ _id: "vault:1", name: "Notas" });

    await waitForCondition(async () => expect(await exists(remote, "vault:1")).toBe(true));
    await waitForCondition(() => expect(events).toContainEqual({ type: "paused", direction: "push", offline: false }));
    expect(events).toContainEqual({ type: "active", direction: "push" });
    expect(events).toContainEqual({ type: "written", docs: [{ id: "vault:1", rev }] });
    const seq = (await local.info()).update_seq;
    expect(events).toContainEqual({ type: "checkpoint", seq });
  });

  it("pull: el cambio del servidor llega a la réplica", async () => {
    replicator().instance.start();
    await remote.put({ _id: "vault:2", name: "Del servidor" });
    await waitForCondition(async () => expect(await exists(local, "vault:2")).toBe(true));
  });

  it("RF-019: un fallo de red o un 503 detiene el sentido afectado como 'sin conexión' y reintenta", async () => {
    // Así llega a PouchDB un fallo de red del adaptador HTTP en mitad de un lote.
    const revsDiff = vi.spyOn(remote, "revsDiff").mockRejectedValueOnce(Object.assign(new TypeError("Failed to fetch"), { status: 0 }));
    const { instance, events } = replicator();
    instance.start();
    await local.put({ _id: "vault:4", name: "Sin red" });

    await waitForCondition(() => expect(events).toContainEqual({ type: "paused", direction: "push", offline: true }));
    // Tras la espera de 1 s, el reintento (ya sin fallo) lo sube.
    await waitForCondition(async () => expect(await exists(remote, "vault:4")).toBe(true), { timeout: 3000 });
    expect(revsDiff.mock.calls.length).toBeGreaterThan(1);
  });

  it("RF-006: un rechazo del push llega como `denied` con id, rev y motivo", async () => {
    vi.spyOn(remote, "bulkDocs").mockImplementation((async (request: { docs: { _id: string; _rev: string }[] }) =>
      request.docs.map((doc) => ({ id: doc._id, rev: doc._rev, error: "forbidden", name: "forbidden", status: 403, reason: "vault-name-taken" }))) as never);
    const { instance, events } = replicator();
    instance.start();
    const { rev } = await local.put({ _id: "vault:3", name: "Repetida" });

    await waitForCondition(() => expect(events).toContainEqual({ type: "denied", id: "vault:3", rev, reason: "vault-name-taken" }));
  });
});

describe("RF-016: sesión caducada", () => {
  it("se detiene sin tocar la réplica y reanuda con el mismo usuario", async () => {
    const { instance, events } = replicator();
    instance.start();
    await local.put({ _id: "vault:1", name: "Antes" });
    await waitForCondition(async () => expect(await exists(remote, "vault:1")).toBe(true));

    instance.sessionExpired();
    expect(events.at(-1)).toEqual({ type: "session-expired" });
    await local.put({ _id: "vault:2", name: "Sin sesión" });
    await settle();
    expect(await exists(remote, "vault:2")).toBe(false);
    expect((await local.allDocs()).rows.map((row) => row.id)).toEqual(["vault:1", "vault:2"]);

    instance.resume();
    await waitForCondition(async () => expect(await exists(remote, "vault:2")).toBe(true));
  });
});

describe("R-10: un solo replicador por navegador", () => {
  it("sólo la pestaña con el Web Lock replica; al soltarlo lo toma la siguiente", async () => {
    const locks = fakeLocks();
    const sync = vi.spyOn(local, "sync");
    const first = replicator(locks);
    const second = replicator(locks);
    first.instance.start();
    second.instance.start();
    await settle();
    expect(sync).toHaveBeenCalledTimes(1);

    await first.instance.stop();
    await waitForCondition(() => expect(sync).toHaveBeenCalledTimes(2));
    await local.put({ _id: "vault:1", name: "Notas" });
    await waitForCondition(async () => expect(await exists(remote, "vault:1")).toBe(true));
  });

  it("las demás pestañas reciben los eventos por BroadcastChannel; la que replica no los recibe dos veces", async () => {
    const locks = fakeLocks();
    const leader = replicator(locks);
    const follower = replicator(locks);
    leader.instance.start();
    follower.instance.start();
    await local.put({ _id: "vault:1", name: "Notas" });

    await waitForCondition(() => expect(follower.events).toContainEqual({ type: "paused", direction: "push", offline: false }));
    expect(follower.events).toContainEqual({ type: "active", direction: "push" });
    const pushActive = leader.events.filter((e) => e.type === "active" && e.direction === "push");
    expect(pushActive).toHaveLength(follower.events.filter((e) => e.type === "active" && e.direction === "push").length);
  });

  it("una pestaña que se abre después recibe el estado actual de la que replica", async () => {
    const locks = fakeLocks();
    const leader = replicator(locks);
    leader.instance.start();
    await waitForCondition(() => expect(leader.events).toContainEqual({ type: "paused", direction: "pull", offline: false }));
    await waitForCondition(() => expect(leader.events).toContainEqual({ type: "paused", direction: "push", offline: false }));

    const late = replicator(locks);
    late.instance.start();
    await waitForCondition(() => {
      expect(late.events).toContainEqual({ type: "paused", direction: "push", offline: false });
      expect(late.events).toContainEqual({ type: "paused", direction: "pull", offline: false });
    });
    expect(late.events.some((e) => e.type === "active")).toBe(false);
  });

  it("también la sesión caducada", async () => {
    const locks = fakeLocks();
    const leader = replicator(locks);
    leader.instance.start();
    await waitForCondition(() => expect(leader.events.length).toBeGreaterThan(0));
    leader.instance.sessionExpired();

    const late = replicator(locks);
    late.instance.start();
    await waitForCondition(() => expect(late.events).toContainEqual({ type: "session-expired" }));
  });

  it("detener una pestaña que esperaba el cerrojo cancela su petición sin replicar", async () => {
    const locks = fakeLocks();
    const sync = vi.spyOn(local, "sync");
    const first = replicator(locks);
    const second = replicator(locks);
    first.instance.start();
    second.instance.start();
    await second.instance.stop();
    await first.instance.stop();
    await settle();
    expect(sync).toHaveBeenCalledTimes(1);
  });
});
