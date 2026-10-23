/**
 * Nombre por omisión de una nota creada sin título (SPEC-0008 RF-012).
 *
 * `Sin título.md`, después `Sin título 2.md`, `Sin título 3.md`…: el menor `n ≥ 2` libre.
 * La ocupación se decide por `pathKey` (NFKC + `casefold` de la ruta completa, que es el
 * `nameKey` de las bóvedas), igual que la unicidad que luego exige el servidor (RF-013).
 */
import { nameKey } from "../sync/vaultRules";

const BASE = "Sin título";

/**
 * @param existingKeys `pathKey` de las rutas ocupadas de la bóveda (notas activas).
 */
export function nextUntitledPath(existingKeys: ReadonlySet<string>): string {
  let path = `${BASE}.md`;
  for (let n = 2; existingKeys.has(nameKey(path)); n++) path = `${BASE} ${n}.md`;
  return path;
}
