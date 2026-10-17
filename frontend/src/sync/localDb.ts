/**
 * Réplica local de las bóvedas del usuario (SPEC-0005 RF-018; PLAN-0005 §2.5).
 *
 * Una sola base PouchDB por navegador (`synapse`, IndexedDB), que pertenece a un único
 * usuario: `_local/synapse-owner` guarda su `sub`. Los documentos `_local` no se replican,
 * así que la marca nunca sale del navegador.
 *
 * La réplica que se descarta al cerrar sesión no vuelve a usarse aunque su borrado falle
 * (RF-017, enmienda 4; PLAN-0005 §13 VF-4): antes de borrarla se anota en `localStorage`
 * que su borrado está pendiente, y `openLocalDb` termina ese borrado antes de abrirla, sea
 * cual sea su dueño. La marca va fuera de la réplica porque es IndexedDB la que falla.
 */
import PouchDB from "pouchdb-browser";

export const LOCAL_DB_NAME = "synapse";
export const OWNER_DOC_ID = "_local/synapse-owner";
/** Clave en `localStorage` de la marca de borrado pendiente, seguida del nombre de la base. */
export const DISCARD_MARK_PREFIX = "synapse-discarded:";

export interface LocalDbOptions {
  /** Nombre de la base; sólo lo cambian los tests (el adaptador en memoria comparte por nombre). */
  name?: string;
  /** Adaptador de PouchDB; por defecto el del navegador (IndexedDB). Los tests usan `memory`. */
  adapter?: string;
}

interface OwnerDoc {
  _id: typeof OWNER_DOC_ID;
  _rev?: string;
  sub: string;
}

function create({ name = LOCAL_DB_NAME, adapter }: LocalDbOptions): PouchDB.Database {
  // Sin `auto_compaction`: la combinación de conflictos (ADR-003) lee el cuerpo del
  // ancestro común, y compactar lo borraría.
  return new PouchDB(name, { auto_compaction: false, ...(adapter ? { adapter } : {}) });
}

async function readOwner(db: PouchDB.Database): Promise<string | null> {
  try {
    return ((await db.get(OWNER_DOC_ID)) as unknown as OwnerDoc).sub;
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }
}

/**
 * Si la réplica `name` tiene la marca de borrado pendiente. Una marca ilegible cuenta como
 * ausente: el navegador bloquea `localStorage` e IndexedDB con la misma política del sitio,
 * así que entonces tampoco hay réplica que abrir, y darla por presente borraría en cada
 * apertura los cambios sin confirmar del usuario.
 */
function isDiscarded(name: string): boolean {
  try {
    return localStorage.getItem(DISCARD_MARK_PREFIX + name) !== null;
  } catch (err) {
    console.error(err);
    return false;
  }
}

/** Quita la marca de la réplica `name`, que ya no existe. */
function clearDiscarded(name: string): void {
  try {
    localStorage.removeItem(DISCARD_MARK_PREFIX + name);
  } catch (err) {
    console.error(err);
  }
}

/**
 * Anota que la réplica se descarta: desde aquí no vuelve a abrirse, sólo a borrarse. Devuelve
 * si la marca quedó escrita; nunca lanza (lo llama una salida que no debe quedarse a medias).
 */
export function markDiscarded(db: PouchDB.Database): boolean {
  try {
    localStorage.setItem(DISCARD_MARK_PREFIX + db.name, "1");
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

/**
 * Abre la réplica del usuario `sub`.
 *
 * Si la réplica es de otro usuario, o su dueño es desconocido (restos de un borrado a
 * medias, o documentos `_local` que `update_seq` no cuenta), se destruye y se crea vacía
 * **antes** de replicar: nunca se suben ni se muestran datos de otra persona. Si el
 * navegador borró el almacenamiento, destruir la base vacía no cuesta nada. Una réplica con
 * la marca de borrado pendiente se destruye aunque sea del mismo usuario: lo descartado no
 * se sube (RF-017). Si destruir falla, rechaza y la marca sigue.
 */
export async function openLocalDb(sub: string, options: LocalDbOptions = {}): Promise<PouchDB.Database> {
  let db = create(options);
  if (!isDiscarded(db.name) && (await readOwner(db)) === sub) return db;
  await db.destroy();
  clearDiscarded(db.name);
  db = create(options);
  await db.put<OwnerDoc>({ _id: OWNER_DOC_ID, sub } as PouchDB.Core.PutDocument<OwnerDoc>);
  return db;
}

/**
 * Borra la réplica entera, con sus checkpoints y la marca de dueño (cierre de sesión, RF-017).
 * Quita la marca de borrado pendiente sólo si lo consiguió; si falla, la marca (que el que
 * sale pone antes con `markDiscarded`) deja el borrado para la próxima apertura.
 */
export async function destroyLocalDb(db: PouchDB.Database): Promise<void> {
  const { name } = db;
  await db.destroy();
  clearDiscarded(name);
}
