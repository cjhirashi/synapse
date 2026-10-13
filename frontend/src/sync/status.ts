/**
 * Estado de la sincronización para la UI (SPEC-0005 RF-009, RF-010, RF-019; PLAN-0005 §2.5).
 *
 * Interpreta los eventos del replicador (`SyncEvent`) y la secuencia de la réplica local:
 * - `session-expired`: hasta que la replicación vuelve a estar activa (RF-016);
 * - `offline`: algún sentido se detuvo por un fallo de red o un 503, o PouchDB abandonó (RF-019);
 * - `syncing`: algún sentido está transfiriendo (o todavía no ha terminado su primer intento);
 * - `pending`: todo detenido sin error, pero quedan cambios locales sin confirmar (RF-010);
 * - `online`: al día.
 *
 * "Pendientes" = la secuencia local supera la última confirmada por el checkpoint del push.
 * Los documentos `_local` no cuentan en la secuencia, así que el propio estado no la mueve.
 * Una revisión recibida por el pull también la sube hasta que el push la recorre (un falso
 * "pendiente" breve, nunca un pendiente perdido).
 *
 * La hora de la última sincronización correcta y la secuencia confirmada se guardan en
 * `_local/synapse-sync-state` y sobreviven a recargar. Todas las pestañas procesan los mismos
 * eventos, así que la escritura es un *upsert* que sólo avanza los valores y reintenta ante
 * el 409 de otra pestaña.
 */
import type { Direction, SyncEvent } from "./replicator";
import { utcNow } from "./vaultStore";

export const SYNC_STATE_DOC_ID = "_local/synapse-sync-state";

export type SyncState = "online" | "offline" | "syncing" | "pending" | "session-expired";

export interface SyncStatus {
  state: SyncState;
  pending: boolean;
  /** Hora (formato de `utc_now`) de la última sincronización correcta en ambos sentidos. */
  lastSyncAt: string | null;
}

export interface SyncStatusStore {
  current(): SyncStatus;
  subscribe(listener: (status: SyncStatus) => void): () => void;
  /** Aplica un evento; la promesa termina cuando el estado persistido está escrito. */
  handle(event: SyncEvent): Promise<void>;
  /** Deja de seguir la réplica y de avisar a los suscriptores. */
  close(): void;
}

interface StoredState {
  _id: typeof SYNC_STATE_DOC_ID;
  _rev?: string;
  last_sync_at: string | null;
  push_seq: number;
}

/**
 * Secuencias como número. Los adaptadores del navegador usan enteros; CouchDB, cadenas que
 * empiezan por el número (`"12-g1A…"`). Es la misma lectura que hace PouchDB al replicar.
 */
function seqNumber(seq: number | string): number {
  return typeof seq === "number" ? seq : parseInt(seq, 10) || 0;
}

/** El mayor de dos instantes con el formato de `utc_now` (comparables como texto), o `null`. */
function latest(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
}

async function readStored(db: PouchDB.Database): Promise<StoredState> {
  try {
    return (await db.get(SYNC_STATE_DOC_ID)) as unknown as StoredState;
  } catch (err) {
    if ((err as { status?: number }).status === 404) return { _id: SYNC_STATE_DOC_ID, last_sync_at: null, push_seq: 0 };
    throw err;
  }
}

/** Avanza (nunca retrocede) el estado persistido; reintenta si otra pestaña escribió antes. */
async function advanceStored(db: PouchDB.Database, lastSyncAt: string | null, pushSeq: number): Promise<void> {
  for (;;) {
    const stored = await readStored(db);
    const next = { ...stored, last_sync_at: latest(stored.last_sync_at, lastSyncAt), push_seq: Math.max(stored.push_seq, pushSeq) };
    if (next.last_sync_at === stored.last_sync_at && next.push_seq === stored.push_seq && stored._rev) return;
    try {
      await db.put(next as unknown as PouchDB.Core.PutDocument<{}>);
      return;
    } catch (err) {
      if ((err as { status?: number }).status !== 409) throw err;
    }
  }
}

export async function openSyncStatus(
  db: PouchDB.Database,
  { now = () => utcNow() }: { now?: () => string } = {},
): Promise<SyncStatusStore> {
  const stored = await readStored(db);
  let localSeq = seqNumber((await db.info()).update_seq);
  let confirmedSeq = stored.push_seq;
  let lastSyncAt = stored.last_sync_at;
  // Hasta el primer evento cada sentido está "intentando": PouchDB emite `paused` aunque no
  // haya nada que transferir.
  const active: Record<Direction, boolean> = { push: true, pull: true };
  const offline: Record<Direction, boolean> = { push: false, pull: false };
  let failed = false;
  let expired = false;
  const listeners = new Set<(status: SyncStatus) => void>();
  let writes: Promise<void> = Promise.resolve();

  function current(): SyncStatus {
    const pending = localSeq > confirmedSeq;
    let state: SyncState;
    if (expired) state = "session-expired";
    else if (failed || offline.push || offline.pull) state = "offline";
    else if (active.push || active.pull) state = "syncing";
    else state = pending ? "pending" : "online";
    return { state, pending, lastSyncAt };
  }

  function notify(): void {
    const status = current();
    listeners.forEach((listener) => listener(status));
  }

  /** Encola la escritura del estado persistido (en orden dentro de esta pestaña). */
  function persist(): Promise<void> {
    const [at, seq] = [lastSyncAt, confirmedSeq];
    writes = writes.then(() => advanceStored(db, at, seq));
    return writes;
  }

  // Cada escritura en la réplica (de la UI o del pull) puede cambiar los pendientes.
  const feed = db.changes({ live: true, since: "now" }).on("change", () => {
    void db.info().then((info) => {
      localSeq = seqNumber(info.update_seq);
      notify();
    });
  });

  return {
    current,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async handle(event) {
      switch (event.type) {
        case "active":
          active[event.direction] = true;
          offline[event.direction] = false;
          failed = false;
          expired = false;
          break;
        case "paused": {
          active[event.direction] = false;
          offline[event.direction] = event.offline;
          const other: Direction = event.direction === "push" ? "pull" : "push";
          if (!event.offline && !active[other] && !offline[other] && !failed && !expired) {
            lastSyncAt = now();
            notify();
            return persist();
          }
          break;
        }
        case "checkpoint":
          confirmedSeq = Math.max(confirmedSeq, seqNumber(event.seq));
          notify();
          return persist();
        case "error":
          failed = true;
          break;
        case "session-expired":
          expired = true;
          break;
        default:
          // `written` y `denied` son de `rejections.ts`.
          return;
      }
      notify();
    },

    close() {
      feed.cancel();
      listeners.clear();
    },
  };
}
