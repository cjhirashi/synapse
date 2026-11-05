/**
 * Nombres canónicos de skills y plantillas (H-041 E2). Espejo de `backend/app/core/doc_names.py`; ambos pasan los mismos
 * casos de `backend/tests/fixtures/nombres_reglas.json`.
 *
 * Todo documento de `AG - SKILLS` lleva el prefijo `skill-` y todo documento de `PLANTILLAS` el prefijo `plantilla-`,
 * con el nombre en minúsculas, sin acentos, sin espacios y solo con letras, dígitos y guiones. Quien asigna un nombre
 * («gestión de variables») no lo estructura: lo hace el sistema (`skill-gestion-de-variables.md`).
 */
import { isIndexPath } from "./indexRules";
import { AG_SKILLS, PLANTILLAS, PLANTILLA_NAME_MAX, TEMPLATE_PREFIX, metaFolderOf } from "./metaRules";

export const SKILL_PREFIX = "skill-";
export const SKILL_BASE_MAX = 64; // nombre completo, con prefijo
export const SKILL_NAME = "skill:name";
export const SKILL_PATH = "skill:path";
const EXT = ".md";

// Letras que NFKD no descompone: se transliteran a mano. Lo demás que no sea ASCII se vuelve un guion.
const TRANSLIT: Record<string, string> = {
  ß: "ss", æ: "ae", œ: "oe", ø: "o", ł: "l", đ: "d", ð: "d", þ: "th", ı: "i",
  Æ: "ae", Œ: "oe", Ø: "o", Ł: "l", Đ: "d", Ð: "d", Þ: "th",
};

interface Kind {
  prefix: string;
  maxRest: number;
  badName: string;
  badPath: string;
}

const KINDS: Record<string, Kind> = {
  [AG_SKILLS]: { prefix: SKILL_PREFIX, maxRest: SKILL_BASE_MAX - SKILL_PREFIX.length, badName: SKILL_NAME, badPath: SKILL_PATH },
  [PLANTILLAS]: { prefix: TEMPLATE_PREFIX, maxRest: PLANTILLA_NAME_MAX, badName: "plantilla:path", badPath: "plantilla:path" },
};

/** Minúsculas, sin acentos, sin espacios: lo demás pasa a guion; los guiones se colapsan y recortan. */
export function slugify(raw: string): string {
  const text = raw
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[ßæœøłđðþıÆŒØŁĐÐÞ]/g, (c) => TRANSLIT[c])
    .toLowerCase();
  return text.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Nombre canónico (con prefijo, sin `.md`) o `null` si lo escrito no contiene un nombre válido. */
export function canonicalBase(raw: string, prefix: string, maxRest: number): string | null {
  const slug = slugify(raw);
  const rest = slug.startsWith(prefix) ? slug.slice(prefix.length) : slug;
  if (rest === prefix.replace(/-$/, "") && slug === rest) return null; // «skill» a secas: el prefijo no es un nombre
  return rest.length >= 1 && rest.length <= maxRest ? prefix + rest : null;
}

function stripExt(name: string): string {
  return name.toLowerCase().endsWith(EXT) ? name.slice(0, -EXT.length) : name;
}

function zoneOf(path: string): { first: string; kind: Kind } | null {
  const zone = metaFolderOf(path);
  if (zone === null || !(zone in KINDS) || isIndexPath(path)) return null;
  return { first: path.split("/", 1)[0], kind: KINDS[zone] };
}

/** `[ruta canónica, código de rechazo]`. Fuera de `AG - SKILLS` y `PLANTILLAS` devuelve la ruta tal cual. */
export function canonicalPath(path: string): [string, string | null] {
  const target = zoneOf(path);
  if (target === null) return [path, null];
  const rest = path.split("/").slice(1);
  if (rest.length !== 1) return [path, target.kind.badPath];
  const base = canonicalBase(stripExt(rest[0]), target.kind.prefix, target.kind.maxRest);
  return base === null ? [path, target.kind.badName] : [`${target.first}/${base}${EXT}`, null];
}

/** Rechazo de una nota de `AG - SKILLS` que no está en forma canónica (carpeta movida); `null` si lo está. */
export function isCanonical(path: string): string | null {
  const target = zoneOf(path);
  if (target === null || metaFolderOf(path) !== AG_SKILLS) return null;
  const [canonical, code] = canonicalPath(path);
  return code !== null ? code : canonical === path ? null : SKILL_NAME;
}
