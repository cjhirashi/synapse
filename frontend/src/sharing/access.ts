/**
 * Acceso de un miembro invitado a una nota por su ruta (H-064 F7d). Puerto exacto de `level_of` del servidor
 * (`backend/app/core/vault_access.py`); `accessParity.json` lo fija contra lo que calcula el servidor. El servidor sigue
 * siendo quien decide: esto evita ofrecer, y escribir en la réplica, lo que se rechazaría.
 */
import { metaFolderOf } from "../notes/metaRules";
import { pathKey } from "../notes/noteRules";
import type { Grant } from "./sharingApi";

export type Level = "lectura" | "escritura";

const HIDDEN_ZONES = new Set(["AG - AGENTES", "AG - SKILLS", "AG - MENSAJES", "BITACORA"]);

const inFolder = (path: string, folder: string) => pathKey(path).startsWith(`${pathKey(folder)}/`);

/** `escritura`, `lectura` o `null` (sin acceso) sobre la nota de ruta `path`. */
export function levelOf(grants: readonly Grant[], path: string): Level | null {
  const zone = metaFolderOf(path);
  if (zone !== null && HIDDEN_ZONES.has(zone)) return null;
  if (zone === "PLANTILLAS") return "lectura";
  let level: Level | null = null;
  for (const grant of grants) {
    if (grant.folder === "*" || inFolder(path, grant.folder)) {
      if (grant.level === "escritura") return "escritura";
      level = "lectura";
    }
  }
  return level;
}

export const canWritePath = (grants: readonly Grant[], path: string) => levelOf(grants, path) === "escritura";

/** ¿Alguna concesión da escritura? (si no, la bóveda se abre de solo lectura). */
export const hasWriteGrant = (grants: readonly Grant[]) => grants.some((grant) => grant.level === "escritura");
