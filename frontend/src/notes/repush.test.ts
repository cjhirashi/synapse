// Reintento dirigido de notas rechazadas con `vault-not-found` (SPEC-0008 RF-004, RF-014;
// PLAN-0008 P-7).
import PouchDB from "pouchdb-browser";
import memory from "pouchdb-adapter-memory";
import { openRejections, type RejectionsStore } from "../sync/rejections";
import type { SyncStatus, SyncStatusStore } from "../sync/status";
import { startRepush, type Repush } from "./repush";
import { waitForCondition } from "../test-utils/waits";

PouchDB.plugin(memory);

const V = "11111111-1111-4111-8111-111111111111";
const W = "22222222-2222-4222-8222-222222222222";
const NOTE_1 = `note:${V}:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
const NOTE_2 = `note:${V}:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`;
const OTHER_VAULT_NOTE = `note:${W}:cccccccc-cccc-4ccc-8ccc-cccccccccccc`;
const T = "2026-10-22T10:00:00.000000Z";

let counter = 0;
let db: PouchDB.Database;
let remote: PouchDB.Database;
let rejections: RejectionsStore;
let status: SyncStatusStore;
let repush: Repush;
let handlers: Record<string, (...args: unknown[]) => void>;
let toSpy: ReturnType<typeof vi.fn>;
let statusListener: ((status: SyncStatus) => void) | null;
const unsubscribe = vi.fn();
/** Última secuencia que vio la sonda del feed (ver `settle`). */
let probeSeq = 0;
let probe: PouchDB.Core.Changes<object> | null = null;

/**
 * Sonda del feed de la propia réplica: se abre DESPUÉS de `startRepush` (hay que llamarla tras cada
 * arranque), así PouchDB le entrega cada cambio después de que el oyente de `repush` ya lo atendió
 * (los oyentes del mismo emisor se llaman en orden de registro, de forma síncrona).
 */
async function startProbe(): Promise<void> {
  probe?.cancel();
  probeSeq = Number((await db.info()).update_seq); // lo escrito antes de arrancar no llegará a esta sonda
  probe = db.changes({ live: true, since: "now" }).on("change", (change) => {
    probeSeq = Number(change.seq);
  });
}

/** Réplica falsa: guarda los oyentes y se resuelve como una promesa (`await replication`). */
function fakeReplication() {
  const promise = Promise.resolve({ ok: true, doc_write_failures: 0 });
  return Object.assign(promise, {
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      handlers[event] = listener;
      return promise;
    }),
  });
}

beforeEach(async () => {
  counter += 1;
  handlers = {};
  db = new PouchDB(`repush-test-${counter}`, { adapter: "memory" });
  remote = new PouchDB(`repush-remote-${counter}`, { adapter: "memory" });
  rejections = await openRejections(db);
  statusListener = null;
  unsubscribe.mockClear();
  status = {
    handle: vi.fn(async () => undefined),
    subscribe: vi.fn((listener: (status: SyncStatus) => void) => {
      statusListener = listener;
      return unsubscribe;
    }),
  } as unknown as SyncStatusStore;
  toSpy = vi.spyOn(db.replicate, "to").mockImplementation((() => fakeReplication()) as never) as unknown as ReturnType<typeof vi.fn>;
  repush = startRepush({ db, remote, status, rejections });
  await startProbe();
});

afterEach(() => {
  probe?.cancel();
  repush.close();
  rejections.close();
  vi.restoreAllMocks();
});

/**
 * Espera a que el feed de la réplica haya entregado cuanto se escribió (la sonda llegó a la última
 * secuencia, F-3) y a que termine el reintento en curso. Es una señal, no un plazo: con la CPU
 * cargada no se queda corta y, en los casos negativos, la ausencia se afirma cuando el
 * disparador ya tuvo su oportunidad (antes pasaban sin haber comprobado nada).
 */
async function settle(): Promise<void> {
  const target = Number((await db.info()).update_seq);
  await waitForCondition(() => expect(probeSeq).toBeGreaterThanOrEqual(target));
  await repush.settled();
}

const rejectNote = (id: string, reason = "vault-not-found") =>
  rejections.handle({ type: "denied", id, rev: "1-a", reason });

async function putVault(id: string, deletedAt: string | null = null): Promise<void> {
  const existing = await db.get<{ _rev: string }>(`vault:${id}`).catch(() => null);
  await db.put({
    _id: `vault:${id}`, ...(existing ? { _rev: existing._rev } : {}), type: "vault", name: "N", description: null,
    tags: [], owner_id: "u", created_at: T, updated_at: T, deleted_at: deletedAt,
  });
}

describe("RF-004: repush de notas rechazadas por bóveda inexistente", () => {
  it("al quedar activa la bóveda, un push único con los doc_ids de sus notas y checkpoint:false", async () => {
    await rejectNote(NOTE_1);
    await rejectNote(NOTE_2);
    await rejectNote(OTHER_VAULT_NOTE); // de otra bóveda: no entra
    await putVault(V);
    await settle();
    await waitForCondition(() => expect(toSpy).toHaveBeenCalledTimes(1));
    expect(toSpy).toHaveBeenCalledWith(remote, { doc_ids: [NOTE_1, NOTE_2], checkpoint: false });
  });

  it("sólo reintenta el motivo vault-not-found", async () => {
    await rejectNote(NOTE_1, "validation-error:content");
    await putVault(V);
    await settle();
    expect(toSpy).not.toHaveBeenCalled();
  });

  it("sin rechazos no hace nada", async () => {
    await putVault(V);
    await settle();
    expect(toSpy).not.toHaveBeenCalled();
  });

  it("RF-014: con la bóveda borrada (papelera) no hace nada, y reintenta al restaurarla", async () => {
    await rejectNote(NOTE_1);
    await putVault(V, T);
    await settle();
    expect(toSpy).not.toHaveBeenCalled();
    await putVault(V, null);
    await settle();
    await waitForCondition(() => expect(toSpy).toHaveBeenCalledTimes(1));
  });

  // N-3 / RD-1 (P-9): con la bóveda en conflicto basta una rama viva activa.
  it("una bóveda en conflicto (ganadora en la papelera, perdedora activa) cuenta como activa", async () => {
    const rev = (hashes: string[], deletedAt: string | null) => ({
      _id: `vault:${V}`, _rev: `${hashes.length}-${hashes[0]}`, _revisions: { start: hashes.length, ids: hashes },
      type: "vault", name: "N", description: null, tags: [], owner_id: "u", created_at: T, updated_at: T, deleted_at: deletedAt,
    });
    await rejectNote(NOTE_1);
    await db.bulkDocs([rev(["aaaa"], null)] as never, { new_edits: false });
    await db.bulkDocs([rev(["ffff", "aaaa"], T), rev(["1111", "aaaa"], null)] as never, { new_edits: false });
    await settle();
    await waitForCondition(() => expect(toSpy).toHaveBeenCalledWith(remote, { doc_ids: [NOTE_1], checkpoint: false }));
  });

  it("una bóveda escrita por el push (evento written) también dispara el reintento", async () => {
    await putVault(V); // ya activa en la réplica cuando llega el rechazo
    await settle();
    await rejectNote(NOTE_1);
    expect(toSpy).not.toHaveBeenCalled(); // un rechazo nuevo no dispara: evitaría un bucle
    repush.handle({ type: "written", docs: [{ id: `vault:${V}`, rev: "1-a" }] });
    await settle();
    await waitForCondition(() => expect(toSpy).toHaveBeenCalledWith(remote, { doc_ids: [NOTE_1], checkpoint: false }));
  });

  it("un evento written de otra cosa no dispara nada", async () => {
    await putVault(V);
    await settle(); // el cambio de la bóveda ya se atendió (sin rechazos aún)
    await rejectNote(NOTE_1);
    toSpy.mockClear();
    repush.handle({ type: "written", docs: [{ id: NOTE_2, rev: "1-a" }] });
    repush.handle({ type: "active", direction: "push" });
    await settle();
    expect(toSpy).not.toHaveBeenCalled();
  });

  it("los eventos del push van a rechazos y a estado, como los de pushOnce", async () => {
    await rejectNote(NOTE_1);
    toSpy.mockImplementationOnce((() => {
      const replication = fakeReplication();
      // PouchDB emite mientras se replica: una escrita y un rechazo.
      queueMicrotask(() => {
        handlers.change?.({ docs: [{ _id: NOTE_1, _rev: "1-a" }] });
        handlers.denied?.({ id: NOTE_2, rev: "1-b", reason: "vault-not-found" });
      });
      return replication;
    }) as never);
    await putVault(V);
    await settle();
    await waitForCondition(() => expect(status.handle).toHaveBeenCalledWith({ type: "denied", id: NOTE_2, rev: "1-b", reason: "vault-not-found" }));
    expect(status.handle).toHaveBeenCalledWith({ type: "written", docs: [{ id: NOTE_1, rev: "1-a" }] });
    expect(status.handle).toHaveBeenCalledWith({ type: "denied", id: NOTE_2, rev: "1-b", reason: "vault-not-found" });
    // La escrita quita su rechazo; la denegada pasa a la lista.
    expect(rejections.list()).toEqual([{ id: NOTE_2, rev: "1-b", reason: "vault-not-found" }]);
  });

  it("un fallo del push no rompe el reintento siguiente", async () => {
    await rejectNote(NOTE_1);
    toSpy.mockImplementationOnce((() => Object.assign(Promise.reject(new Error("sin red")), { on: vi.fn() })) as never);
    await putVault(V);
    await settle();
    await putVault(V, T);
    await settle();
    await putVault(V, null);
    await settle();
    await waitForCondition(() => expect(toSpy).toHaveBeenCalledTimes(2));
  });

  it("varios cambios seguidos de la misma bóveda dan un solo push (se juntan los pendientes)", async () => {
    await rejectNote(NOTE_1);
    // Mientras el primer push está en curso, los cambios siguientes se juntan en uno.
    let release!: () => void;
    toSpy.mockImplementationOnce((() => {
      const gate = new Promise<void>((resolve) => (release = resolve));
      const replication = fakeReplication();
      return Object.assign(gate.then(() => replication), { on: replication.on });
    }) as never);
    await putVault(V);
    await waitForCondition(() => expect(toSpy).toHaveBeenCalledTimes(1)); // el primer push queda en curso
    await putVault(V, T);
    await putVault(V, null);
    await putVault(V, T);
    await putVault(V, null);
    // El feed ya entregó todos los cambios (se juntaron mientras el primer push seguía en curso).
    await waitForCondition(async () => expect(probeSeq).toBeGreaterThanOrEqual(Number((await db.info()).update_seq)));
    release();
    await settle();
    await waitForCondition(() => expect(toSpy).toHaveBeenCalledTimes(2)); // el primero y uno solo para todo lo acumulado
  });

  // El guard `closed` de `retry` importa con un reintento ya encolado: `feed.cancel()` sólo impide los nuevos.
  it("un reintento ya encolado cuando llega close() no empuja nada", async () => {
    await rejectNote(NOTE_1);
    let release!: () => void;
    toSpy.mockImplementationOnce((() => {
      const gate = new Promise<void>((resolve) => (release = resolve));
      const replication = fakeReplication();
      return Object.assign(gate.then(() => replication), { on: replication.on });
    }) as never);
    await putVault(V);
    await waitForCondition(() => expect(toSpy).toHaveBeenCalledTimes(1)); // el primer push queda en curso
    await putVault(V, T);
    await putVault(V, null); // encola un segundo reintento detrás del primero
    await waitForCondition(async () => expect(probeSeq).toBeGreaterThanOrEqual(Number((await db.info()).update_seq)));
    repush.close();
    release();
    await repush.settled();
    expect(toSpy).toHaveBeenCalledTimes(1); // el encolado no se ejecuta tras cerrar
  });

  it("tras close() no reintenta", async () => {
    await rejectNote(NOTE_1);
    repush.close();
    await putVault(V);
    await settle();
    expect(toSpy).not.toHaveBeenCalled();
  });
});

/** Estado que emite `status` al cambiar la conexión. */
const emitState = (state: SyncStatus["state"]) => statusListener?.({ state, pending: false, lastSyncAt: null });

describe("RD-2: disparadores de arranque y de reconexión", () => {
  it("al arrancar, un vault-not-found persistido con la bóveda ya activa se reintenta", async () => {
    repush.close();
    await putVault(V); // la bóveda ya está activa y no cambiará: sólo el arranque puede disparar
    await rejectNote(NOTE_1);
    toSpy.mockClear();
    repush = startRepush({ db, remote, status, rejections });
    await startProbe();
    await settle();
    await waitForCondition(() => expect(toSpy).toHaveBeenCalledTimes(1));
    expect(toSpy).toHaveBeenCalledWith(remote, { doc_ids: [NOTE_1], checkpoint: false });
  });

  it("al arrancar, con la bóveda aún en la papelera no reintenta", async () => {
    repush.close();
    await putVault(V, T);
    await rejectNote(NOTE_1);
    repush = startRepush({ db, remote, status, rejections });
    await startProbe();
    await settle();
    expect(toSpy).not.toHaveBeenCalled();
  });

  it("tras un fallo de red, el reintento queda pendiente y se repite al volver a estar en línea", async () => {
    // Instancia nueva tras crear la bóveda: su feed no arrastra el cambio de `putVault`, que
    // llegaría en un turno aleatorio y sumaría un reintento ajeno a lo que se prueba.
    await putVault(V);
    await settle();
    repush.close();
    repush = startRepush({ db, remote, status, rejections });
    await startProbe();
    await rejectNote(NOTE_1);
    toSpy.mockImplementationOnce((() => Object.assign(Promise.reject(new Error("sin red")), { on: vi.fn() })) as never);
    repush.handle({ type: "written", docs: [{ id: `vault:${V}`, rev: "1-a" }] });
    await settle();
    expect(toSpy).toHaveBeenCalledTimes(1); // el fallo no tiene otro disparador por sí solo
    emitState("offline");
    await settle();
    expect(toSpy).toHaveBeenCalledTimes(1); // sólo la vuelta a "online" dispara
    emitState("online");
    await settle();
    await waitForCondition(() => expect(toSpy).toHaveBeenCalledTimes(2));
    expect(toSpy).toHaveBeenLastCalledWith(remote, { doc_ids: [NOTE_1], checkpoint: false });
  });

  // N-8: un id que no es `note:{uuid}:{uuid}` canónico no da bóveda que reintentar.
  it("al arrancar ignora los rechazos con un id de nota no canónico", async () => {
    repush.close();
    await putVault(V);
    await rejectNote(`note:${V}`); // un solo uuid
    await rejectNote(`note:${V.toUpperCase().replace(/-/g, "-")}:x`); // resto no canónico
    await rejectNote("note:basura");
    toSpy.mockClear();
    repush = startRepush({ db, remote, status, rejections });
    await startProbe();
    await settle();
    expect(toSpy).not.toHaveBeenCalled();
  });

  it("seguir en línea (sin transición) no dispara de nuevo", async () => {
    await putVault(V);
    await rejectNote(NOTE_1);
    emitState("online");
    await settle();
    const calls = toSpy.mock.calls.length;
    emitState("online");
    await settle();
    expect(toSpy).toHaveBeenCalledTimes(calls);
  });

  it("close() deja de seguir el estado de la conexión", async () => {
    repush.close();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe("RD-3: espera los rechazos en curso", () => {
  it("el reintento espera a rejections.settled() antes de leer la lista", async () => {
    const order: string[] = [];
    vi.spyOn(rejections, "settled").mockImplementation(async () => {
      order.push("settled");
    });
    const list = rejections.list.bind(rejections);
    vi.spyOn(rejections, "list").mockImplementation(() => {
      order.push("list");
      return list();
    });
    await putVault(V);
    await settle();
    expect(order.slice(0, 2)).toEqual(["settled", "list"]);
  });
});
