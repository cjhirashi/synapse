/**
 * Espejo TypeScript de las reglas META del servidor (H-030b).
 *
 * Reglas puras para validar operaciones sobre carpetas reservadas (BITACORA, PLANTILLAS)
 * y plantillas de documento, sin E/S. Los mismos casos que el servidor en
 * `backend/tests/fixtures/plantilla_reglas.json` deben pasar aquí.
 *
 * Espejos: `backend/app/core/ag_rules.py::check_create` (parte case),
 * `backend/app/core/ag_rules.py::check_folder_move`, `backend/app/core/meta_rules.py::check_note_write`,
 * `backend/app/core/plantilla_rules.py`, `backend/app/core/system_docs.py` (H-041) y la regla `ag-mensajes:agents-only` de H-042.
 */
import { pathKey, checkPath } from "./noteRules";
import { isIndexPath, folderOf } from "./indexRules";
import { normalizeKey } from "../editor/attributeRules";

// Carpetas reservadas (mismo orden que el servidor).
export const AG_SKILLS = "AG - SKILLS";
export const AG_MENSAJES = "AG - MENSAJES";
export const AG_AGENTES = "AG - AGENTES";
export const BITACORA = "BITACORA";
export const PLANTILLAS = "PLANTILLAS";

export const AG_FOLDERS = [AG_SKILLS, AG_MENSAJES, AG_AGENTES] as const;
export const META_FOLDERS = [...AG_FOLDERS, BITACORA, PLANTILLAS] as const;

// Equivalencia de nombres (NFKC + casefold).
const _META_KEYS = new Map<string, string>(META_FOLDERS.map((name) => [pathKey(name), name]));

// Plantillas: constantes.
export const TEMPLATE_PREFIX = "plantilla-";
export const PLANTILLA_NAME_MAX = 64;
export const PLANTILLA_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const ALCANCE_MAX = 50;
export const ATRIBUTOS_MAX = 30;
export const TIPOS = ["texto", "numero", "fecha", "lista", "booleano"] as const;
export const ESTILO_KEYS = ["publicar", "pdf"] as const;
export const ALL_FOLDERS = "*";

// Atributos que no se pueden redefinir como extra en una plantilla.
const NOT_EXTRA = new Set([
  "titulo",
  "descripcion",
  "tags",
  "estado",
  "fecha_creacion",
  "fecha_actualizacion",
  "plantilla",
  "sistema",
  "ruta", // RESERVED_KEYS del servidor
]);

/**
 * Documentos de sistema (H-041): los publica Synapse en todas las bóvedas y nadie los modifica desde la app. Se
 * deciden por la ruta (igual que el servidor); `sistema: true` en los metadatos solo los marca para quien los lee.
 * La lista debe coincidir con `backend/app/system_docs/manifest.json` (lo verifica `systemDocs.test.ts`).
 */
export const SYSTEM_PATHS = ["AG - SKILLS/skill-bovedas-synapse.md", "PLANTILLAS/plantilla-skill.md"] as const;
export const SYSTEM_ATTR = "sistema";
const _SYSTEM_KEYS = new Set<string>(SYSTEM_PATHS.map((path) => pathKey(path)));

/** ¿`path` es la ruta de un documento de sistema? */
export function isSystemPath(path: string | null | undefined): boolean {
  return path !== null && path !== undefined && _SYSTEM_KEYS.has(pathKey(path));
}

/** ¿`path` es exactamente una carpeta reservada de la raíz (sin subcarpetas)? */
export function isMetaFolder(path: string): boolean {
  return !path.includes("/") && _META_KEYS.has(pathKey(path));
}

/** Nombre canónico de la carpeta reservada o `null` si no es. */
export function metaFolderOf(path: string): string | null {
  if (!path.includes("/")) return null;
  const first = path.split("/", 1)[0];
  return _META_KEYS.get(pathKey(first)) ?? null;
}

/** Código de rechazo por mayúsculas incorrectas (parte de `check_create` del servidor). */
export function checkReservedCase(path: string): string | null {
  // Una nota suelta en la raíz con el nombre de una carpeta reservada la taparía (`reserved-name:path`).
  if (!path.includes("/")) return _META_KEYS.has(pathKey(path)) ? "reserved-name:path" : null;
  const first = path.split("/", 1)[0];
  const canonical = _META_KEYS.get(pathKey(first));
  if (canonical !== undefined && first !== canonical) {
    return "meta-folder:case";
  }
  return null;
}

/** Código de rechazo de mover/renombrar una carpeta reservada. */
export function checkFolderMove(from: string, to: string | null = null): string | null {
  const fromKey = pathKey(from);
  if (!_META_KEYS.has(fromKey)) return null;
  const canonical = _META_KEYS.get(fromKey);
  // Única excepción: una carpeta con mayúsculas incorrectas (`Plantillas`) puede pasar a su forma canónica (`PLANTILLAS`).
  return from !== canonical && to === canonical ? null : "meta-folder:rename";
}

/** ¿La ruta está dentro de `AG - MENSAJES/` (INDICES incluidos)? Espejo de `meta_rules.in_mensajes`. */
export function _inMensajes(path: string | null): boolean {
  return path !== null && metaFolderOf(path) === AG_MENSAJES;
}

/** ¿La ruta está dentro de `BITACORA/` y no es un INDICE? */
export function _inBitacora(path: string | null): boolean {
  return path !== null && metaFolderOf(path) === BITACORA && !isIndexPath(path);
}

/** Código de rechazo de escribir una nota (crear, editar, mover, borrar). */
export function checkNoteWrite(opts: {
  path: string;
  prevPath?: string | null;
  deleted?: boolean;
  frontmatter?: unknown;
  actorKind?: "human" | "agent" | "general" | "system";
}): string | null {
  const { path, prevPath = null, deleted = false, frontmatter = null, actorKind = "human" } = opts;

  // H-042: AG - MENSAJES es solo para agentes; la sesión humana no escribe nada ahí (ni siquiera un INDICE).
  if (actorKind === "human" && (_inMensajes(path) || _inMensajes(prevPath))) return "ag-mensajes:agents-only";

  // BITACORA es de solo lectura para todos (la escribe el servidor); sus INDICES siguen las reglas de H-031.
  if (_inBitacora(path) || _inBitacora(prevPath)) return "bitacora:readonly";

  // H-041: un documento de sistema no lo modifica nadie desde la plataforma; el atributo `sistema` es reservado.
  if (actorKind !== "system") {
    if (isSystemPath(path) || isSystemPath(prevPath)) return "sistema:readonly";
    if (!deleted && typeof frontmatter === "object" && frontmatter !== null && SYSTEM_ATTR in frontmatter) return "sistema:reserved";
  }

  if (!deleted && isTemplateZone(path)) {
    if (templateName(path) === null) return "plantilla:path";
    const code = checkDefinition(frontmatter);
    if (code !== null) return code;
  }

  return null;
}

/** ¿`name` es un nombre válido de plantilla (sin prefijo)? */
export function isValidTemplateName(name: unknown): boolean {
  return typeof name === "string" && name.length <= PLANTILLA_NAME_MAX && PLANTILLA_NAME_RE.test(name);
}

/** Nombre de la plantilla de `PLANTILLAS/plantilla-<nombre>.md`, o `null`. */
export function templateName(path: string): string | null {
  const parts = path.split("/");
  if (parts.length !== 2 || metaFolderOf(path) !== PLANTILLAS) return null;
  const base = parts[1];
  if (!base.endsWith(".md") || !base.startsWith(TEMPLATE_PREFIX)) return null;
  const name = base.slice(TEMPLATE_PREFIX.length, -3);
  return isValidTemplateName(name) ? name : null;
}

/** Ruta canónica de una plantilla. */
export function templatePath(name: string): string {
  return `${PLANTILLAS}/${TEMPLATE_PREFIX}${name}.md`;
}

/** ¿La ruta está dentro de `PLANTILLAS/` y no es un INDICE? */
export function isTemplateZone(path: string): boolean {
  return metaFolderOf(path) === PLANTILLAS && !isIndexPath(path);
}

/** ¿El tipo y valor coinciden? */
function _typeOk(tipo: string, value: unknown): boolean {
  if (tipo === "texto") return typeof value === "string";
  if (tipo === "numero") return typeof value === "number" && isFinite(value) && typeof value !== "boolean";
  if (tipo === "fecha") {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }
  if (tipo === "lista") {
    return Array.isArray(value) && value.every((x) => typeof x === "string");
  }
  if (tipo === "booleano") return typeof value === "boolean";
  return false;
}

/** Código de rechazo de la definición de una plantilla (frontmatter). */
export function checkDefinition(frontmatter: unknown): string | null {
  if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter)) {
    return "plantilla:alcance";
  }

  const fm = frontmatter as Record<string, unknown>;

  // Validar `alcance`.
  const alcance = fm.alcance;
  if (!Array.isArray(alcance)) return "plantilla:alcance";
  if (alcance.length === 0 || alcance.length > ALCANCE_MAX) return "plantilla:alcance";
  // Sin duplicados.
  if (new Set(alcance.map((a) => (typeof a === "string" ? pathKey(a) : ""))).size !== alcance.length) {
    return "plantilla:alcance";
  }
  // Cada elemento es "*" o una ruta válida, pero no ambos si hay "*".
  const hasAll = alcance.some((a) => a === ALL_FOLDERS);
  if (hasAll && alcance.length > 1) return "plantilla:alcance";
  for (const a of alcance) {
    if (typeof a !== "string" || (a !== ALL_FOLDERS && checkPath(`${a}/x.md`) !== null)) {
      return "plantilla:alcance";
    }
  }

  // Validar `atributos`.
  const atributos = fm.atributos ?? [];
  if (!Array.isArray(atributos) || atributos.length > ATRIBUTOS_MAX) {
    return "plantilla:atributos";
  }
  const seenNames = new Set<string>();
  for (const attr of atributos) {
    if (!attr || typeof attr !== "object" || Array.isArray(attr)) {
      return "plantilla:atributos";
    }
    const a = attr as Record<string, unknown>;
    const keys = Object.keys(a);
    if (keys.some((k) => !["nombre", "tipo", "valor"].includes(k))) {
      return "plantilla:atributos";
    }

    const nombre = a.nombre;
    const tipo = a.tipo;
    if (typeof nombre !== "string" || !nombre) return "plantilla:atributos";
    if (normalizeKey(nombre) !== nombre) return "plantilla:atributos";
    if (NOT_EXTRA.has(nombre)) return "plantilla:atributos";
    if (seenNames.has(nombre)) return "plantilla:atributos";
    if (typeof tipo !== "string" || !TIPOS.includes(tipo as typeof TIPOS[number])) {
      return "plantilla:atributos";
    }

    if ("valor" in a && a.valor !== null) {
      if (!_typeOk(tipo, a.valor)) return "plantilla:atributos";
    }

    seenNames.add(nombre);
  }

  // Validar `estilo`.
  const estilo = fm.estilo ?? {};
  if (!estilo || typeof estilo !== "object" || Array.isArray(estilo)) {
    return "plantilla:estilo";
  }
  const e = estilo as Record<string, unknown>;
  for (const [key, value] of Object.entries(e)) {
    if (!ESTILO_KEYS.includes(key as typeof ESTILO_KEYS[number])) {
      return "plantilla:estilo";
    }
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 0) {
      return "plantilla:estilo";
    }
  }

  return null;
}

/** Valor del atributo general `plantilla` de un documento. */
export function checkRef(value: unknown): string | null {
  return isValidTemplateName(value) ? null : "plantilla";
}

/** ¿Una plantilla con este `alcance` se ofrece en `folder` (`""` = raíz)? */
export function appliesTo(alcance: unknown[], folder: string): boolean {
  if (!Array.isArray(alcance)) return false;
  const folderKey = pathKey(folder);
  return alcance.some((a) => {
    if (typeof a !== "string") return false;
    if (a === ALL_FOLDERS) return true;
    const aKey = pathKey(a);
    return folderKey === aKey || folderKey.startsWith(aKey + "/");
  });
}
