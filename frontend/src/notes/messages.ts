/**
 * Textos en español de las notas (SPEC-0008; PLAN-0008 §2.6): errores de las operaciones del
 * `noteStore` y, más adelante, los motivos de rechazo del push. Los comparten el editor, la
 * sidebar, la papelera y la vista de rechazos, igual que `vaults/fields.ts` con las bóvedas.
 */
import { STORAGE_FULL } from "../vaults/errors";
import { StorageFullError } from "../sync/vaultStore";
import { NoteChangedError, NoteNotFoundError, NotePathTakenError, NoteValidationError } from "./errors";

export const PATH_INVALID =
  "La ruta debe tener entre 1 y 300 caracteres, sin caracteres de control ni carpetas sin nombre.";
export const PATH_TAKEN = "Ya hay una nota con esa ruta en esta bóveda.";
export const CONTENT_INVALID = "La nota supera los 2 MiB o tiene caracteres no válidos: no se guardó.";
export const NOTE_CHANGED = "La nota cambió mientras la editabas. Vuelve a abrirla para ver su estado actual.";
export const NOTE_NOT_FOUND = "La nota ya no existe.";
export const GENERIC_FAILURE = "No se pudo completar la operación. Inténtalo de nuevo.";

/** Texto para el usuario de un error de las operaciones sobre notas. */
export function noteErrorMessage(err: unknown): string {
  if (err instanceof NoteValidationError) {
    return err.fields.includes("content") ? CONTENT_INVALID : PATH_INVALID;
  }
  if (err instanceof NotePathTakenError) return PATH_TAKEN;
  if (err instanceof NoteChangedError) return NOTE_CHANGED;
  if (err instanceof NoteNotFoundError) return NOTE_NOT_FOUND;
  if (err instanceof StorageFullError) return STORAGE_FULL;
  return GENERIC_FAILURE;
}
