/**
 * Reintento dirigido de las notas rechazadas con `vault-not-found` (SPEC-0008 RF-004, RF-014;
 * PLAN-0008 P-7).
 *
 * El feed de cambios ordena por la última secuencia: si una bóveda creada sin conexión se
 * edita después de crear sus notas y el corte de lote cae entre ambas, la nota llega antes
 * que su bóveda y el servidor la rechaza (RF-004 lo exige). `forbidden` no se reintenta, así
 * que la nota no subiría hasta otra edición suya. Este módulo lo resuelve: cuando la bóveda
 * `V` queda activa en la réplica (cambio local o del pull) o el push la escribe en el
 * servidor, lanza un push de una vez sólo con las notas rechazadas de `V`
 * (`doc_ids`, sin tocar el checkpoint) y no escribe revisiones nuevas. Cubre también la
 * bóveda restaurada de la papelera.
 *
 * Otros dos disparadores cubren lo que el feed de la bóveda no ve (RD-2): al abrirse, las
 * notas con `vault-not-found` persistidas cuya bóveda ya está activa (la bóveda no volverá a
 * cambiar), y cada vuelta a "en línea" tras un fallo de red. Un fallo del push no se
 * reintenta por sí mismo: el rechazo sigue en la lista y espera a esos disparadores.
 *
 * Un rechazo nuevo **no** dispara el reintento: si la bóveda sigue sin estar en el servidor
 * volvería a rechazarse y se encadenarían pushes sin fin; el siguiente disparador es la
 * propia bóveda llegando al servidor. Los eventos del push van a `rejections.ts` y
 * `status.ts` igual que los de `pushOnce`.
 */
import type { RejectionsStore } from "../sync/rejections";
import { listenPush, type RuntimeReplication, type SyncEvent } from "../sync/replicator";
import type { SyncStatusStore } from "../sync/status";
import { vaultIsActive } from "../sync/vaultActive";
import { ID_PREFIX } from "../sync/vaultStore";
import { NOTE_ID_PREFIX, parseNoteId } from "./noteRules";

/** Motivo del rechazo que se reintenta (el único que se resuelve solo al llegar la bóveda). */
const VAULT_NOT_FOUND = "vault-not-found";

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

  /** Push de una vez de `docIds`; sus eventos van a los mismos almacenes que los de `pushOnce`. */
  async function pushNotes(docIds: string[]): Promise<void> {
    const handled: Promise<void>[] = [];
    const emit = (event: SyncEvent) => {
      handled.push(status.handle(event), rejections.handle(event));
    };
    const replication = db.replicate.to(remote, { doc_ids: docIds, checkpoint: false });
    listenPush(replication as unknown as RuntimeReplication, emit);
    await replication;
    await Promise.all(handled);
  }

  async function retry(vaultId: string): Promise<void> {
    if (closed) return;
    // El rechazo del mismo lote puede estar aún escribiéndose (RD-3): se lee la lista al día.
    await rejections.settled();
    const prefix = `${NOTE_ID_PREFIX}${vaultId}:`;
    const docIds = rejections
      .list()
      .filter((item) => item.reason === VAULT_NOT_FOUND && item.id.startsWith(prefix))
      .map((item) => item.id);
    if (docIds.length === 0 || !(await vaultIsActive(db, vaultId))) return;
    await pushNotes(docIds);
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

  /** Reintenta todas las bóvedas con notas rechazadas por `vault-not-found` (arranque, reconexión). */
  function enqueueAll(): void {
    const vaults = new Set<string>();
    for (const item of rejections.list()) {
      if (item.reason !== VAULT_NOT_FOUND) continue;
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
