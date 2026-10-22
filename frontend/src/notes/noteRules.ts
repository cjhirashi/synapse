/**
 * Reflejo en el cliente de `backend/app/core/note_rules.py` (SPEC-0008 RF-005, RF-013,
 * RF-016; PLAN-0008 §2.6).
 *
 * La réplica escribe sin pasar por la API, así que el cliente valida antes de guardar; el
 * push vuelve a aplicar las mismas reglas **sin normalizar** y rechaza lo que no llegue ya
 * normalizado. La batería común (`backend/tests/fixtures/note_rules_cases.json`) fija que
 * ambos lados coinciden. Como en el servidor, `check*` devuelve el código de rechazo
 * (`validation-error:<campo>`, `not-normalized:path`) o `null` si el valor pasa.
 *
 * Diferencias de JavaScript con Python que hay que reproducir a mano:
 * - Longitudes de ruta en puntos de código (`len` de Python), no en unidades UTF-16.
 * - Los espacios que se quitan son los de `White_Space` (Rust `str::trim`), no los de
 *   `String.prototype.trim` (que quita U+FEFF y no U+0085).
 * - Los tamaños son en bytes UTF-8 (`TextEncoder`), y "Unicode bien formado" es la ausencia
 *   de sustitutos sueltos: `TextEncoder` los sustituiría por U+FFFD sin avisar, y
 *   `JSON.stringify` los escapa, así que se buscan a mano en el texto y en todo el JSON.
 */
import { nameKey } from "../sync/vaultRules";

// Límites de `core/note_rules.py`.
export const PATH_MAX = 300;
export const CONTENT_MAX_BYTES = 2 * 1024 * 1024;
export const FRONTMATTER_MAX_BYTES = 64 * 1024;

/** Sustituto alto sin bajo detrás, o bajo sin alto delante. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const EDGE_WHITE_SPACE = /^\p{White_Space}+|\p{White_Space}+$/gu;
const CONTROL = /\p{Cc}/u;

const encoder = new TextEncoder();

function wellFormed(text: string): boolean {
  return !LONE_SURROGATE.test(text);
}

/** Bytes UTF-8 de un texto bien formado. */
function utf8Bytes(text: string): number {
  return encoder.encode(text).length;
}

/** Quita los espacios a los lados de cada segmento (`/` separa carpetas). */
export function normalizePath(path: string): string {
  return path
    .split("/")
    .map((segment) => segment.replace(EDGE_WHITE_SPACE, ""))
    .join("/");
}

/**
 * Código de rechazo de `path` o `null`. La longitud y los controles se miden sobre la forma
 * normalizada; después se exige que el valor ya lo esté. Un segmento vacío (`a//b`, `/a`,
 * `a/`, `a/ /b`) daría una carpeta sin nombre.
 */
export function checkPath(value: unknown): string | null {
  if (typeof value !== "string" || !wellFormed(value)) return "validation-error:path";
  const normalized = normalizePath(value);
  const length = [...normalized].length;
  const valid =
    length >= 1 && length <= PATH_MAX && normalized.split("/").every((segment) => segment !== "") && !CONTROL.test(normalized);
  if (!valid) return "validation-error:path";
  return normalized === value ? null : "not-normalized:path";
}

/** Clave de unicidad de la ruta: NFKC + `casefold` de la ruta completa (= `nameKey` de bóvedas). */
export function pathKey(path: string): string {
  return nameKey(path);
}

/** `content`: texto bien formado de a lo sumo 2 MiB en bytes UTF-8. */
export function checkContent(value: unknown): string | null {
  if (typeof value !== "string" || !wellFormed(value)) return "validation-error:content";
  // Cada unidad UTF-16 ocupa al menos un byte: más de 2 MiB de unidades ya es excesivo y
  // se evita codificar el texto entero.
  if (value.length > CONTENT_MAX_BYTES || utf8Bytes(value) > CONTENT_MAX_BYTES) return "validation-error:content";
  return null;
}

/** ¿Algún texto (valor o clave) del JSON tiene sustitutos sueltos? */
function hasLoneSurrogate(json: unknown): boolean {
  if (typeof json === "string") return !wellFormed(json);
  if (Array.isArray(json)) return json.some(hasLoneSurrogate);
  if (json !== null && typeof json === "object") {
    return Object.entries(json).some(([key, item]) => !wellFormed(key) || hasLoneSurrogate(item));
  }
  return false;
}

/** `frontmatter`: objeto JSON cuya serialización compacta pesa ≤ 64 KiB en UTF-8. */
export function checkFrontmatter(value: unknown): string | null {
  const invalid = "validation-error:frontmatter";
  if (value === null || typeof value !== "object" || Array.isArray(value) || hasLoneSurrogate(value)) return invalid;
  return utf8Bytes(JSON.stringify(value)) <= FRONTMATTER_MAX_BYTES ? null : invalid;
}
