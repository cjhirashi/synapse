/**
 * Reglas de los atributos META de una nota (H-029).
 *
 * La especificación vive en `backend/tests/fixtures/attribute_rules.json` y la comparte el frontend:
 * ambos deben pasar los mismos casos.
 *
 * Espejo en TypeScript de `backend/app/core/attribute_rules.py`.
 */

export const TITULO_MAX = 200;
export const DESCRIPCION_MAX = 1000;
export const TAGS_MAX = 20;
export const TAG_MAX_LEN = 32;
export const ESTADO_MAX_LEN = 32;
export const ESTADOS_ESTANDAR = [
  "borrador",
  "en proceso",
  "en revisión",
  "aprobado",
  "en implementación",
  "implementado",
] as const;
export const RESERVED_KEYS = ["ruta"] as const;

export const ESTADO_SYNONYMS: Record<string, string> = {
  "borrador": "borrador",
  "draft": "borrador",
  "en revision": "en revisión",
  "aprobado": "aprobado",
  "aprobada": "aprobado",
  "active": "aprobado",
  "activo": "aprobado",
  "vigente": "aprobado",
  "en implementacion": "en implementación",
  "en desarrollo": "en implementación",
  "en proceso": "en proceso",
  "en progreso": "en proceso",
  "implementado": "implementado",
  "implementada": "implementado",
  "completado": "implementado",
  "completada": "implementado",
  "completo": "implementado",
  "completa": "implementado",
  "aplicada": "implementado",
  "archived": "archivado",
};

function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "");
}

export function normalizeKey(key: string): string | null {
  const value = stripAccents(key)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return value || null;
}

export function normalizeTag(tag: string): string | null {
  let text = tag.normalize("NFC").trim().toLowerCase();
  text = [...text].map((c) => (/[\p{L}\p{Nd}\-_]/u.test(c) ? c : "_")).join("");
  text = text.replace(/_+/g, "_").replace(/^[_-]+|[_-]+$/g, "");
  text = [...text].slice(0, TAG_MAX_LEN).join("").replace(/[_-]+$/g, "");
  return text || null;
}

export function normalizeEstado(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let text = value.normalize("NFC").trim().toLowerCase();
  text = text.replace(/[-_\s]+/g, " ").trim();
  return text && [...text].length <= ESTADO_MAX_LEN ? text : null;
}

export function legacyEstado(value: unknown): string | null {
  const text = normalizeEstado(value);
  if (text === null || text === "estado") return null;
  const lookup = stripAccents(text).replace(/[-_\s]+/g, " ");
  return ESTADO_SYNONYMS[lookup] ?? text;
}

export function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^\d{4}-\d{2}-\d{2}/);
  if (!match) return null;
  try {
    new Date(match[0] + "T00:00:00Z").toISOString();
    const parts = match[0].split("-");
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    if (month < 1 || month > 12) return null;
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) daysInMonth[1] = 29;
    if (day < 1 || day > daysInMonth[month - 1]) return null;
    return match[0];
  } catch {
    return null;
  }
}

export function validateGeneral(frontmatter: Record<string, unknown>): string | null {
  for (const key of RESERVED_KEYS) {
    if (key in frontmatter) return `reservada:${key}`;
  }
  const titulo = frontmatter.titulo;
  if ("titulo" in frontmatter && (typeof titulo !== "string" || [...titulo].length > TITULO_MAX)) {
    return "titulo";
  }
  const descripcion = frontmatter.descripcion;
  if ("descripcion" in frontmatter && (typeof descripcion !== "string" || [...descripcion].length > DESCRIPCION_MAX)) {
    return "descripcion";
  }
  if ("tags" in frontmatter) {
    const tags = frontmatter.tags;
    if (
      !Array.isArray(tags)
      || tags.length > TAGS_MAX
      || tags.some((t: unknown) => typeof t !== "string" || normalizeTag(t) !== t)
    ) {
      return "tags";
    }
  }
  for (const key of ["fecha_creacion", "fecha_actualizacion"]) {
    if (key in frontmatter) {
      const val = frontmatter[key];
      if (typeof val !== "string" || normalizeDate(val) !== val) {
        return key;
      }
    }
  }
  if ("estado" in frontmatter) {
    const val = frontmatter.estado;
    if (typeof val !== "string" || normalizeEstado(val) !== val) {
      return "estado";
    }
  }
  return null;
}

export interface DroppedItem {
  key: string;
  value: unknown;
  reason: string;
}

export function migrateFrontmatterDetailed(
  frontmatter: Record<string, unknown>,
): [Record<string, unknown>, DroppedItem[]] {
  const out: Record<string, unknown> = {};
  const dropped: DroppedItem[] = [];

  function drop(key: string, value: unknown, reason: string): void {
    dropped.push({ key, value, reason });
  }

  function put(key: string, target: string, value: unknown): void {
    if (!(target in out)) {
      out[target] = value;
    } else if (JSON.stringify(out[target]) !== JSON.stringify(value)) {
      drop(key, value, `duplica a «${target}» con otro valor; se conserva el primero`);
    }
  }

  for (const [key, value] of Object.entries(frontmatter)) {
    const name = normalizeKey(key);
    if (name === "titulo" || name === "descripcion") {
      let finalValue = value;
      if (Array.isArray(finalValue) && finalValue.length > 0 && finalValue.every((x) => typeof x === "string")) {
        finalValue = finalValue.join(", ");
      }
      if ((typeof finalValue === "number" || typeof finalValue === "number") && typeof finalValue !== "boolean") {
        finalValue = String(finalValue);
      }
      if (typeof finalValue === "string") {
        put(key, name, finalValue);
      } else if (finalValue !== null) {
        drop(key, finalValue, "no es texto");
      }
    } else if (name === "tags") {
      let tagList = value;
      if (typeof tagList === "string") {
        tagList = tagList.split(",");
      }
      if (!Array.isArray(tagList)) {
        drop(key, tagList, "no es una lista");
        continue;
      }
      const tags: string[] = [];
      for (const item of tagList) {
        let tag: string | null = null;
        if (typeof item === "string" || (typeof item === "number" && typeof item !== "boolean")) {
          tag = normalizeTag(String(item));
        }
        if (tag && !tags.includes(tag)) {
          tags.push(tag);
        }
      }
      put(key, "tags", tags.slice(0, TAGS_MAX));
    } else if (name === "status" || name === "estado") {
      const estado = legacyEstado(value);
      if (estado === null) {
        drop(key, value, "no es un estado válido (texto de 1 a 32 caracteres, y no el valor de plantilla «estado»)");
      } else {
        put(key, "estado", estado);
      }
    } else if (name === "fecha_creacion" || name === "ultima_actualizacion" || name === "fecha_actualizacion") {
      const fecha = normalizeDate(value);
      if (fecha === null) {
        drop(key, value, "no es una fecha AAAA-MM-DD");
      } else {
        put(key, name === "fecha_creacion" ? "fecha_creacion" : "fecha_actualizacion", fecha);
      }
    } else if (name === "ruta") {
      drop(key, value, "la ruta ahora la calcula el sistema desde la ubicación de la nota");
    } else {
      out[key] = value;
    }
  }
  return [out, dropped];
}

export function migrateFrontmatter(frontmatter: Record<string, unknown>): Record<string, unknown> {
  return migrateFrontmatterDetailed(frontmatter)[0];
}
