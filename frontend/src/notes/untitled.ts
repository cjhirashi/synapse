/**
 * Nombre por omisión de una nota creada sin título (SPEC-0008 RF-012).
 *
 * `Sin título.md`, después `Sin título 2.md`, `Sin título 3.md`…: el menor `n ≥ 2` libre.
 * La ocupación se decide por `pathKey` (NFKC + `casefold` de la ruta completa, que es el
 * `nameKey` de las bóvedas), igual que la unicidad que luego exige el servidor (RF-013).
 */
import { nameKey } from "../sync/vaultRules";
import { joinPath } from "./folders";

const BASE = "Sin título";

/**
 * @param existingKeys `pathKey` de las rutas ocupadas de la bóveda (notas activas).
 * @param folder Carpeta destino (`""` = raíz, SPEC-0010 RF-001/RF-003): el nombre libre se busca por carpeta.
 */
export function nextUntitledPath(existingKeys: ReadonlySet<string>, folder = ""): string {
  const name = (n: number) => (n === 1 ? `${BASE}.md` : `${BASE} ${n}.md`);
  let n = 1;
  for (; existingKeys.has(nameKey(joinPath(folder, name(n)))); n += 1);
  return joinPath(folder, name(n));
}
