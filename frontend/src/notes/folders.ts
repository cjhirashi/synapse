/**
 * Utilidades puras de carpetas del árbol de notas (SPEC-0010 RF-001, RF-003…RF-005, RF-042).
 *
 * Las carpetas no se guardan: se derivan de los prefijos de `path` de las notas. Aquí viven las
 * operaciones de ruta que `NoteSidebar`, `VaultWorkspacePage` y `noteStore` comparten, sin React.
 */
import { normalizePath, pathKey } from "./noteRules";
import type { NoteSummary } from "./noteStore";

/** Carácter de control (categoría `Cc`): mismo criterio que `check_path`. */
const CONTROL = /\p{Cc}/u;

/** Carpeta que contiene a `path` (`""` = raíz). */
export function parentFolder(path: string): string {
  return path.split("/").slice(0, -1).join("/");
}

/** Carpetas antecesoras de `path`, de la más externa a la más interna (`A/B/C.md` → `["A", "A/B"]`). */
export function ancestors(path: string): string[] {
  const segments = path.split("/").slice(0, -1);
  return segments.map((_, i) => segments.slice(0, i + 1).join("/"));
}

/** Une una carpeta y una ruta relativa (`""` = raíz, así no antepone `/`). */
export function joinPath(folder: string, rel: string): string {
  return folder === "" ? rel : `${folder}/${rel}`;
}

/**
 * Valida un nombre de carpeta (puede anidar con `/`): `empty` si queda vacío tras recortar espacios,
 * `empty-segment` si algún tramo queda vacío (`A//B`, `A/ /B`), `control` si tiene caracteres de
 * control, o `null` si es válido. El recorte por segmento es el mismo `normalizePath` que las rutas.
 */
export function checkFolderName(name: string): "empty" | "empty-segment" | "control" | null {
  const normalized = normalizePath(name);
  if (normalized === "") return "empty";
  if (normalized.split("/").some((segment) => segment === "")) return "empty-segment";
  if (CONTROL.test(normalized)) return "control";
  return null;
}

/**
 * ¿Ya existe la carpeta `parent/name` entre las notas (activas) de `summaries`? Se compara por
 * `pathKey` (NFKC + casefold) contra los prefijos de carpeta de cada nota, igual que la unicidad de rutas.
 */
export function folderExists(summaries: readonly NoteSummary[], parent: string, name: string): boolean {
  const target = pathKey(normalizePath(joinPath(parent, name)));
  const folders = new Set<string>();
  for (const summary of summaries) for (const folder of ancestors(summary.path)) folders.add(pathKey(folder));
  return folders.has(target);
}
