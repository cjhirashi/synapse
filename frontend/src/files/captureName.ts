/**
 * Genera un nombre de archivo para captura de pantalla pegada (H-025 paso 6).
 * Usa la hora de America/Mexico_City, nunca UTC ni hora local.
 * Solo acepta tipos de imagen específicos: png, jpeg, gif, webp.
 */
export function captureFileName(
  date: Date,
  type: string
): string | null {
  const ext = typeToExtension(type);
  if (!ext) return null;

  const formatter = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map = new Map(parts.map((p) => [p.type, p.value]));

  const year = map.get("year");
  const month = map.get("month");
  const day = map.get("day");
  const hour = map.get("hour");
  const minute = map.get("minute");
  const second = map.get("second");

  const dateStr = `${year}${month}${day}`;
  const timeStr = `${hour}${minute}${second}`;

  return `captura-${dateStr}-${timeStr}.${ext}`;
}

function typeToExtension(type: string): string | null {
  switch (type) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}
