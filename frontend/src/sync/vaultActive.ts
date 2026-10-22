/**
 * ¿Está activa una bóveda en la réplica? (SPEC-0008 RF-004, RF-009, RF-014; PLAN-0008 P-9, RD-1).
 *
 * Una bóveda es activa si **alguna rama viva** (la ganadora o una de `_conflicts`) tiene
 * `deleted_at = null`, el mismo criterio que aplica el servidor en el push (paso 6c). Mirar
 * sólo la ganadora daría un resultado distinto según qué rama elija PouchDB. Las ramas
 * cerradas (lápidas) no cuentan: `_conflicts` sólo lista hojas vivas.
 */
import { ID_PREFIX } from "./vaultStore";

type VaultLeaf = { deleted_at: string | null };

export async function vaultIsActive(db: PouchDB.Database, vaultId: string): Promise<boolean> {
  const id = ID_PREFIX + vaultId;
  let winner: VaultLeaf & { _conflicts?: string[] };
  try {
    winner = await db.get<VaultLeaf>(id, { conflicts: true });
  } catch (err) {
    if ((err as { status?: number } | null)?.status === 404) return false;
    throw err;
  }
  if (winner.deleted_at === null) return true;
  for (const rev of winner._conflicts ?? []) {
    try {
      if ((await db.get<VaultLeaf>(id, { rev })).deleted_at === null) return true;
    } catch (err) {
      // Una rama compactada o sin cuerpo no puede dar la bóveda por activa.
      if ((err as { status?: number } | null)?.status !== 404) throw err;
    }
  }
  return false;
}
