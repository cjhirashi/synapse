/**
 * Reintento dirigido de las notas rechazadas (SPEC-0008 RF-004, RF-014; PLAN-0008 P-7; ampliado en H-031).
 *
 * `forbidden` no se reintenta por sí solo: la revisión rechazada ya salió del feed y no volvería a subir hasta
 * otra edición suya. Eso deja a las notas atascadas en dos casos: (1) `vault-not-found`, cuando la nota llegó
 * antes que su bóveda (el feed ordena por la última secuencia); y (2) cualquier rechazo que el servidor dio por
 * un defecto suyo y que luego se corrigió (p. ej. `frontmatter: null` heredado o el movimiento de un INDICE con
 * su carpeta): sin reintento, el cliente conserva para siempre rechazos que el servidor ya aceptaría.
 *
 * Este módulo lanza un push de una vez sólo con las notas rechazadas de una bóveda `V` (`doc_ids`, sin tocar el
 * checkpoint) y no escribe revisiones nuevas. Disparadores: la bóveda `V` queda activa en la réplica (cambio local
 * o del pull) o el push la escribe en el servidor (también restaurada de la papelera), el arranque, y cada vuelta
 * a "en línea" tras un fallo de red. Si el motivo sigue vigente el servidor vuelve a rechazar y el rechazo sigue en
 * la lista. Un rechazo nuevo **no** dispara el reintento: se encadenarían pushes sin fin; el siguiente disparador
 * es el cambio de la bóveda, el arranque o la reconexión.
 *
 * Las notas van antes que los INDICES: el servidor sólo deja borrar un INDICE cuando ya no quedan notas vivas bajo
 * su carpeta, y esas notas se mueven o borran en el mismo reintento. Los eventos del push van a `rejections.ts` y
 * `status.ts` igual que los de `pushOnce`.
 */
import type { RejectionsStore } from "../sync/rejections";
import { listenPush, type RuntimeReplication, type SyncEvent } from "../sync/replicator";
import type { SyncStatusStore } from "../sync/status";
import { vaultIsActive } from "../sync/vaultActive";
import { ID_PREFIX } from "../sync/vaultStore";
import { NOTE_ID_PREFIX, parseNoteId } from "./noteRules";

/** Los motivos de INDICE (H-031): se empujan después de las notas. */
const isIndexReason = (reason: string): boolean => reason.startsWith("index-");

export interface RepushDeps {
  db: PouchDB.Database;
  remote: PouchDB.Database;
  status: SyncStatusStore;
  rejections: RejectionsStore;
}

export interface Repush {
  /** Atiende un evento del replicador: una bóveda escrita por el push dispara el reintento. */
  handle(event: SyncEvent): void;
  /** Termina cuando acaba el reintento en curso (y los encolados). */
  settled(): Promise<void>;
  /** Deja de seguir la réplica. */
  close(): void;
}

export function startRepush({ db, remote, status, rejections }: RepushDeps): Repush {
  let closed = false;
  let queue: Promise<void> = Promise.resolve();
  /** Bóvedas con un reintento esperando turno: varios cambios seguidos dan un solo push. */
  const queued = new Set<string>();

  /**
   * Push de una vez de `docIds`; sus eventos van a los mismos almacenes que los de `pushOnce`. Los documentos que el
   * servidor no volvió a rechazar (se escribieron, o ya tenía todas sus revisiones) dejan de estar en la lista de
   * rechazos: PouchDB no emite nada en el segundo caso y el rechazo viejo se quedaría para siempre.
   */
  async function pushNotes(docIds: string[]): Promise<void> {
    const handled: Promise<void>[] = [];
    const denied = new Set<string>();
    const emit = (event: SyncEvent) => {
      if (event.type === "denied") denied.add(event.id);
      handled.push(status.handle(event), rejections.handle(event));
    };
    const replication = db.replicate.to(remote, { doc_ids: docIds, checkpoint: false });
    listenPush(replication as unknown as RuntimeReplication, emit);
    await replication;
    await Promise.all(handled);
    await rejections.resolve(docIds.filter((id) => !denied.has(id)));
  }

  async function retry(vaultId: string): Promise<void> {
    if (closed) return;
    // El rechazo del mismo lote puede estar aún escribiéndose (RD-3): se lee la lista al día.
    await rejections.settled();
    const prefix = `${NOTE_ID_PREFIX}${vaultId}:`;
    const mine = rejections.list().filter((item) => item.id.startsWith(prefix));
    if (mine.length === 0 || !(await vaultIsActive(db, vaultId))) return;
    const notes = mine.filter((item) => !isIndexReason(item.reason)).map((item) => item.id);
    const indexes = mine.filter((item) => isIndexReason(item.reason)).map((item) => item.id);
    if (notes.length > 0) await pushNotes(notes);
    if (indexes.length > 0) await pushNotes(indexes);
  }

  /**
   * Encola el reintento de `vaultId`: de uno en uno y, si ya hay uno esperando turno para esa
   * bóveda, ése basta (lee el estado de la réplica cuando le toca). Un fallo (sin red…) espera
   * al siguiente disparador.
   */
  function enqueue(vaultId: string): void {
    if (queued.has(vaultId)) return;
    queued.add(vaultId);
    queue = queue
      .then(() => {
        queued.delete(vaultId);
        return retry(vaultId);
      })
      .catch(() => undefined);
  }

  /** Reintenta todas las bóvedas con notas rechazadas (arranque, reconexión). */
  function enqueueAll(): void {
    const vaults = new Set<string>();
    for (const item of rejections.list()) {
      const parts = parseNoteId(item.id);
      if (parts) vaults.add(parts.vaultId);
    }
    vaults.forEach(enqueue);
  }

  // Reconexión: sólo la transición hacia "online" dispara (no cada aviso en línea).
  let wasOnline = false;
  const unsubscribe = status.subscribe(({ state }) => {
    if (state === "online" && !wasOnline && !closed) enqueueAll();
    wasOnline = state === "online";
  });
  enqueueAll();

  const feed = db.changes({ live: true, since: "now" }).on("change", (change) => {
    if (change.id.startsWith(ID_PREFIX)) enqueue(change.id.slice(ID_PREFIX.length));
  });

  return {
    handle(event) {
      if (event.type !== "written") return;
      for (const { id } of event.docs) if (id.startsWith(ID_PREFIX)) enqueue(id.slice(ID_PREFIX.length));
    },

    settled: () => queue,

    close() {
      closed = true;
      unsubscribe();
      feed.cancel();
    },
  };
}
