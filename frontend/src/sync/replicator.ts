/**
 * Replicador de la réplica local con el canal `/sync` (SPEC-0005 RF-010, RF-016, RF-019;
 * R-10; PLAN-0005 §2.5).
 *
 * Replicación continua en ambos sentidos (`local.sync(remote)`) con reintentos y espera
 * creciente. Un solo replicador por navegador: la pestaña que obtiene el Web Lock
 * `synapse-sync` replica y difunde sus eventos por `BroadcastChannel`; las demás leen la
 * réplica (compartida en IndexedDB) y reciben los eventos por el canal. Al cerrarse esa
 * pestaña el navegador suelta el cerrojo y lo toma la siguiente.
 *
 * Los eventos son datos planos (se clonan para el `BroadcastChannel`); `status.ts`,
 * `rejections.ts` y la UI los interpretan.
 */

/** Documentos por lote de la replicación (PLAN-0005 §2.5). */
export const BATCH_SIZE = 50;
export const LOCK_NAME = "synapse-sync";
export const CHANNEL_NAME = "synapse-sync";

/** Mensaje interno del canal: una pestaña nueva pide el estado actual a la que replica. */
const HELLO = "synapse-sync-hello";

const FIRST_BACK_OFF = 1_000;
const MAX_BACK_OFF = 60_000;

export type Direction = "push" | "pull";

export type SyncEvent =
  /** La replicación en ese sentido está transfiriendo. */
  | { type: "active"; direction: Direction }
  /** Al día (`offline: false`) o detenida por un error de red o 503 (`offline: true`, RF-019). */
  | { type: "paused"; direction: Direction; offline: boolean }
  /** El servidor confirmó la réplica local hasta esta secuencia (checkpoint del push). */
  | { type: "checkpoint"; seq: number | string }
  /** El push escribió estas revisiones en el servidor. */
  | { type: "written"; docs: { id: string; rev: string }[] }
  /** El servidor rechazó una revisión del push con su motivo (RF-006). */
  | { type: "denied"; id: string; rev: string | null; reason: string }
  /** Sesión caducada: replicación detenida hasta `resume()` (RF-016). */
  | { type: "session-expired" }
  /** Error que PouchDB no reintenta: la replicación terminó. */
  | { type: "error"; message: string };

export interface ReplicatorOptions {
  local: PouchDB.Database;
  remote: PouchDB.Database;
  onEvent: (event: SyncEvent) => void;
  /** Web Locks; por defecto `navigator.locks`. Sin ellos (navegador antiguo, jsdom) replica sin coordinar. */
  locks?: LockManager | null;
  /** Nombre del `BroadcastChannel`; sólo lo cambian los tests. */
  channelName?: string;
}

export interface Replicator {
  /** Pide el cerrojo y, al obtenerlo, empieza a replicar. */
  start(): void;
  /** Detiene la replicación sin tocar la réplica y avisa "sesión caducada" (RF-016). */
  sessionExpired(): void;
  /** Reanuda tras volver a iniciar sesión el mismo usuario. */
  resume(): void;
  /** Detiene la replicación, suelta (o deja de esperar) el cerrojo y cierra el canal. */
  stop(): Promise<void>;
}

/**
 * Espera antes del siguiente reintento: 1 s, 2 s, 4 s… hasta 60 s (RF-019). PouchDB la
 * llama con la espera anterior y la reinicia a 0 al volver a `active` tras un error, así
 * que después de una sincronización correcta se empieza otra vez por 1 s.
 */
export function backOff(previous: number): number {
  return previous <= 0 ? FIRST_BACK_OFF : Math.min(previous * 2, MAX_BACK_OFF);
}

/**
 * Forma en tiempo de ejecución de `Sync` en PouchDB 9: los tipos no declaran sus dos
 * replicaciones (`push`, `pull`) ni el evento `checkpoint`.
 */
interface RuntimeReplication {
  on(event: string, listener: (...args: never[]) => void): unknown;
}
interface RuntimeSync {
  push: RuntimeReplication;
  pull: RuntimeReplication;
  cancel(): void;
}

/** Rechazo del push tal como lo entrega PouchDB (`generateErrorFromResponse`). */
interface DeniedDoc {
  id?: string;
  rev?: string;
  reason?: string;
  message?: string;
}

export function createReplicator({
  local,
  remote,
  onEvent,
  locks = typeof navigator !== "undefined" ? navigator.locks ?? null : null,
  channelName = CHANNEL_NAME,
}: ReplicatorOptions): Replicator {
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(channelName) : null;
  let leader = false;
  let expired = false;
  let sync: RuntimeSync | null = null;
  let releaseLock: (() => void) | null = null;
  let lockRequest: AbortController | null = null;
  /** Último `active`/`paused` de cada sentido, para contestar a las pestañas nuevas. */
  const phase: Record<Direction, SyncEvent | null> = { push: null, pull: null };

  // Las pestañas que no replican reciben los eventos de la que sí (el emisor no recibe los
  // suyos). Una pestaña nueva saluda y la que replica le reenvía el estado actual.
  if (channel) {
    channel.onmessage = (message: MessageEvent<SyncEvent | typeof HELLO>) => {
      if (message.data === HELLO) {
        if (leader) snapshot().forEach((event) => channel.postMessage(event));
      } else if (!leader) {
        onEvent(message.data);
      }
    };
  }

  function snapshot(): SyncEvent[] {
    const events = [phase.push, phase.pull].filter((event): event is SyncEvent => event !== null);
    return expired ? [...events, { type: "session-expired" }] : events;
  }

  function emit(event: SyncEvent): void {
    if (event.type === "active" || event.type === "paused") phase[event.direction] = event;
    onEvent(event);
    if (leader) channel?.postMessage(event);
  }

  function listen(direction: Direction, replication: RuntimeReplication): void {
    replication.on("active", () => emit({ type: "active", direction }));
    // PouchDB pasa el error sólo cuando se detiene para reintentar (`backOff`).
    replication.on("paused", (err?: unknown) => emit({ type: "paused", direction, offline: err != null }));
    replication.on("error", (err: { message?: string }) => emit({ type: "error", message: String(err?.message ?? err) }));
    if (direction !== "push") return;
    replication.on("change", (info: { docs?: { _id: string; _rev: string }[] }) => {
      emit({ type: "written", docs: (info.docs ?? []).map((doc) => ({ id: doc._id, rev: doc._rev })) });
    });
    replication.on("denied", (doc: DeniedDoc) => {
      emit({ type: "denied", id: String(doc.id), rev: doc.rev ?? null, reason: String(doc.reason ?? doc.message) });
    });
    // `checkpoint` también avisa de pasos intermedios; sólo `{ checkpoint }` es una secuencia confirmada.
    replication.on("checkpoint", (info: { checkpoint?: number | string }) => {
      if (info.checkpoint !== undefined) emit({ type: "checkpoint", seq: info.checkpoint });
    });
  }

  function startSync(): void {
    if (sync || expired || !leader) return;
    const options = { live: true, retry: true, batch_size: BATCH_SIZE, back_off_function: backOff };
    sync = local.sync(remote, options) as unknown as RuntimeSync;
    listen("push", sync.push);
    listen("pull", sync.pull);
  }

  function stopSync(): void {
    sync?.cancel();
    sync = null;
  }

  return {
    start() {
      if (leader || lockRequest) return;
      if (!locks) {
        leader = true;
        startSync();
        return;
      }
      channel?.postMessage(HELLO);
      lockRequest = new AbortController();
      // El cerrojo se mantiene mientras la promesa del callback no se resuelva.
      locks
        .request(LOCK_NAME, { signal: lockRequest.signal }, () => new Promise<void>((resolve) => {
          releaseLock = resolve;
          leader = true;
          startSync();
        }))
        .catch((err: unknown) => {
          // `stop()` antes de obtener el cerrojo: la petición se cancela, no es un fallo.
          if ((err as { name?: string })?.name !== "AbortError") throw err;
        });
    },

    sessionExpired() {
      expired = true;
      stopSync();
      emit({ type: "session-expired" });
    },

    resume() {
      expired = false;
      startSync();
    },

    async stop() {
      stopSync();
      lockRequest?.abort();
      lockRequest = null;
      releaseLock?.();
      releaseLock = null;
      leader = false;
      channel?.close();
    },
  };
}
