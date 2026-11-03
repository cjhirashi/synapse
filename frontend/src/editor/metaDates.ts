import { normalizeDate } from "./attributeRules";

/**
 * Convierte una fecha a string AAAA-MM-DD usando componentes locales (no UTC).
 * Usado para sellar fechas de creación y actualización con la zona horaria local del cliente.
 */
export function localDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Sella las fechas de una nota:
 * - `fecha_actualizacion` siempre se pone a `today`.
 * - `fecha_creacion` se conserva si es válida, o se reemplaza con `createdAtISO` recortado a AAAA-MM-DD,
 *   o si falta o ambas son inválidas, se pone a `today`.
 * - Conserva todas las demás claves en su orden y sin mutar la entrada.
 */
export function stampDates(
  frontmatter: Record<string, unknown>,
  options: { today: string; createdAtISO?: string }
): Record<string, unknown> {
  const { today, createdAtISO } = options;

  // Copia el frontmatter conservando orden de claves
  const result: Record<string, unknown> = { ...frontmatter };

  // Determina fecha_creacion: conserva si es válida, usa createdAtISO si es válido, si no today
  const existing = result.fecha_creacion;
  if (normalizeDate(existing) === existing) {
    // Válida, conserva
    result.fecha_creacion = existing;
  } else if (createdAtISO) {
    // Extrae solo la parte AAAA-MM-DD
    const match = createdAtISO.match(/^(\d{4}-\d{2}-\d{2})/);
    const iso = match ? match[1] : null;
    result.fecha_creacion = iso && normalizeDate(iso) === iso ? iso : today;
  } else {
    result.fecha_creacion = today;
  }

  // Siempre sella la actualización a today
  result.fecha_actualizacion = today;

  return result;
}
