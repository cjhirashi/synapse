/**
 * Textos en español de las notas (SPEC-0008; PLAN-0008 §2.6): errores de las operaciones del
 * `noteStore` y los motivos de rechazo del push. Los comparten el editor, la
 * sidebar, la papelera y la vista de rechazos, igual que `vaults/fields.ts` con las bóvedas.
 */
import { STORAGE_FULL } from "../vaults/errors";
import { StorageFullError } from "../sync/vaultStore";
import { NoteChangedError, NoteNotFoundError, NotePathTakenError, NoteValidationError, TemplateInUseError } from "./errors";

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
export function folderNameMessage(code: "empty" | "empty-segment" | "control" | "slash" | "duplicate", name = ""): string {
  switch (code) {
    case "empty":
      return "Escribe un nombre. No puede estar vacío.";
    case "empty-segment":
      return "El nombre no puede tener tramos vacíos (por ejemplo, a//b).";
    case "control":
      return "El nombre no puede tener caracteres de control.";
    case "slash":
      return "El nombre no puede contener «/».";
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
  "too-deep": "anida demasiados niveles (el máximo es 32)",
  "alias-limit": "repite demasiados alias (&/*)",
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
  if (err instanceof TemplateInUseError) {
    return `No se puede borrar, renombrar ni mover la plantilla: ${err.users === 1 ? "1 documento la usa" : `${err.users} documentos la usan`}. Quita la plantilla de esos documentos primero.`;
  }
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
  if (code === "agent-access-denied") return "El registro de AG - AGENTES no permite a esta clave escribir ahí.";
  if (code === "immutable-field:cerrada_el") return "La hora de cierre de una conversación la fija el servidor.";
  if (code === "meta-folder:case") return "Las carpetas reservadas se escriben en MAYÚSCULAS, por ejemplo PLANTILLAS.";
  if (code === "meta-folder:rename") return "Una carpeta reservada (AG - SKILLS, AG - MENSAJES, AG - AGENTES, BITACORA, PLANTILLAS) no se renombra ni se mueve.";
  if (code === "meta-folder:index-delete") return "El INDICE de una carpeta reservada no se puede borrar.";
  if (code === "bitacora:readonly") return "La bitácora la escribe solo el servidor: no se puede editar, mover ni borrar.";
  if (code === "sistema:readonly") return "Documento de sistema: no se puede editar, mover ni borrar. Se actualiza con cada versión de Synapse.";
  if (code === "sistema:reserved") return "El atributo «sistema» es reservado: solo lo ponen los documentos que publica Synapse.";
  if (code === "plantilla:path") return "Las plantillas van en PLANTILLAS/, planas y con nombre plantilla-<nombre>.md.";
  if (code === "plantilla:alcance") return "Una plantilla necesita un alcance válido (carpetas o '*' para toda la bóveda).";
  if (code === "plantilla:atributos") return "Los atributos extra de una plantilla deben tener nombre, tipo y valor válidos.";
  if (code === "plantilla:estilo") return "El estilo de una plantilla debe estar vacío (reservado para web/PDF).";
  if (code === "plantilla:in-use") return "No se puede borrar, renombrar ni mover una plantilla mientras algún documento la use.";
  if (code === "plantilla:unknown") return "La plantilla referida en el documento no existe.";
  if (code.startsWith("meta-folder:")) return "Las carpetas reservadas (AG - …, BITACORA, PLANTILLAS) no se renombran y su INDICE no se borra.";
  if (code.startsWith("ag-mensajes:")) return "La nota no respeta el formato de AG - MENSAJES o es un mensaje que no se puede cambiar.";
  if (code.startsWith("ag-agentes:")) return "Un registro de AG - AGENTES necesita un estado (activo o suspendido) y la lista de carpetas.";
  if (code.startsWith("plantilla:")) return "La plantilla tiene un problema: consulta con el administrador.";
  const [kind, field] = code.split(":", 2);
  if (kind === "validation-error" || kind === "not-normalized") {
    if (field === "path") return PATH_INVALID;
    if (kind === "validation-error" && field === "content") return CONTENT_INVALID;
    if (kind === "validation-error" && field === "frontmatter") return FRONTMATTER_INVALID;
    return NOTE_MALFORMED;
  }
  return `El servidor rechazó el cambio (${code}).`;
}
