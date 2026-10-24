/**
 * Modelo de las propiedades de una nota para el panel y el formulario (SPEC-0010 RF-009…RF-013;
 * PLAN-0010 §2.1). Módulo puro, sin React: convierte el objeto `frontmatter` en filas tipadas
 * y de vuelta, y concentra las reglas de tipo (inferencia, conversión, validación).
 *
 * Tipos de valor (RF-018): texto, número, booleano y lista de strings se editan; cualquier otro
 * valor JSON (objeto, `null`, lista que no sea sólo de strings) es **complejo**: sólo lectura,
 * se puede quitar y se conserva tal cual al guardar desde Visual (RF-013).
 */

export type PropType = "text" | "number" | "boolean" | "list" | "complex";

/** Una propiedad: la clave tal como se escribe y su valor ya tipado. */
export interface PropRow {
  key: string;
  type: PropType;
  /** `string` | `number` | `boolean` | `string[]`, o el JSON original si es complejo. */
  value: unknown;
}

/** Tipo editable (o «complejo») de un valor JSON. */
export function inferType(value: unknown): PropType {
  if (typeof value === "string") return "text";
  if (typeof value === "number" && Number.isFinite(value)) return "number";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return "list";
  return "complex";
}

/** Filas del objeto `frontmatter`, en el orden de sus claves; ausente o `null` no tiene filas. */
export function toRows(frontmatter: Record<string, unknown> | null | undefined): PropRow[] {
  if (!frontmatter) return [];
  return Object.entries(frontmatter).map(([key, value]) => ({ key, type: inferType(value), value }));
}
