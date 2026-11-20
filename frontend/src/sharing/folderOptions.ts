/** Opciones de carpeta para el editor de permisos (H-064). */
import { ancestors } from "../notes/folders";
import { META_FOLDERS } from "../notes/metaFolders";

/** Convierte rutas de notas en opciones de carpeta únicas, ordenadas, sin reservadas. */
export function folderOptions(paths: string[]): string[] {
  const reserved = new Set(META_FOLDERS.map((f) => f.split("/")[0]));
  const folders = new Set<string>();

  for (const path of paths) {
    for (const folder of ancestors(path)) {
      const firstSegment = folder.split("/")[0];
      if (!reserved.has(firstSegment)) {
        folders.add(folder);
      }
    }
  }

  return Array.from(folders).sort((a, b) => a.localeCompare(b, "es"));
}
