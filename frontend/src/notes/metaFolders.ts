/**
 * Sección META del árbol (H-030): las carpetas reservadas de la raíz de cada bóveda se muestran agrupadas
 * ENCIMA de «Raíz» y no se repiten dentro de ella. Es sólo agrupación visual: la ruta física sigue siendo
 * la raíz (`AG - SKILLS/…`) y el servidor es quien impide renombrarlas, moverlas o borrar su INDICE.
 * Reflejo en el cliente de `META_FOLDERS` de `backend/app/core/ag_rules.py`, mismo orden y misma
 * equivalencia de nombres (`pathKey`: NFKC + casefold).
 */
import { pathKey } from "./noteRules";
import type { FolderNode, TreeNode } from "./noteTree";

export const META_FOLDERS = ["AG - SKILLS", "AG - MENSAJES", "AG - AGENTES", "BITACORA", "PLANTILLAS"] as const;

/** Posición de cada carpeta reservada en META (el orden de la lista de arriba). */
const META_ORDER = new Map<string, number>(META_FOLDERS.map((name, index) => [pathKey(name), index]));

/** ¿`path` es exactamente una carpeta reservada de la raíz? Una subcarpeta con ese nombre no lo es. */
export function isMetaFolderPath(path: string): boolean {
  return META_ORDER.has(pathKey(path));
}

/** Nombre canónico de una carpeta reservada de la raíz, o `null` si `path` no es una. */
export function canonicalMetaName(path: string): string | null {
  // Solo las carpetas de la raíz (sin "/") pueden ser reservadas.
  if (path.includes("/")) return null;
  for (const name of META_FOLDERS) {
    if (pathKey(name) === pathKey(path)) {
      return name;
    }
  }
  return null;
}

/** Separa el árbol de la raíz en las carpetas reservadas (en el orden de META) y el resto, sin tocar los hijos. */
export function splitMeta<T>(tree: TreeNode<T>[]): { meta: FolderNode<T>[]; rest: TreeNode<T>[] } {
  const meta: FolderNode<T>[] = [];
  const rest: TreeNode<T>[] = [];
  for (const node of tree) {
    if (node.kind === "folder" && isMetaFolderPath(node.path)) meta.push(node);
    else rest.push(node);
  }
  meta.sort((a, b) => (META_ORDER.get(pathKey(a.path)) ?? 0) - (META_ORDER.get(pathKey(b.path)) ?? 0));
  return { meta, rest };
}
