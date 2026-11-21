/**
 * Mantener al día la réplica de una bóveda compartida cuando cambia lo que la persona puede leer (H-064 F7e).
 *
 * El feed de cambios solo emite lo que cambia después del último punto de sincronización: si el propietario AMPLÍA las concesiones,
 * lo que ya existía no llega nunca; si las REDUCE o mueve una nota fuera de lo legible, la copia vieja se queda. La solución
 * uniforme es reconstruir la réplica: empujar lo pendiente, destruirla y volver a bajarla con las concesiones de ahora.
 */
import type { Grant } from "../sharing/sharingApi";

const GRANTS_DOC = "_local/shared-grants";
const NOTES = { startkey: "note:", endkey: "note:￿" };

/** Concesiones en forma canónica (sin importar el orden): la marca con la que se construyó la réplica. */
export function grantsKey(grants: readonly Grant[]): string {
  return JSON.stringify([...grants].map(({ folder, level }) => [folder, level]).sort((a, b) => (a.join(" ") < b.join(" ") ? -1 : 1)));
}

export async function storedGrantsKey(db: PouchDB.Database): Promise<string | null> {
  try {
    return (await db.get<{ key: string }>(GRANTS_DOC)).key;
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }
}

export async function storeGrantsKey(db: PouchDB.Database, key: string): Promise<void> {
  let rev: string | undefined;
  try {
    rev = (await db.get(GRANTS_DOC))._rev;
  } catch (err) {
    if ((err as { status?: number }).status !== 404) throw err;
  }
  await db.put({ _id: GRANTS_DOC, _rev: rev, key });
}

/**
 * Notas que la réplica tiene y el servidor tiene pero ya no deja leer a esta persona. Se distinguen de las que solo existen en
 * la réplica (creadas sin conexión y aún sin subir) preguntando al servidor por su revisión: si la conoce, ya no es legible.
 */
export async function unreadableLocalNotes(db: PouchDB.Database, remote: PouchDB.Database): Promise<string[]> {
  const local = await db.allDocs(NOTES);
  if (local.rows.length === 0) return [];
  const readable = new Set((await remote.allDocs()).rows.map((row) => row.id));
  const candidates: Record<string, string[]> = {};
  for (const row of local.rows) if (!readable.has(row.id)) candidates[row.id] = [row.value.rev];
  if (Object.keys(candidates).length === 0) return [];
  const diff = await remote.revsDiff(candidates);
  return Object.keys(candidates).filter((id) => diff[id] === undefined);
}

export interface PushResult {
  /** ¿Se pudo subir? (`false` sin conexión o ante un fallo: no se reconstruye, se conserva la réplica). */
  ok: boolean;
  /** Cambios locales que el servidor rechazó (ya no hay escritura donde se hicieron): se perderán al reconstruir. */
  discarded: number;
}

/** Sube de una vez lo pendiente de la réplica; lo rechazado por el servidor se cuenta, no se reintenta. */
export async function pushPending(db: PouchDB.Database, remote: PouchDB.Database): Promise<PushResult> {
  let discarded = 0;
  try {
    const replication = db.replicate.to(remote, { batch_size: 50 });
    (replication as unknown as { on(event: string, fn: () => void): void }).on("denied", () => {
      discarded += 1;
    });
    const result = await replication;
    return { ok: result.ok, discarded };
  } catch {
    return { ok: false, discarded };
  }
}
