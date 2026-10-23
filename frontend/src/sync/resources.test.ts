// `pushOnce`: la guarda de "Sincronizar y salir" (SPEC-0005 RF-017, RF-018; PLAN-0005 §10 VC-3),
// y `unconfirmedState`: la decisión de avisar al cerrar sesión (RF-017; PLAN-0005 §11 VD-1, VD-3; §12 VE-2).
//
// La réplica y los almacenes de estado y rechazos son los reales (en memoria); sólo el push
// se sustituye por una replicación falsa que emite los eventos de PouchDB que dicte cada
// caso y termina con el resultado dado. Así cada condición de la guarda se prueba sola.
import PouchDB from "pouchdb-browser";
import memory from "pouchdb-adapter-memory";
import { openRejections } from "./rejections";
import { memoryEnv } from "../test-utils/sync";
import { openSyncResources, pushOnce, unconfirmedState, type SyncResources } from "./resources";
import { openSyncStatus } from "./status";

PouchDB.plugin(memory);

const ID = "vault:11111111-1111-4111-8111-111111111111";

type Emitted = [event: "change" | "denied" | "checkpoint", info: unknown];

interface PushResult {
  ok: boolean;
  doc_write_failures: number;
  last_seq: number | string;
}

let counter = 0;
let db: PouchDB.Database;

beforeEach(async () => {
  counter += 1;
  db = new PouchDB(`resources-test-${counter}`, { adapter: "memory" });
  // Un cambio local: la secuencia de la réplica queda en 1.
  await db.put({ _id: ID, type: "vault", name: "Uno" });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db.destroy();
});

/**
 * `db.replicate.to` falso: devuelve una promesa con `on()` como la de PouchDB; emite los
 * eventos en una microtarea (ya con los oyentes puestos) y después resuelve con `result`.
 */
function fakePush(events: Emitted[], result: PushResult | Error): void {
  vi.spyOn(db.replicate, "to").mockImplementation(() => {
    const handlers = new Map<string, (info: unknown) => void>();
    const done = new Promise((resolve, reject) => {
      queueMicrotask(() => {
        events.forEach(([event, info]) => handlers.get(event)?.(info));
        if (result instanceof Error) reject(result);
        else resolve(result);
      });
    });
    const replication = Object.assign(done, {
      on(event: string, handler: (info: unknown) => void) {
        handlers.set(event, handler);
        return replication;
      },
    });
    return replication as unknown as ReturnType<PouchDB.Database["replicate"]["to"]>;
  });
}

async function resources(): Promise<SyncResources> {
  const remote = new PouchDB(`resources-remote-${counter}`, { adapter: "memory" });
  const [status, rejections] = await Promise.all([openSyncStatus(db), openRejections(db)]);
  return { db, remote, status, rejections } as unknown as SyncResources;
}

const written = (rev: string): Emitted => ["change", { docs: [{ _id: ID, _rev: rev }] }];

describe("pushOnce", () => {
  it("todo escrito, sin rechazos y con la secuencia local recorrida → true", async () => {
    const { _rev } = await db.get(ID);
    fakePush([written(_rev), ["checkpoint", { checkpoint: 1 }]], { ok: true, doc_write_failures: 0, last_seq: 1 });
    expect(await pushOnce(await resources())).toBe(true);
  });

  it("un rechazo del servidor durante el push → false y queda en la lista", async () => {
    const res = await resources();
    fakePush(
      [["denied", { id: ID, rev: "1-x", reason: "vault-name-taken" }], ["checkpoint", { checkpoint: 1 }]],
      // PouchDB da el lote por recorrido aunque el servidor rechace una revisión.
      { ok: true, doc_write_failures: 0, last_seq: 1 },
    );
    expect(await pushOnce(res)).toBe(false);
    expect(res.rejections.list()).toEqual([{ id: ID, rev: "1-x", reason: "vault-name-taken" }]);
  });

  it("un rechazo previo que este push no corrige → false", async () => {
    const res = await resources();
    await res.rejections.handle({ type: "denied", id: ID, rev: "1-x", reason: "vault-name-taken" });
    fakePush([], { ok: true, doc_write_failures: 0, last_seq: 1 });
    expect(await pushOnce(res)).toBe(false);
  });

  it("un lote parcial (la secuencia confirmada no llega a la local) → false", async () => {
    await db.put({ _id: "vault:22222222-2222-4222-8222-222222222222", type: "vault", name: "Dos" });
    fakePush([], { ok: true, doc_write_failures: 0, last_seq: 1 });
    expect(await pushOnce(await resources())).toBe(false);
  });

  it("fallos de escritura aunque el lote se recorra → false", async () => {
    fakePush([], { ok: true, doc_write_failures: 1, last_seq: 1 });
    expect(await pushOnce(await resources())).toBe(false);
  });

  it("el push no terminó bien (`ok: false`) aunque no haya fallos ni rechazos → false (VD-2)", async () => {
    fakePush([], { ok: false, doc_write_failures: 0, last_seq: 1 });
    expect(await pushOnce(await resources())).toBe(false);
  });

  it("sin conexión (el push termina con error) → false", async () => {
    fakePush([], Object.assign(new Error("Failed to fetch"), { status: 0 }));
    expect(await pushOnce(await resources())).toBe(false);
  });
});

describe("unconfirmedState", () => {
  /** Recursos con la secuencia local (1) ya confirmada por el checkpoint del push. */
  async function confirmed(): Promise<SyncResources> {
    const res = await resources();
    await res.status.handle({ type: "checkpoint", seq: 1 });
    return res;
  }

  it("todo confirmado y sin rechazos → none", async () => {
    expect(await unconfirmedState(await confirmed())).toBe("none");
  });

  it("un cambio local sin confirmar → pending", async () => {
    expect(await unconfirmedState(await resources())).toBe("pending");
  });

  it("un rechazo que aún se está guardando cuenta como no confirmado (VD-1)", async () => {
    const res = await confirmed();
    // La escritura del rechazo tarda más que releer la secuencia: sólo esperándola se ve. El retardo es
    // una dependencia lenta SIMULADA (no una espera del test, F-3): con la CPU cargada sólo se alarga.
    const put = db.put.bind(db);
    vi.spyOn(db, "put").mockImplementation((async (doc: never) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return put(doc);
    }) as never);
    void res.rejections.handle({ type: "denied", id: ID, rev: "1-x", reason: "vault-name-taken" });
    expect(await unconfirmedState(res)).toBe("pending");
  });

  it("si la réplica no puede leerse lo dice en lugar de fallar (VD-3, VE-2)", async () => {
    const res = await confirmed();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(db, "info").mockRejectedValue(new Error("IndexedDB no disponible"));
    expect(await unconfirmedState(res)).toBe("unreadable");
    expect(error).toHaveBeenCalledOnce();
  });
});

describe("openSyncResources: notas y reintento dirigido (SPEC-0008 RF-001, RF-019, P-7)", () => {
  const VAULT = "33333333-3333-4333-8333-333333333333";
  const NOTE = `note:${VAULT}:44444444-4444-4444-8444-444444444444`;
  const opened: SyncResources[] = [];

  afterEach(async () => {
    await Promise.all(opened.splice(0).map((r) => r.close()));
  });

  async function open() {
    const { env, fake } = memoryEnv();
    const res = await openSyncResources("u1", env);
    opened.push(res);
    return { res, fake };
  }

  it("expone `notes`, un almacén sobre la misma réplica que las bóvedas", async () => {
    const { res } = await open();
    const note = await res.notes.create(VAULT, "Ideas");
    expect((await res.db.get(note.id)) as { type: string }).toMatchObject({ type: "note" });
    expect((await res.notes.list(VAULT)).map((n) => n.path)).toEqual(["Ideas.md"]);
  });

  it("`repush` va cableado: un vault-not-found y la bóveda escrita por el push reintentan la nota", async () => {
    const { res, fake } = await open();
    const vault = await res.vaults.create({ name: "Notas", description: null, tags: [] });
    const toSpy = vi.spyOn(res.db.replicate, "to").mockImplementation((() =>
      Object.assign(Promise.resolve({ ok: true, doc_write_failures: 0 }), { on: () => undefined })) as never);
    const noteId = `note:${vault.id}:44444444-4444-4444-8444-444444444444`;
    // Los eventos del replicador llegan por `onEvent`, que también alimenta a `repush`.
    const { onEvent } = fake.create.mock.calls[0][0];
    onEvent({ type: "denied", id: noteId, rev: "1-a", reason: "vault-not-found" });
    await res.rejections.settled();
    onEvent({ type: "written", docs: [{ id: `vault:${vault.id}`, rev: vault.rev }] });
    await vi.waitFor(() =>
      expect(toSpy).toHaveBeenCalledWith(res.remote, { doc_ids: [noteId], checkpoint: false }),
    );
  });

  it("`close()` cierra `repush`: después de cerrar ya no reintenta", async () => {
    const { res } = await open();
    const toSpy = vi.spyOn(res.db.replicate, "to");
    await res.rejections.handle({ type: "denied", id: NOTE, rev: "1-a", reason: "vault-not-found" });
    await res.close();
    // Una bóveda activa tras cerrar no dispara nada (el feed de `repush` está cancelado).
    // Sonda del feed de la réplica: abierta después de `close()`, recibe el cambio una vez que cualquier
    // oyente anterior (el de `repush`, si siguiera activo) ya lo atendió (F-3: señal en vez de plazo).
    const delivered = new Promise<void>((resolve) => {
      const probe = res.db.changes({ live: true, since: "now" }).on("change", () => {
        probe.cancel();
        resolve();
      });
    });
    await res.db.put({
      _id: `vault:${VAULT}`, type: "vault", name: "N", description: null, tags: [], owner_id: "u1",
      created_at: "2026-10-22T10:00:00.000000Z", updated_at: "2026-10-22T10:00:00.000000Z", deleted_at: null,
    });
    await delivered;
    expect(toSpy).not.toHaveBeenCalled();
  });
});
