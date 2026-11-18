/**
 * Campos de atributo en el cuerpo de un documento: `{{atributo:autor}}` muestra, en Lectura y en el PDF, el valor vigente del
 * atributo `autor` del documento, marcado en pantalla para que se note que viene de un atributo. El Markdown guardado conserva las llaves,
 * así que cambiar el atributo actualiza todos los sitios donde se cita.
 *
 * Reglas: un nombre que no es atributo del documento deja el campo tal cual (así se ve el error de escritura); uno que existe y está vacío no muestra nada; el código (en línea o con cercas) nunca se toca,
 * para poder explicar la sintaxis.
 */
export const ATTRIBUTE_FIELD = /\{\{atributo:([^{}\s:]+)\}\}/g;

export type AttributeSegment = { type: "text"; value: string } | { type: "field"; name: string; value: string };

/** Valor como texto, igual que el encabezado y el pie del PDF (`pdf_style._plain`): listas con comas, booleanos «Sí»/«No», objetos vacíos. */
export function attributeText(value: unknown): string {
  if (value === null || value === undefined || (typeof value === "object" && !Array.isArray(value))) return "";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (Array.isArray(value)) return value.map(String).join(", ");
  return String(value);
}

/** Parte `text` en trozos de texto y campos resueltos con el valor de `attributes`; los nombres que no son atributos quedan como texto. */
export function splitAttributeFields(text: string, attributes: Record<string, unknown>): AttributeSegment[] {
  const segments: AttributeSegment[] = [];
  let last = 0;
  const push = (value: string) => {
    if (value === "") return;
    const before = segments[segments.length - 1];
    if (before?.type === "text") before.value += value;
    else segments.push({ type: "text", value });
  };
  for (const match of text.matchAll(ATTRIBUTE_FIELD)) {
    const name = match[1];
    push(text.slice(last, match.index));
    last = match.index + match[0].length;
    if (Object.prototype.hasOwnProperty.call(attributes, name)) segments.push({ type: "field", name, value: attributeText(attributes[name]).replace(/\s*\n\s*/g, " ") });
    else push(match[0]);
  }
  push(text.slice(last));
  return segments;
}
