/**
 * Plantilla de un documento y sus atributos (H-054). Módulo puro, sin React ni E/S.
 *
 * Un documento con plantilla muestra solo los atributos generales y los de la plantilla (que siempre existen,
 * pueden ir vacíos). Los atributos opcionales que ya tenía no se borran: quedan en `atributos_ocultos` y
 * reaparecen al quitar la plantilla. Un opcional que coincide en nombre y tipo con uno de la plantilla pasa
 * a ser ese atributo con su valor. Si el estado del documento no es uno de los de la plantilla nueva, queda vacío.
 */

export const HIDDEN_KEY = "atributos_ocultos";

export interface TemplateAttr {
  nombre: string;
  tipo: string;
  valor?: unknown;
}

export interface TemplateDef {
  name: string;
  atributos: ReadonlyArray<TemplateAttr>;
  /** Nombres de los estados de la plantilla. Con plantilla, el estado del documento es uno de ellos o ninguno (H-054). */
  estados?: ReadonlyArray<string>;
}

export interface TemplateOptions {
  /** Claves que no se tocan al cambiar de plantilla (atributos tipados del catálogo de la bóveda). */
  keep?: ReadonlySet<string>;
}

const NON_FREE = new Set([
  "titulo", "descripcion", "ruta", "fecha_creacion", "fecha_actualizacion", "tags", "estado", "plantilla", "sistema", HIDDEN_KEY,
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Valor con que nace un atributo de plantilla: su valor inicial o uno vacío del tipo; `undefined` = no se escribe (número y fecha sin valor). */
export function seedValue(attr: { tipo: string; valor?: unknown }): unknown {
  if (attr.valor !== undefined && attr.valor !== null) return attr.valor;
  if (attr.tipo === "texto") return "";
  if (attr.tipo === "lista") return [];
  if (attr.tipo === "booleano") return false;
  return undefined;
}

export function typeMatches(tipo: string, value: unknown): boolean {
  switch (tipo) {
    case "texto": return typeof value === "string";
    case "numero": return typeof value === "number" && Number.isFinite(value);
    case "fecha": return typeof value === "string" && DATE_RE.test(value);
    case "lista": return Array.isArray(value) && value.every((x) => typeof x === "string");
    case "booleano": return typeof value === "boolean";
    default: return false;
  }
}

/** ¿El valor es contenido de verdad? Vacío = texto en blanco, lista sin elementos, falso o sin valor. */
export function hasContent(tipo: string, value: unknown): boolean {
  if (!typeMatches(tipo, value)) return false;
  if (tipo === "texto") return (value as string).trim() !== "";
  if (tipo === "lista") return (value as string[]).length > 0;
  if (tipo === "booleano") return value === true;
  return true;
}

/** Un cuerpo en blanco se rellena solo con la estructura de la plantilla; uno con texto pregunta antes. */
export const isEmptyBody = (body: string): boolean => body.trim() === "";

function hiddenOf(fm: Record<string, unknown>): Record<string, unknown> {
  const hidden = fm[HIDDEN_KEY];
  return hidden !== null && typeof hidden === "object" && !Array.isArray(hidden) ? { ...(hidden as Record<string, unknown>) } : {};
}

/**
 * Quita la plantilla: sus atributos con contenido quedan como opcionales (los vacíos se descartan) y los
 * opcionales ocultos reaparecen. Sin `from` (la plantilla ya no existe) no se descarta ningún atributo.
 */
export function detachTemplate(fm: Record<string, unknown>, from: TemplateDef | null): Record<string, unknown> {
  const out: Record<string, unknown> = { ...fm };
  delete out.plantilla;
  for (const attr of from?.atributos ?? []) {
    if (attr.nombre in out && !hasContent(attr.tipo, out[attr.nombre])) delete out[attr.nombre];
  }
  const hidden = hiddenOf(out);
  delete out[HIDDEN_KEY];
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(hidden)) {
    if (key in out) rest[key] = value;
    else out[key] = value;
  }
  if (Object.keys(rest).length > 0) out[HIDDEN_KEY] = rest;
  return out;
}

/** Asigna la plantilla a un documento sin plantilla (ver `changeTemplate`). */
function attachTemplate(fm: Record<string, unknown>, to: TemplateDef, options: TemplateOptions): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const hidden = hiddenOf(fm);
  for (const [key, value] of Object.entries(fm)) {
    if (key === HIDDEN_KEY) continue;
    const attr = to.atributos.find((a) => a.nombre === key);
    if (NON_FREE.has(key) || options.keep?.has(key) || (attr !== undefined && typeMatches(attr.tipo, value))) out[key] = value;
    else hidden[key] = value;
  }
  for (const attr of to.atributos) {
    if (attr.nombre in out) continue;
    const value = seedValue(attr);
    if (value !== undefined) out[attr.nombre] = value;
  }
  if (Object.keys(hidden).length > 0) out[HIDDEN_KEY] = hidden;
  if (to.estados !== undefined && typeof out.estado === "string" && !to.estados.includes(out.estado)) delete out.estado;
  out.plantilla = to.name;
  return out;
}

/** Atributos del documento tras pasar de la plantilla `from` a la `to` (`null` = sin plantilla). */
export function changeTemplate(
  fm: Record<string, unknown>, from: TemplateDef | null, to: TemplateDef | null, options: TemplateOptions = {},
): Record<string, unknown> {
  const detached = detachTemplate(fm, from);
  return to === null ? detached : attachTemplate(detached, to, options);
}
