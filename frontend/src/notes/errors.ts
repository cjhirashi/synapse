/**
 * Errores de las operaciones sobre notas (SPEC-0008 RF-003, RF-009…RF-013, RF-016, RF-017).
 *
 * Van en su propio módulo para que `noteStore.ts` y `sync/conflicts.ts` los compartan sin un
 * ciclo de imports (`noteStore` usa `child()` de `conflicts`). La UI los traduce con los
 * textos de `messages.ts`; `noteStore.ts` los reexporta. La cuota agotada es la misma
 * `StorageFullError` de 0005 (`sync/vaultStore.ts`).
 */

/** Campos de una nota que pueden fallar la validación (los de entrada de la UI). */
export type NoteField = "path" | "content" | "frontmatter";

/** Campos que no pasan las reglas de `noteRules` (el rechazo `validation-error:<campo>`). */
export class NoteValidationError extends Error {
  constructor(readonly fields: NoteField[]) {
    super(`campos inválidos: ${fields.join(", ")}`);
    this.name = "NoteValidationError";
  }
}

/** Otra nota activa de la bóveda tiene una ruta equivalente (el `note-path-taken` del push). */
export class NotePathTakenError extends Error {
  constructor() {
    super("ya existe una nota activa con esa ruta");
    this.name = "NotePathTakenError";
  }
}

/** No existe, o no está en el estado que pide la operación (activa / en la papelera). */
export class NoteNotFoundError extends Error {
  constructor() {
    super("nota no encontrada");
    this.name = "NoteNotFoundError";
  }
}

/** La revisión que editaba la UI ya no es la actual (el 409 de PouchDB). */
export class NoteChangedError extends Error {
  constructor() {
    super("la nota cambió desde que se cargó");
    this.name = "NoteChangedError";
  }
}
