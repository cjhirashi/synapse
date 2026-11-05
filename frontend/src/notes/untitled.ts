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
 * @param finalPath Ruta con la que se guardará un candidato (H-041: en `AG - SKILLS` el nombre se estructura, y
 *   `Sin título 2` ocuparía `skill-sin-titulo-2.md`): la ocupación se decide sobre esa ruta final. Por omisión, la misma.
 */
export function nextUntitledPath(
  existingKeys: ReadonlySet<string>, folder = "", finalPath: (path: string) => string = (path) => path,
): string {
  const name = (n: number) => (n === 1 ? `${BASE}.md` : `${BASE} ${n}.md`);
  let n = 1;
  for (; existingKeys.has(nameKey(finalPath(joinPath(folder, name(n))))); n += 1);
  return joinPath(folder, name(n));
}
