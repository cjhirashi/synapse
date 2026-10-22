/**
 * Combinación automática de una nota en conflicto (SPEC-0008 RF-009; ADR-001; PLAN-0008 §2.6).
 *
 * A diferencia de las bóvedas no hay combinación campo a campo: dos ediciones de un texto no
 * se funden sin riesgo de perder una, y elegir la "más reciente" descartaría la otra en
 * silencio (ADR-001). Lo único que se cierra solo es la convergencia: dos resoluciones
 * iguales del mismo conflicto sólo difieren en `updated_at` (VC-2 de 0005), así que basta con
 * cerrar la perdedora. Cualquier otra diferencia (ruta, contenido, frontmatter, borrado) es
 * manual y la decide el usuario con las dos versiones delante.
 */
import { canonical } from "../sync/canonical";

/** Cuerpo de una nota sin los metadatos de PouchDB (`_id`, `_rev`, `type`). */
export interface NoteBody {
  vault_id: string;
  path: string;
  content: string;
  frontmatter: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type NoteMergeResult =
  /** Siempre `tombstoneOnly`: `w` ya es el resultado y sólo se cierra la rama de `l`. */
  | { kind: "merged"; doc: NoteBody; tombstoneOnly: true }
  | { kind: "manual" };

export function mergeNote(w: NoteBody, l: NoteBody): NoteMergeResult {
  // `updated_at` queda fuera de la comparación; el frontmatter se compara en forma canónica
  // para que el orden de sus claves no cuente como diferencia.
  const { updated_at: _w, ...wRest } = w;
  const { updated_at: _l, ...lRest } = l;
  return canonical(wRest) === canonical(lRest) ? { kind: "merged", doc: w, tombstoneOnly: true } : { kind: "manual" };
}
