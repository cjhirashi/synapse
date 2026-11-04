/**
 * Reflejo en el cliente de `backend/app/core/index_rules.py` (H-031): el INDICE.md de cada carpeta.
 * Especificación compartida: `backend/tests/fixtures/indice_cuerpo.json`.
 */
import { pathKey } from "./noteRules";

export const INDEX_NAME = "INDICE.md";

/** ¿El último segmento de la ruta es el nombre reservado (NFKC + casefold)? */
export function isIndexPath(path: string): boolean {
  return path !== "" && pathKey(path.split("/").at(-1) ?? "") === pathKey(INDEX_NAME);
}

/** Carpeta que contiene la nota (`""` = raíz). */
export function folderOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash);
}

export function indexPathFor(folder: string): string {
  return folder === "" ? INDEX_NAME : `${folder}/${INDEX_NAME}`;
}

/** Carpetas de `path` de la raíz hacia dentro, incluida la raíz: `A/B/N.md` → `["", "A", "A/B"]`. */
export function ancestorFolders(path: string): string[] {
  const folder = folderOf(path);
  const out = [""];
  if (folder) {
    const parts = folder.split("/");
    for (let i = 1; i <= parts.length; i++) out.push(parts.slice(0, i).join("/"));
  }
  return out;
}

/** Claves del frontmatter cuyo valor difiere, sin contar las fechas. */
export function changedKeys(oldFm: Record<string, unknown> | null | undefined, newFm: Record<string, unknown> | null | undefined): string[] {
  const a = oldFm ?? {};
  const b = newFm ?? {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter(
    (key) => key !== "fecha_creacion" && key !== "fecha_actualizacion" && JSON.stringify(a[key]) !== JSON.stringify(b[key]));
}

export type IndexOp = "create_user" | "system_create" | "rename_or_move" | "edit" | "delete";

export interface IndexOpArgs {
  to?: string;
  changed?: readonly string[];
  contentChanged?: boolean;
  otherLiveBelowAfter?: number;
}

/** Código de rechazo de una operación sobre una nota o un INDICE, o `null` si pasa (mismos códigos que el servidor). */
export function checkIndexOp(op: IndexOp, path: string, args: IndexOpArgs = {}): string | null {
  const { to = "", changed = [], contentChanged = false, otherLiveBelowAfter = 0 } = args;
  switch (op) {
    case "create_user":
      return isIndexPath(path) ? "reserved-name:path" : null;
    case "rename_or_move":
      if (isIndexPath(path)) return "index-readonly:path";
      return isIndexPath(to) ? "reserved-name:path" : null;
    case "edit":
      if (!isIndexPath(path)) return null;
      if (contentChanged) return "index-readonly:content";
      return changed.some((key) => key !== "descripcion") ? "index-readonly:attr" : null;
    case "delete":
      if (!isIndexPath(path)) return null;
      if (folderOf(path) === "") return "index-root:delete";
      return otherLiveBelowAfter > 0 ? "index-readonly:delete" : null;
    default:
      return null;
  }
}
