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

/**
 * Número escrito en el formulario (`type="text" inputmode="decimal"`): decimal finito con punto y sin
 * exponente; un entero debe caer en el rango seguro de JSON. `null` si no es un número admitido.
 */
export function parseNumberInput(text: string): number | null {
  const trimmed = text.trim();
  if (!/^[+-]?\d+(\.\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  if (!trimmed.includes(".") && !Number.isSafeInteger(value)) return null;
  return value;
}

/** Valor vacío de cada tipo editable (el que queda cuando una conversión no es representable). */
function emptyOf(type: PropType): unknown {
  switch (type) {
    case "number":
      return "";
    case "boolean":
      return false;
    case "list":
      return [];
    default:
      return "";
  }
}

/** ¿Hay algo que perder en este valor? (un vacío no se anuncia como «vaciado»). */
function hasContent(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return value !== "" && value !== false && value !== null && value !== undefined;
}

/**
 * Cambio de tipo en el formulario (PLAN-0010 §2.3-c): texto→número sólo si es numérico válido;
 * número→texto `String`; lista→texto `", "`; texto→lista un elemento; Sí/No↔texto `"true"`/`"false"`.
 * Lo no representable queda vacío y `emptied` avisa de que se perdió contenido.
 */
export function convert(value: unknown, from: PropType, to: PropType): { value: unknown; emptied: boolean } {
  if (from === to) return { value, emptied: false };
  const lost = () => ({ value: emptyOf(to), emptied: hasContent(value) });

  switch (to) {
    case "text":
      if (from === "list") return { value: (value as string[]).join(", "), emptied: false };
      return { value: String(value), emptied: false };
    case "number": {
      if (from === "text") {
        const parsed = parseNumberInput(value as string);
        return parsed === null ? lost() : { value: parsed, emptied: false };
      }
      return lost();
    }
    case "boolean":
      if (from === "text" && (value === "true" || value === "false")) return { value: value === "true", emptied: false };
      return lost();
    case "list":
      if (from === "text") return { value: value === "" ? [] : [value], emptied: false };
      return { value: [String(value)], emptied: false };
    default:
      return lost();
  }
}

export type RowErrorCode = "empty-key" | "duplicate-key" | "invalid-number";

export interface RowError {
  /** Posición de la fila en la lista. */
  index: number;
  code: RowErrorCode;
  /** Clave de la fila (para el mensaje). */
  key: string;
}

/** Errores por fila: clave vacía, clave repetida (igualdad exacta; cuenta la segunda en adelante) y número no válido. */
export function validateRows(rows: PropRow[]): RowError[] {
  const errors: RowError[] = [];
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    if (row.key === "") errors.push({ index, code: "empty-key", key: row.key });
    else if (seen.has(row.key)) errors.push({ index, code: "duplicate-key", key: row.key });
    else seen.add(row.key);
    if (row.type === "number" && (typeof row.value === "string" ? parseNumberInput(row.value) === null : !Number.isFinite(row.value))) {
      errors.push({ index, code: "invalid-number", key: row.key });
    }
  });
  return errors;
}

/**
 * Objeto `frontmatter` de las filas, en su orden. Supone filas válidas (`validateRows`): una fila sin
 * clave o con un número ilegible se omite. Los complejos viajan tal cual (RF-013).
 */
export function fromRows(rows: PropRow[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    if (row.key === "") continue;
    if (row.type === "number") {
      const value = typeof row.value === "string" ? parseNumberInput(row.value) : (row.value as number);
      if (value === null) continue;
      result[row.key] = value;
    } else {
      result[row.key] = row.value;
    }
  }
  return result;
}
