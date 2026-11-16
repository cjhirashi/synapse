/**
 * Atributo `style` de los `div` y `span` del cuerpo de un documento (H-036f): lista cerrada de propiedades y de valores. Copia de
 * `backend/app/core/html_style.py`: los dos pasan `backend/tests/fixtures/estilo_html.json`. Quedan fuera lo que carga recursos (`url()`), lo que saca el
 * elemento de su sitio (`position`, negativos), lo que lo oculta (`display:none`) y cualquier función fuera de la lista.
 */
const PROPERTIES = new Set([
  "width", "height", "min-width", "min-height", "max-width", "max-height",
  "background", "background-color", "color", "opacity",
  "border", "border-top", "border-right", "border-bottom", "border-left", "border-color", "border-width", "border-style",
  "border-radius", "border-top-left-radius", "border-top-right-radius", "border-bottom-left-radius", "border-bottom-right-radius",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "display", "vertical-align", "font-size", "font-weight", "font-style", "text-align", "text-decoration", "line-height",
]);
const DISPLAYS = new Set(["block", "inline-block", "inline", "flex"]);
const FUNCTIONS = new Set(["rgb", "rgba", "hsl", "hsla", "calc", "min", "max", "clamp", "linear-gradient", "radial-gradient"]);
const NO_NEGATIVE = /^(width|height|min-|max-|margin|padding)/;
const MAX_LENGTH = 400;
const MAX_DECLARATIONS = 20;

const VALUE_CHARS = /^[A-Za-z0-9#%.,()+\-*/ ]+$/;
const FORBIDDEN = /url\(|image-set|expression|javascript|var\(|attr\(|env\(|\/\*/i;
const NEGATIVE = /(^|[\s(,])-[\d.]/;

function valueOk(prop: string, value: string): boolean {
  if (!value || !VALUE_CHARS.test(value) || FORBIDDEN.test(value)) return false;
  for (const match of value.matchAll(/([A-Za-z-]+)\(/g)) if (!FUNCTIONS.has(match[1].toLowerCase())) return false;
  if (prop === "display") return DISPLAYS.has(value.toLowerCase());
  return !(NO_NEGATIVE.test(prop) && NEGATIVE.test(value));
}

/** Las declaraciones permitidas de `style`, en su orden y como `propiedad: valor; …`; vacío si no queda ninguna (el atributo se quita). */
export function cleanStyle(style: string): string {
  if (style.length > MAX_LENGTH * 2) return "";
  const parts = style.split(";");
  if (parts.filter((part) => part.trim() !== "").length > MAX_DECLARATIONS) return "";
  const kept: string[] = [];
  for (const part of parts) {
    const at = part.indexOf(":");
    if (at < 0) continue;
    const prop = part.slice(0, at).trim().toLowerCase();
    const value = part.slice(at + 1).split(/\s+/).filter(Boolean).join(" ");
    if (PROPERTIES.has(prop) && valueOk(prop, value)) kept.push(`${prop}: ${value}`);
  }
  const result = kept.join("; ");
  return result.length <= MAX_LENGTH ? result : "";
}
