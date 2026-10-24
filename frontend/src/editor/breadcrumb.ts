/**
 * Migas de la nota abierta (SPEC-0010 RF-054, RF-063; PLAN-0010 §2.1, P-17). Módulo puro, sin DOM:
 * parte la ruta en carpetas y nombre, y reparte el ancho disponible entre los segmentos para que cada
 * uno se trunque **por sí mismo** con «…» (como en la captura de Obsidian) en lugar de ocultar
 * carpetas intermedias. El componente mide los anchos naturales y aplica el resultado.
 */
import { displayName } from "../notes/noteTree";

export interface Crumb {
  /** Nombre del segmento. */
  name: string;
  /** Ruta completa de la carpeta (`a/b`). */
  path: string;
}

/** Carpetas de la ruta (cada una con su ruta) y nombre de la nota sin `.md`; la raíz no tiene carpetas. */
export function crumbs(path: string): { folders: Crumb[]; name: string } {
  const segments = path.split("/");
  const last = segments.pop() ?? path;
  return {
    folders: segments.map((name, i) => ({ name, path: segments.slice(0, i + 1).join("/") })),
    name: displayName(last),
  };
}

export interface FitOptions {
  /** Ancho que ocupa cada separador `/` con sus márgenes. */
  separator: number;
  /** Ancho mínimo de una carpeta truncada (se ve «…» y poco más). */
  min: number;
  /** Ancho mínimo del nombre (`6ch`). */
  nameMin: number;
}

export const FIT_DEFAULTS: FitOptions = { separator: 16, min: 24, nameMin: 48 };

/** Reparte `budget` entre anchos naturales por igual, sin dar a ninguno más que el suyo (llenado de agua). */
function waterFill(natural: number[], budget: number): number[] {
  const result = [...natural];
  const order = natural.map((_, i) => i).sort((a, b) => natural[a] - natural[b]);
  let remaining = budget;
  order.forEach((index, position) => {
    const share = remaining / (order.length - position);
    result[index] = Math.min(natural[index], share);
    remaining -= result[index];
  });
  return result;
}

/**
 * Ancho que se concede a cada segmento (`natural` = carpetas… y nombre al final) dentro de `available`.
 * Si todo cabe, los naturales. Si no, el nombre conserva el suyo y las carpetas se recortan por igual;
 * cuando ni así caben, las carpetas bajan al mínimo y el nombre toma lo que queda (nunca menos de
 * `nameMin`): la primera carpeta y el nombre nunca desaparecen y lo que sobre lo recorta el CSS.
 */
export function fit(natural: number[], available: number, options: FitOptions = FIT_DEFAULTS): number[] {
  if (natural.length === 0 || available <= 0) return [...natural];
  const gaps = options.separator * (natural.length - 1);
  if (natural.reduce((sum, w) => sum + w, 0) + gaps <= available) return [...natural];

  const folders = natural.slice(0, -1);
  const name = natural[natural.length - 1];
  const nameWidth = (room: number) => Math.min(name, Math.max(options.nameMin, room));
  if (folders.length === 0) return [nameWidth(available)];

  const folderBudget = available - gaps - name;
  if (folderBudget >= folders.length * options.min) return [...waterFill(folders, folderBudget), name];

  const floors = folders.map((w) => Math.min(options.min, w));
  return [...floors, nameWidth(available - gaps - floors.reduce((sum, w) => sum + w, 0))];
}
