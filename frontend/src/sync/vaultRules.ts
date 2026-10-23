/**
 * Reflejo en el cliente de las reglas de bóveda de `backend/app/core/schemas.py`
 * (SPEC-0005 RF-005, RF-015; PLAN-0005 §2.5).
 *
 * La réplica escribe sin pasar por la API, así que el cliente normaliza y valida antes de
 * guardar; el push vuelve a aplicar las mismas reglas **sin normalizar** y rechaza con
 * `not-normalized:<campo>` lo que no llegue ya normalizado. La batería común
 * (`backend/tests/fixtures/vault_rules_cases.json`) fija que ambos lados coinciden.
 *
 * Diferencias de JavaScript con Python que hay que reproducir a mano:
 * - Longitudes en puntos de código (`len` de Python), no en unidades UTF-16.
 * - `strip_whitespace` de pydantic (Rust, `str::trim`) quita los caracteres con la propiedad
 *   Unicode `White_Space`: incluye U+0085 y no U+FEFF, al revés que `String.prototype.trim`.
 * - `casefold` no existe: se pliega punto a punto (sin el contexto de la sigma final) con
 *   `toLowerCase` más las excepciones de `CaseFolding.txt`.
 */

export type VaultField = "name" | "description" | "tags" | "icon";

export type RuleResult<T> = { ok: true; value: T } | { ok: false };

export interface VaultFields {
  name: string;
  description: string | null;
  tags: string[];
  /**
   * Ícono «glifo[:color]» (SPEC-0009 RF-012). Opcional: ausente en los documentos anteriores y en lo que
   * escribe un llamador que no lo toca; `null` es «sin ícono».
   */
  icon?: string | null;
}

// Límites de `core/schemas.py` (SPEC-0003 RF-005).
export const NAME_MAX = 100;
export const DESCRIPTION_MAX = 2000;
export const TAG_MAX = 32;
export const TAGS_MAX = 20;
export const ICON_MAX = 64;

// Propiedad Unicode `White_Space`: lo que quita `strip_whitespace` de pydantic.
const WHITE_SPACE = /^\p{White_Space}$/u;

// Caracteres de control (categoría `Cc`), prohibidos en el nombre (SPEC-0003 enmienda 1).
const CONTROL = /\p{Cc}/u;

const ok = <T>(value: T): RuleResult<T> => ({ ok: true, value });
const INVALID: RuleResult<never> = { ok: false };

function codePoints(text: string): number {
  return [...text].length;
}

/** `strip_whitespace` de pydantic: quita `White_Space` de los dos extremos. */
function strip(text: string): string {
  const chars = [...text];
  let start = 0;
  let end = chars.length;
  while (start < end && WHITE_SPACE.test(chars[start])) start++;
  while (end > start && WHITE_SPACE.test(chars[end - 1])) end--;
  return chars.slice(start, end).join("");
}

/** `VaultName`: sin espacios en los extremos, 1–100 puntos de código, sin controles. */
export function checkName(value: unknown): RuleResult<string> {
  if (typeof value !== "string") return INVALID;
  const name = strip(value);
  const length = codePoints(name);
  if (length < 1 || length > NAME_MAX || CONTROL.test(name)) return INVALID;
  return ok(name);
}

/** `VaultDescription | None`: tal cual (sin quitar espacios), hasta 2000 puntos de código. */
export function checkDescription(value: unknown): RuleResult<string | null> {
  if (value === null) return ok(null);
  if (typeof value !== "string" || codePoints(value) > DESCRIPTION_MAX) return INVALID;
  return ok(value);
}

/**
 * `VaultTags`: como mucho 20 enviados (antes de quitar repetidos); cada uno sin espacios en
 * los extremos y 1–32 puntos de código **antes** de pasar a minúsculas (el orden de
 * pydantic: una mayúscula que crece al bajar, como `İ`, no cuenta doble); sin repetidos,
 * conservando el primer orden.
 */
export function checkTags(value: unknown): RuleResult<string[]> {
  if (!Array.isArray(value) || value.length > TAGS_MAX) return INVALID;
  const tags: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") return INVALID;
    const tag = strip(raw);
    const length = codePoints(tag);
    if (length < 1 || length > TAG_MAX) return INVALID;
    tags.push(tag.toLowerCase());
  }
  return ok([...new Set(tags)]);
}

/** Gramática de `VaultIcon` (contracts/vault-icon.schema.json): `glifo[:color]` en `[a-z0-9]` con guiones internos. */
const ICON_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*(?::[a-z0-9]+(?:-[a-z0-9]+)*)?$/;

/**
 * `VaultIcon | None`: sin normalizar (el valor llega ya en su forma final, un espacio o una mayúscula es
 * inválido) y sin consultar un catálogo: sólo la gramática, igual que el servidor.
 */
export function checkIcon(value: unknown): RuleResult<string | null> {
  if (value === null) return ok(null);
  if (typeof value !== "string" || codePoints(value) > ICON_MAX || !ICON_PATTERN.test(value)) return INVALID;
  return ok(value);
}

export const FIELD_RULES: Record<VaultField, (value: unknown) => RuleResult<unknown>> = {
  name: checkName,
  description: checkDescription,
  tags: checkTags,
  icon: checkIcon,
};

/**
 * Valida y normaliza los campos; si falla, enumera los inválidos en orden. `icon` sólo se valida (y
 * se devuelve) si el llamador lo trae: así quien no lo toca no escribe la clave.
 */
export function validateVault(input: Record<"name" | "description" | "tags", unknown> & { icon?: unknown }):
  | { ok: true; value: VaultFields }
  | { ok: false; fields: VaultField[] } {
  const name = checkName(input.name);
  const description = checkDescription(input.description);
  const tags = checkTags(input.tags);
  const icon = input.icon === undefined ? null : checkIcon(input.icon);
  if (name.ok && description.ok && tags.ok && (icon === null || icon.ok)) {
    const value: VaultFields = { name: name.value, description: description.value, tags: tags.value };
    if (icon !== null) value.icon = icon.value;
    return { ok: true, value };
  }
  const results: [VaultField, RuleResult<unknown> | null][] = [
    ["name", name], ["description", description], ["tags", tags], ["icon", icon],
  ];
  return { ok: false, fields: results.filter(([, result]) => result !== null && !result.ok).map(([field]) => field) };
}

// Plegado completo de `CaseFolding.txt` (Unicode 16) donde difiere de la minúscula de cada
// carácter, salvo el cherokee (ver `foldCherokee`). Sólo caracteres estables en NFKC: el
// resto ya no existe cuando se pliega.
const CASE_FOLD: Record<string, string> = {
  "\u00DF": "\u0073\u0073", "\u01F0": "\u006A\u030C", "\u0345": "\u03B9", "\u0390": "\u03B9\u0308\u0301",
  "\u03B0": "\u03C5\u0308\u0301", "\u03C2": "\u03C3", "\u1C80": "\u0432", "\u1C81": "\u0434",
  "\u1C82": "\u043E", "\u1C83": "\u0441", "\u1C84": "\u0442", "\u1C85": "\u0442",
  "\u1C86": "\u044A", "\u1C87": "\u0463", "\u1C88": "\uA64B", "\u1E96": "\u0068\u0331",
  "\u1E97": "\u0074\u0308", "\u1E98": "\u0077\u030A", "\u1E99": "\u0079\u030A", "\u1E9E": "\u0073\u0073",
  "\u1F50": "\u03C5\u0313", "\u1F52": "\u03C5\u0313\u0300", "\u1F54": "\u03C5\u0313\u0301", "\u1F56": "\u03C5\u0313\u0342",
  "\u1F80": "\u1F00\u03B9", "\u1F81": "\u1F01\u03B9", "\u1F82": "\u1F02\u03B9", "\u1F83": "\u1F03\u03B9",
  "\u1F84": "\u1F04\u03B9", "\u1F85": "\u1F05\u03B9", "\u1F86": "\u1F06\u03B9", "\u1F87": "\u1F07\u03B9",
  "\u1F88": "\u1F00\u03B9", "\u1F89": "\u1F01\u03B9", "\u1F8A": "\u1F02\u03B9", "\u1F8B": "\u1F03\u03B9",
  "\u1F8C": "\u1F04\u03B9", "\u1F8D": "\u1F05\u03B9", "\u1F8E": "\u1F06\u03B9", "\u1F8F": "\u1F07\u03B9",
  "\u1F90": "\u1F20\u03B9", "\u1F91": "\u1F21\u03B9", "\u1F92": "\u1F22\u03B9", "\u1F93": "\u1F23\u03B9",
  "\u1F94": "\u1F24\u03B9", "\u1F95": "\u1F25\u03B9", "\u1F96": "\u1F26\u03B9", "\u1F97": "\u1F27\u03B9",
  "\u1F98": "\u1F20\u03B9", "\u1F99": "\u1F21\u03B9", "\u1F9A": "\u1F22\u03B9", "\u1F9B": "\u1F23\u03B9",
  "\u1F9C": "\u1F24\u03B9", "\u1F9D": "\u1F25\u03B9", "\u1F9E": "\u1F26\u03B9", "\u1F9F": "\u1F27\u03B9",
  "\u1FA0": "\u1F60\u03B9", "\u1FA1": "\u1F61\u03B9", "\u1FA2": "\u1F62\u03B9", "\u1FA3": "\u1F63\u03B9",
  "\u1FA4": "\u1F64\u03B9", "\u1FA5": "\u1F65\u03B9", "\u1FA6": "\u1F66\u03B9", "\u1FA7": "\u1F67\u03B9",
  "\u1FA8": "\u1F60\u03B9", "\u1FA9": "\u1F61\u03B9", "\u1FAA": "\u1F62\u03B9", "\u1FAB": "\u1F63\u03B9",
  "\u1FAC": "\u1F64\u03B9", "\u1FAD": "\u1F65\u03B9", "\u1FAE": "\u1F66\u03B9", "\u1FAF": "\u1F67\u03B9",
  "\u1FB2": "\u1F70\u03B9", "\u1FB3": "\u03B1\u03B9", "\u1FB4": "\u03AC\u03B9", "\u1FB6": "\u03B1\u0342",
  "\u1FB7": "\u03B1\u0342\u03B9", "\u1FBC": "\u03B1\u03B9", "\u1FC2": "\u1F74\u03B9", "\u1FC3": "\u03B7\u03B9",
  "\u1FC4": "\u03AE\u03B9", "\u1FC6": "\u03B7\u0342", "\u1FC7": "\u03B7\u0342\u03B9", "\u1FCC": "\u03B7\u03B9",
  "\u1FD2": "\u03B9\u0308\u0300", "\u1FD6": "\u03B9\u0342", "\u1FD7": "\u03B9\u0308\u0342", "\u1FE2": "\u03C5\u0308\u0300",
  "\u1FE4": "\u03C1\u0313", "\u1FE6": "\u03C5\u0342", "\u1FE7": "\u03C5\u0308\u0342", "\u1FF2": "\u1F7C\u03B9",
  "\u1FF3": "\u03C9\u03B9", "\u1FF4": "\u03CE\u03B9", "\u1FF6": "\u03C9\u0342", "\u1FF7": "\u03C9\u0342\u03B9",
  "\u1FFC": "\u03C9\u03B9",
};

/** El cherokee se pliega a mayúsculas (al revés que el resto de escrituras). */
function foldCherokee(code: number): string | undefined {
  if (code >= 0x13a0 && code <= 0x13f5) return String.fromCodePoint(code);
  if (code >= 0x13f8 && code <= 0x13fd) return String.fromCodePoint(code - 8);
  if (code >= 0xab70 && code <= 0xabbf) return String.fromCodePoint(code - 0x97d0);
  return undefined;
}

/**
 * Forma de un nombre que decide la unicidad: NFKC + `casefold`, como `name_key` del
 * servidor (SPEC-0003 §3). Aviso inmediato en local; la última palabra es del push.
 *
 * Coincide con el servidor en todo carácter de Unicode 16 (comprobado punto a punto). Sólo
 * difiere en los caracteres que añadió una versión de Unicode posterior a la del servidor,
 * si el navegador ya los conoce.
 */
export function nameKey(name: string): string {
  let key = "";
  for (const char of name.normalize("NFKC")) {
    key += CASE_FOLD[char] ?? foldCherokee(char.codePointAt(0)!) ?? char.toLowerCase();
  }
  return key;
}
