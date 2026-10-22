/**
 * Textos en español de las notas (SPEC-0008; PLAN-0008 §2.6): errores de las operaciones del
 * `noteStore` y los motivos de rechazo del push. Los comparten el editor, la
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
export const FRONTMATTER_INVALID = "Los metadatos (frontmatter) de la nota no son válidos.";
export const NOTE_MALFORMED = "La nota tiene datos con un formato no válido.";
export const VAULT_NOT_FOUND =
  "La bóveda de esta nota no existe en el servidor o está en la papelera. Se reintentará sola cuando la bóveda esté activa.";
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

/**
 * Texto en español de un código de rechazo del push para una nota. Los campos que la UI no
 * deja editar (`validation-error:_rev`, `not-normalized:<otro>`…) sólo pueden venir de datos
 * mal formados, igual que en las bóvedas (`RejectionsPage.reasonText`).
 */
export function noteReasonText(code: string): string {
  if (code === "note-path-taken") return PATH_TAKEN;
  if (code === "vault-not-found") return VAULT_NOT_FOUND;
  const [kind, field] = code.split(":", 2);
  if (kind === "validation-error" || kind === "not-normalized") {
    if (field === "path") return PATH_INVALID;
    if (kind === "validation-error" && field === "content") return CONTENT_INVALID;
    if (kind === "validation-error" && field === "frontmatter") return FRONTMATTER_INVALID;
    return NOTE_MALFORMED;
  }
  return `El servidor rechazó el cambio (${code}).`;
}
