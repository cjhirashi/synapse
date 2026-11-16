/**
 * Campos de atributo en el cuerpo de un documento: `{{atributo:autor}}` se sustituye, al leerlo y al imprimirlo en PDF, por el valor vigente
 * del atributo `autor` del documento. El Markdown guardado conserva las llaves, así que cambiar el atributo actualiza todos los sitios donde se cita.
 *
 * Reglas: un atributo que no existe deja el campo tal cual (así se ve el error de escritura); uno que existe y está vacío se imprime vacío;
 * el código (bloques con cercas e inline con comillas invertidas) nunca se toca, para poder explicar la sintaxis.
 */
export const ATTRIBUTE_FIELD = /\{\{atributo:([^{}\s:]+)\}\}/g;

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const INLINE_CODE = /(`[^`\n]*`)/;

/** Valor como texto, igual que el encabezado y el pie del PDF (`pdf_style._plain`): listas con comas, booleanos «Sí»/«No», objetos vacíos. */
export function attributeText(value: unknown): string {
  if (value === null || value === undefined || (typeof value === "object" && !Array.isArray(value))) return "";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (Array.isArray(value)) return value.map(String).join(", ");
  return String(value);
}

/** El valor va como texto literal: sin saltos de línea y con los signos de Markdown escapados. */
function literal(value: unknown): string {
  return attributeText(value).replace(/\s*\n\s*/g, " ").replace(/[\\`*_{}[\]<>#|~]/g, "\\$&");
}

/** `markdown` con cada `{{atributo:x}}` (fuera del código) cambiado por el valor de `x` en `attributes`. `changed` dice si hubo alguna sustitución. */
export function fillAttributeFields(markdown: string, attributes: Record<string, unknown>): { text: string; changed: boolean } {
  if (!markdown.includes("{{atributo:")) return { text: markdown, changed: false };
  let changed = false;
  const fill = (part: string) =>
    part.replace(ATTRIBUTE_FIELD, (field, name: string) => {
      if (!Object.prototype.hasOwnProperty.call(attributes, name)) return field;
      changed = true;
      return literal(attributes[name]);
    });
  let fence: string | null = null;
  const lines = markdown.split("\n").map((line) => {
    const open = FENCE.exec(line);
    if (fence !== null) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length && line.trim() === open[1]) fence = null;
      return line;
    }
    if (open) {
      fence = open[1];
      return line;
    }
    return line.split(INLINE_CODE).map((part, index) => (index % 2 === 1 ? part : fill(part))).join("");
  });
  return { text: lines.join("\n"), changed };
}
