/** Funciones puras para textos de concesiones (H-064). */
import type { Grant } from "./sharingApi";

/** Convierte una lista de concesiones a un texto en español. */
export function grantsText(grants: Grant[]): string {
  if (grants.length === 0) return "Sin permisos";

  const escritura: string[] = [];
  const lectura: string[] = [];

  for (const { folder, level } of grants) {
    const name = folder === "*" ? "toda la bóveda" : folder;
    if (level === "escritura") {
      escritura.push(name);
    } else {
      lectura.push(name);
    }
  }

  const parts: string[] = [];
  if (escritura.length > 0) {
    parts.push(`Escritura en ${formatList(escritura)}`);
  }
  if (lectura.length > 0) {
    parts.push(`Lectura en ${formatList(lectura)}`);
  }

  return parts.join(" · ");
}

/** Formato lista: «a», «a y b», «a, b y c». */
function formatList(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return items.slice(0, -1).join(", ") + ` y ${items[items.length - 1]}`;
}

/** Rol implícito de las concesiones. */
export type Role = "lector" | "editor" | "personalizado";

export function roleOf(grants: Grant[]): Role {
  if (grants.length === 1) {
    const [g] = grants;
    if (g.folder === "*" && g.level === "lectura") return "lector";
    if (g.folder === "*" && g.level === "escritura") return "editor";
  }
  return "personalizado";
}
