/**
 * Recursos de sincronización de un usuario (SPEC-0005 RF-009, RF-016, RF-017, RF-018;
 * PLAN-0005 §2.5), sin React: réplica local, almacenes de estado, rechazos y conflictos,
 * base remota, replicador y almacenes de bóvedas y de notas, cableados entre sí, más el
 * reintento dirigido de notas rechazadas por bóveda inexistente (SPEC-0008 P-7).
 *
 * Lo abre `SyncProvider` para la app y lo abren igual las pruebas de integración contra el
 * backend real (un juego por dispositivo simulado), así que ambas prueban el mismo cableado.
 */
import { createNoteStore, type NoteStore } from "../notes/noteStore";
import { startRepush, type Repush } from "../notes/repush";
import { openConflicts, type ConflictsStore } from "./conflicts";
import { openLocalDb, type LocalDbOptions } from "./localDb";
import { openRejections, type RejectionsStore } from "./rejections";
import { createRemoteDb } from "./remote";
import {
  BATCH_SIZE,
  createReplicator,
  listenPush,
  type Replicator,
  type ReplicatorOptions,
  type RuntimeReplication,
  type SyncEvent,
} from "./replicator";
import { openSyncStatus, seqNumber, type SyncStatusStore } from "./status";
import { createVaultStore, type VaultStore } from "./vaultStore";

/**
 * Dependencias sustituibles: réplica en memoria, remota y replicador falsos (pruebas de
 * componentes) o los de un dispositivo simulado (pruebas de integración).
 */
export interface SyncEnv {
  localDb?: LocalDbOptions;
  createRemote?: (onSessionExpired: () => void) => PouchDB.Database;
  createReplicator?: (options: ReplicatorOptions) => Replicator;
}

/** Lo que se abre para un usuario; `close()` lo detiene una sola vez. */
export interface SyncResources {
  db: PouchDB.Database;
  remote: PouchDB.Database;
  vaults: VaultStore;
  /** Notas de las bóvedas, en la misma réplica (SPEC-0008). */
  notes: NoteStore;
  status: SyncStatusStore;
  rejections: RejectionsStore;
  conflicts: ConflictsStore;
  replicator: Replicator;
  /** Reintento dirigido de `vault-not-found` (P-7); se cierra con los recursos. */
  repush: Repush;
  /**
   * Cada escritura en la réplica; el proveedor separa por prefijo `vault:` (`dataVersion`) y
   * `note:` (`notesVersion`), para que guardar una nota no relea las listas de bóvedas.
   */
  feed: PouchDB.Core.Changes<{}>;
  close(): Promise<void>;
}

/** Abre los recursos del usuario `sub`; el replicador queda creado, sin arrancar (`start()`). */
export async function openSyncResources(sub: string, env: SyncEnv = {}): Promise<SyncResources> {
  const db = await openLocalDb(sub, env.localDb);
  const status = await openSyncStatus(db);
  const rejections = await openRejections(db);
  const conflicts = await openConflicts(db);
  // El replicador se crea después que la remota, pero la remota avisa de la sesión caducada:
  // el aviso llega siempre más tarde, cuando el replicador ya existe.
  let replicator: Replicator | null = null;
  const onSessionExpired = () => replicator?.sessionExpired();
  const remote = (env.createRemote ?? ((expired) => createRemoteDb({ onSessionExpired: expired })))(onSessionExpired);
  // `repush` se crea con la remota ya lista; sus eventos llegan por `onEvent` desde entonces.
  let repush: Repush | null = null;
  const onEvent = (event: SyncEvent) => {
    void status.handle(event);
    void rejections.handle(event);
    repush?.handle(event);
  };
  replicator = (env.createReplicator ?? createReplicator)({ local: db, remote, onEvent });
  repush = startRepush({ db, remote, status, rejections });
  const feed = db.changes({ live: true, since: "now" });

  let closed: Promise<void> | null = null;
  const resources: SyncResources = {
    db,
    remote,
    vaults: createVaultStore(db, sub),
    notes: createNoteStore(db),
    status,
    rejections,
    conflicts,
    replicator,
    repush,
    feed,
    close() {
      closed ??= (async () => {
        feed.cancel();
        repush?.close();
        await resources.replicator.stop();
        status.close();
        rejections.close();
        conflicts.close();
      })();
      return closed;
    },
  };
  return resources;
}

/**
 * Qué queda sin confirmar al pedir la salida (RF-017), con el estado actual de la réplica:
 * espera las escrituras de rechazos en curso, relee la secuencia y cuenta los rechazos (un
 * cambio rechazado tampoco está en el servidor).
 * - `none`: el servidor confirmó todo; se puede salir sin aviso.
 * - `pending`: hay cambios locales sin confirmar o rechazados.
 * - `unreadable`: la réplica no pudo leerse; no se puede afirmar que todo esté confirmado,
 *   así que también se avisa, diciendo por qué (VD-3, VE-2).
 */
export type Unconfirmed = "none" | "pending" | "unreadable";

export async function unconfirmedState(resources: SyncResources): Promise<Unconfirmed> {
  try {
    await resources.rejections.settled();
    const { pending } = await resources.status.refresh();
    return pending || resources.rejections.list().length > 0 ? "pending" : "none";
  } catch (err) {
    console.error(err);
    return "unreadable";
  }
}

/**
 * Push de una vez para "Sincronizar y salir". Sus escritas y rechazos van a los mismos
 * almacenes que los de la replicación continua. Devuelve si el servidor confirmó todo: sin
 * fallos de escritura, sin rechazos pendientes y con la secuencia local entera recorrida.
 */
export async function pushOnce(resources: SyncResources): Promise<boolean> {
  const handled: Promise<void>[] = [];
  const emit = (event: SyncEvent) => {
    handled.push(resources.status.handle(event), resources.rejections.handle(event));
  };
  try {
    const replication = resources.db.replicate.to(resources.remote, { batch_size: BATCH_SIZE });
    listenPush(replication as unknown as RuntimeReplication, emit);
    const result = await replication;
    await Promise.all(handled);
    const { update_seq } = await resources.db.info();
    return (
      result.ok &&
      result.doc_write_failures === 0 &&
      resources.rejections.list().length === 0 &&
      seqNumber(result.last_seq) >= seqNumber(update_seq)
    );
  } catch {
    // Sin conexión, 503 o sesión caducada a mitad: no se confirmó nada.
    return false;
  }
}
