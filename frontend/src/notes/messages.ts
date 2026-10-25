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

/** Mensaje del nombre de carpeta inválido o duplicado (RF-004, RF-005). `duplicate` lleva el nombre. */
export function folderNameMessage(code: "empty" | "empty-segment" | "control" | "duplicate", name = ""): string {
  switch (code) {
    case "empty":
      return "Escribe un nombre. No puede estar vacío.";
    case "empty-segment":
      return "El nombre no puede tener tramos vacíos (por ejemplo, a//b).";
    case "control":
      return "El nombre no puede tener caracteres de control.";
    case "duplicate":
      return `Ya existe una carpeta con ese nombre («${name}»).`;
  }
}

/** Motivo legible de cada código de error del YAML del frontmatter (RF-017). */
const YAML_REASON: Record<string, string> = {
  "yaml-syntax": "tiene un error de sintaxis",
  "not-a-map": "debe ser una lista de propiedades «clave: valor»",
  "duplicate-key": "tiene una propiedad repetida",
  "empty-key": "tiene una propiedad sin nombre",
  "invalid-key": "tiene una propiedad con un nombre no válido",
  "non-finite": "tiene un número que no es finito",
  "unsafe-integer": "tiene un entero demasiado grande",
  "unsupported-tag": "usa una etiqueta YAML no admitida",
};

/** Aviso de YAML del frontmatter inválido, con el motivo y la línea (1-based en el texto completo). */
export function frontmatterYamlMessage(code: string, line?: number): string {
  const reason = YAML_REASON[code] ?? "no se pudo leer";
  return `El frontmatter no es un YAML válido: ${reason}${line !== undefined ? ` (línea ${line})` : ""}.`;
}

/** Aviso de frontmatter que supera el tope de 64 KiB (RF-019), con el tamaño medido. */
export function frontmatterTooLargeMessage(bytes: number): string {
  return `Las propiedades ocupan ${(bytes / 1024).toFixed(1)} KiB y superan el límite de 64 KiB: no se guardaron.`;
}

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
