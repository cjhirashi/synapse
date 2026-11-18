// Hora de la Ciudad de México para el selector de despublicación: el navegador puede estar en otra zona.
export const MIN_LEAD_MINUTES = 5;

const ZONE = "America/Mexico_City";
const FIELDS = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

/** Reloj de pared de CDMX en `instant`, expresado como milisegundos UTC (para restarlo del instante y obtener el desfase). */
function wallClockMs(instant: number): number {
  const p: Record<string, number> = {};
  for (const part of FIELDS.formatToParts(new Date(instant))) if (part.type !== "literal") p[part.type] = Number(part.value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

/** «AAAA-MM-DDTHH:mm» (un `datetime-local`) leído como hora de CDMX → instante ISO UTC; `null` si no es válido. */
export function cdmxInputToIso(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(wall);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59) return null;
  let instant = wall - (wallClockMs(wall) - wall);
  instant = wall - (wallClockMs(instant) - instant);
  return new Date(instant).toISOString();
}

/** Inverso de `cdmxInputToIso`: el instante como «AAAA-MM-DDTHH:mm» en hora de CDMX. */
export function isoToCdmxInput(iso: string): string {
  return new Date(wallClockMs(new Date(iso).getTime())).toISOString().slice(0, 16);
}

/** Mañana a la hora en punto siguiente, en hora de CDMX. */
export function defaultExpiryInput(now = new Date()): string {
  const nextHour = Math.ceil(now.getTime() / 3_600_000) * 3_600_000;
  return `${isoToCdmxInput(new Date(nextHour + 86_400_000).toISOString()).slice(0, 13)}:00`;
}

export function expiryError(value: string, now = new Date()): string | null {
  const iso = cdmxInputToIso(value);
  if (iso === null) return "Elige la fecha y la hora.";
  if (new Date(iso).getTime() < now.getTime() + MIN_LEAD_MINUTES * 60_000) return "Elige una fecha al menos 5 minutos adelante.";
  return null;
}

export function formatCdmx(iso: string): string {
  return `${new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: ZONE }).format(new Date(iso))}\u00a0CDMX`; // sin salto: «CDMX» no queda sola en otra línea
}
