/**
 * Rechazos del push (SPEC-0005 RF-006; PLAN-0005 §2.5).
 *
 * Lista persistente de las revisiones que el servidor rechazó, con su motivo, para que la UI
 * las muestre y ofrezca corregirlas: el cambio local nunca se descarta (sigue en la réplica).
 * Hay una entrada por documento, la del último rechazo. Se quita cuando el push escribe en
 * el servidor una revisión de ese documento: PouchDB sólo sube hojas, así que es la versión
 * corregida (o la misma, si al fin se aceptó). Las revisiones rechazadas nunca llegan en el
 * evento `written` (PouchDB las separa como `denied`).
 *
 * La lista vive en `_local/synapse-rejections` y sobrevive a recargar. Todas las pestañas
 * procesan los mismos eventos, así que cada cambio se aplica sobre el documento recién
 * leído y se reintenta ante el 409 de otra pestaña (aplicarlo dos veces da lo mismo).
 */
import type { SyncEvent } from "./replicator";

export const REJECTIONS_DOC_ID = "_local/synapse-rejections";

export interface Rejection {
  /** Id del documento (`vault:{uuid}`). */
  id: string;
  /** Revisión rechazada (`null` si el servidor no la indicó). */
  rev: string | null;
  /** Código de motivo del servidor (p. ej. `vault-name-taken`); la UI lo traduce. */
  reason: string;
}

export interface RejectionsStore {
  list(): Rejection[];
  subscribe(listener: (items: Rejection[]) => void): () => void;
  /** Aplica un evento; la promesa termina cuando la lista persistida está escrita. */
  handle(event: SyncEvent): Promise<void>;
  /**
   * Termina cuando están aplicadas todas las escrituras encoladas hasta ahora (nunca falla).
   * Lo usa el cierre de sesión para decidir con la lista al día (RF-017, VC-4).
   */
  settled(): Promise<void>;
  /** Deja de avisar a los suscriptores. */
  close(): void;
}

interface StoredRejections {
  _id: typeof REJECTIONS_DOC_ID;
  _rev?: string;
  items: Rejection[];
}

type Change = (items: Rejection[]) => Rejection[];

async function readStored(db: PouchDB.Database): Promise<StoredRejections> {
  try {
    return (await db.get(REJECTIONS_DOC_ID)) as unknown as StoredRejections;
  } catch (err) {
    if ((err as { status?: number }).status === 404) return { _id: REJECTIONS_DOC_ID, items: [] };
    throw err;
  }
}

function sameItems(a: Rejection[], b: Rejection[]): boolean {
  return a.length === b.length && a.every((item, i) => item.id === b[i].id && item.rev === b[i].rev && item.reason === b[i].reason);
}

/**
 * Aplica `change` a la lista guardada (sin escribir si no cambia nada); reintenta si otra
 * pestaña escribió antes. Devuelve la lista final.
 */
async function applyStored(db: PouchDB.Database, change: Change): Promise<Rejection[]> {
  for (;;) {
    const stored = await readStored(db);
    const items = change(stored.items);
    if (sameItems(items, stored.items)) return stored.items;
    try {
      await db.put({ ...stored, items } as unknown as PouchDB.Core.PutDocument<{}>);
      return items;
    } catch (err) {
      if ((err as { status?: number }).status !== 409) throw err;
    }
  }
}

/** El cambio que produce un evento, o `null` si no afecta a los rechazos. */
function changeFor(event: SyncEvent): Change | null {
  if (event.type === "denied") {
    const entry: Rejection = { id: event.id, rev: event.rev, reason: event.reason };
    return (items) => [...items.filter((item) => item.id !== event.id), entry];
  }
  if (event.type === "written" && event.docs.length > 0) {
    const written = new Set(event.docs.map((doc) => doc.id));
    return (items) => items.filter((item) => !written.has(item.id));
  }
  return null;
}

export async function openRejections(db: PouchDB.Database): Promise<RejectionsStore> {
  let items = (await readStored(db)).items;
  const listeners = new Set<(items: Rejection[]) => void>();
  let writes: Promise<void> = Promise.resolve();

  return {
    list: () => items,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    handle(event) {
      const change = changeFor(event);
      if (!change) return Promise.resolve();
      // En orden dentro de la pestaña; cada escritura parte del documento recién leído, así
      // que un fallo sólo se devuelve a quien lo espera y la cola sigue con la siguiente.
      const run = writes.then(async () => {
        const next = await applyStored(db, change);
        const changed = !sameItems(next, items);
        items = next;
        if (changed) listeners.forEach((listener) => listener(items));
      });
      writes = run.catch(() => undefined);
      return run;
    },

    settled: () => writes,

    close() {
      listeners.clear();
    },
  };
}
