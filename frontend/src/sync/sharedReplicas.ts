/**
 * Registro de las réplicas locales de bóvedas compartidas (H-064 F7c). Contienen datos de otra persona: se borran al cerrar
 * sesión y cuando entra otra cuenta. El registro vive en `localStorage`; al cerrar sesión también se barren las que
 * `indexedDB` conserve sin estar anotadas (por si el almacenamiento estaba bloqueado al abrirlas).
 */
import PouchDB from "pouchdb-browser";

export interface SharedReplicaEntry {
  name: string;
  sub: string;
}

export interface PurgeOptions {
  /** Conserva las réplicas de esta cuenta y destruye las demás; sin él, destruye todas y barre las no anotadas. */
  exceptSub?: string;
  /** Adaptador de PouchDB (los tests usan `memory`). */
  pouch?: { adapter?: string };
}

const STORAGE_KEY = "synapse-shared-replicas";
/** PouchDB guarda cada base en IndexedDB como `_pouch_<nombre>`; el prefijo no alcanza a la réplica principal `synapse`. */
const IDB_PREFIX = "_pouch_";
const SHARED_MARK = "synapse-shared-";

const isEntry = (value: unknown): value is SharedReplicaEntry =>
  typeof value === "object" && value !== null && typeof (value as SharedReplicaEntry).name === "string" && typeof (value as SharedReplicaEntry).sub === "string";

function readRegistry(): SharedReplicaEntry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

function writeRegistry(entries: SharedReplicaEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (err) {
    console.error(err);
  }
}

export function rememberSharedReplica(name: string, sub: string): void {
  const entries = readRegistry();
  if (entries.some((entry) => entry.name === name && entry.sub === sub)) return;
  writeRegistry([...entries, { name, sub }]);
}

export function forgetSharedReplica(name: string): void {
  writeRegistry(readRegistry().filter((entry) => entry.name !== name));
}

/** Réplicas compartidas que `indexedDB` conserva, anotadas o no. Sin `indexedDB.databases()` (o bloqueado) no hay barrido. */
async function storedSharedNames(): Promise<string[]> {
  try {
    const databases = (await indexedDB.databases?.()) ?? [];
    return databases.flatMap((db) => (db.name?.startsWith(IDB_PREFIX + SHARED_MARK) ? [db.name.slice(IDB_PREFIX.length)] : []));
  } catch {
    return [];
  }
}

/** Destruye las réplicas compartidas que corresponda; una que falla sigue anotada y las demás se destruyen. Nunca lanza. */
export async function purgeSharedReplicas({ exceptSub, pouch }: PurgeOptions = {}): Promise<void> {
  const targets = new Set(readRegistry().filter((entry) => entry.sub !== exceptSub).map((entry) => entry.name));
  if (exceptSub === undefined) for (const name of await storedSharedNames()) targets.add(name);
  const destroyed = new Set<string>();
  for (const name of targets) {
    try {
      await new PouchDB(name, pouch?.adapter ? { adapter: pouch.adapter } : {}).destroy();
      destroyed.add(name);
    } catch (err) {
      console.error(`No se pudo destruir la réplica compartida «${name}»:`, err);
    }
  }
  if (destroyed.size > 0) writeRegistry(readRegistry().filter((entry) => !destroyed.has(entry.name)));
}
