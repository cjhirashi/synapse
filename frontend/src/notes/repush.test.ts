// Reintento dirigido de notas rechazadas con `vault-not-found` (SPEC-0008 RF-004, RF-014;
// PLAN-0008 P-7).
import PouchDB from "pouchdb-browser";
import memory from "pouchdb-adapter-memory";
import { openRejections, type RejectionsStore } from "../sync/rejections";
import type { SyncStatusStore } from "../sync/status";
import { startRepush, type Repush } from "./repush";

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
let toSpy: ReturnType<typeof vi.spyOn>;

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
  status = { handle: vi.fn(async () => undefined) } as unknown as SyncStatusStore;
  toSpy = vi.spyOn(db.replicate, "to").mockImplementation((() => fakeReplication()) as never);
  repush = startRepush({ db, remote, status, rejections });
});

afterEach(() => {
  repush.close();
  rejections.close();
  vi.restoreAllMocks();
});

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
    await repush.settled();
    expect(toSpy).toHaveBeenCalledTimes(1);
    expect(toSpy).toHaveBeenCalledWith(remote, { doc_ids: [NOTE_1, NOTE_2], checkpoint: false });
  });

  it("sólo reintenta el motivo vault-not-found", async () => {
    await rejectNote(NOTE_1, "validation-error:content");
    await putVault(V);
    await repush.settled();
    expect(toSpy).not.toHaveBeenCalled();
  });

  it("sin rechazos no hace nada", async () => {
    await putVault(V);
    await repush.settled();
    expect(toSpy).not.toHaveBeenCalled();
  });

  it("RF-014: con la bóveda borrada (papelera) no hace nada, y reintenta al restaurarla", async () => {
    await rejectNote(NOTE_1);
    await putVault(V, T);
    await repush.settled();
    expect(toSpy).not.toHaveBeenCalled();
    await putVault(V, null);
    await repush.settled();
    expect(toSpy).toHaveBeenCalledTimes(1);
  });

  it("una bóveda escrita por el push (evento written) también dispara el reintento", async () => {
    await putVault(V); // ya activa en la réplica cuando llega el rechazo
    await repush.settled();
    await rejectNote(NOTE_1);
    expect(toSpy).not.toHaveBeenCalled(); // un rechazo nuevo no dispara: evitaría un bucle
    repush.handle({ type: "written", docs: [{ id: `vault:${V}`, rev: "1-a" }] });
    await repush.settled();
    expect(toSpy).toHaveBeenCalledWith(remote, { doc_ids: [NOTE_1], checkpoint: false });
  });

  it("un evento written de otra cosa no dispara nada", async () => {
    await putVault(V);
    await rejectNote(NOTE_1);
    toSpy.mockClear();
    repush.handle({ type: "written", docs: [{ id: NOTE_2, rev: "1-a" }] });
    repush.handle({ type: "active", direction: "push" });
    await repush.settled();
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
    await repush.settled();
    expect(status.handle).toHaveBeenCalledWith({ type: "written", docs: [{ id: NOTE_1, rev: "1-a" }] });
    expect(status.handle).toHaveBeenCalledWith({ type: "denied", id: NOTE_2, rev: "1-b", reason: "vault-not-found" });
    // La escrita quita su rechazo; la denegada pasa a la lista.
    expect(rejections.list()).toEqual([{ id: NOTE_2, rev: "1-b", reason: "vault-not-found" }]);
  });

  it("un fallo del push no rompe el reintento siguiente", async () => {
    await rejectNote(NOTE_1);
    toSpy.mockImplementationOnce((() => Object.assign(Promise.reject(new Error("sin red")), { on: vi.fn() })) as never);
    await putVault(V);
    await repush.settled();
    await putVault(V, T);
    await putVault(V, null);
    await repush.settled();
    expect(toSpy).toHaveBeenCalledTimes(2);
  });

  it("tras close() no reintenta", async () => {
    await rejectNote(NOTE_1);
    repush.close();
    await putVault(V);
    await repush.settled();
    expect(toSpy).not.toHaveBeenCalled();
  });
});
