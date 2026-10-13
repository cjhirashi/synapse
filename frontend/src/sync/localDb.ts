/**
 * Réplica local de las bóvedas del usuario (SPEC-0005 RF-018; PLAN-0005 §2.5).
 *
 * Una sola base PouchDB por navegador (`synapse`, IndexedDB), que pertenece a un único
 * usuario: `_local/synapse-owner` guarda su `sub`. Los documentos `_local` no se replican,
 * así que la marca nunca sale del navegador.
 */
import PouchDB from "pouchdb-browser";

export const LOCAL_DB_NAME = "synapse";
export const OWNER_DOC_ID = "_local/synapse-owner";

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
 * Abre la réplica del usuario `sub`.
 *
 * Si la réplica es de otro usuario, o su dueño es desconocido (restos de un borrado a
 * medias, o documentos `_local` que `update_seq` no cuenta), se destruye y se crea vacía
 * **antes** de replicar: nunca se suben ni se muestran datos de otra persona. Si el
 * navegador borró el almacenamiento, destruir la base vacía no cuesta nada.
 */
export async function openLocalDb(sub: string, options: LocalDbOptions = {}): Promise<PouchDB.Database> {
  let db = create(options);
  const owner = await readOwner(db);
  if (owner === sub) return db;
  await db.destroy();
  db = create(options);
  await db.put<OwnerDoc>({ _id: OWNER_DOC_ID, sub } as PouchDB.Core.PutDocument<OwnerDoc>);
  return db;
}

/** Borra la réplica entera, con sus checkpoints y la marca de dueño (cierre de sesión, RF-017). */
export async function destroyLocalDb(db: PouchDB.Database): Promise<void> {
  await db.destroy();
}
