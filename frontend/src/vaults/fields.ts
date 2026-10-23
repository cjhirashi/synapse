/**
 * Campos de bóveda en la UI (SPEC-0003 RF-005; SPEC-0005 RF-006, RF-013): textos de sus
 * reglas y la lectura de los valores escritos en un formulario. Los comparten el formulario de
 * bóveda, la vista de rechazos del push (motivos `validation-error:*`) y la de conflictos.
 */
import type { VaultField } from "../sync/vaultRules";

export const FIELD_MESSAGES: Record<VaultField, string> = {
  name: "El nombre debe tener entre 1 y 100 caracteres, sin caracteres de control.",
  description: "La descripción admite hasta 2000 caracteres.",
  tags: "Hasta 20 etiquetas de 1 a 32 caracteres cada una.",
  icon: "El ícono elegido no es válido.",
};

export const NAME_TAKEN = "Ya tienes una bóveda con ese nombre.";

/** Etiquetas separadas por comas; `vaultRules` las pasa a minúsculas y quita repetidas. */
export function parseTags(text: string): string[] {
  return text
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");
}

/** Etiquetas como texto editable (lo inverso de `parseTags`). */
export function formatTags(tags: string[]): string {
  return tags.join(", ");
}

/** Descripción vacía o de sólo espacios es "sin descripción" (`null`). */
export function toDescription(text: string): string | null {
  return text.trim() === "" ? null : text;
}
