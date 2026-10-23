/**
 * JSON canónico compartido por `conflicts.ts` (revisiones deterministas) y
 * `notes/mergeNote.ts` (igualdad de frontmatter). Va aparte para evitar un ciclo de imports.
 */
/**
 * JSON canónico: claves ordenadas en todos los niveles y sin las de valor `undefined`, para
 * que el mismo contenido dé el mismo texto en cualquier réplica. Dentro de una lista un
 * `undefined` pasa a `null`, como en `JSON.stringify` (VD-4). Con valores JSON (los cuerpos
 * de documento) el resultado es JSON; otros valores (una función, un `undefined` suelto) no
 * se contemplan porque PouchDB sólo guarda JSON.
 */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => (item === undefined ? "null" : canonical(item))).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
