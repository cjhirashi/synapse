/**
 * Resaltador compartido (SPEC-0010 RF-027…RF-029, RF-040; PLAN-0010 §2.1, §2.3-e, §2.3-h).
 *
 * `tagHighlighter` de Lezer: traduce las etiquetas de las gramáticas (las de CodeMirror, que usan las
 * dos vistas) a clases `sx-*`, y `editor/syntax.css` les da color con tokens. Así un `const` se colorea
 * igual en la vista Código (CodeMirror) y en lectura/Visual (decoraciones de ProseMirror), y todo el
 * color sale de la hoja de estilos —nada de colores en línea— con contraste ≥ 4,5:1 (RNF-004).
 */
import { Tag, tagHighlighter, tags as t } from "@lezer/highlight";

/** Marca de tarea (`[ ]`/`[x]`) del markdown GFM: etiqueta propia para colorearla como el mockup (`--accent-hover`). */
export const taskMarkerTag = Tag.define("taskMarker");

export const synapseHighlighter = tagHighlighter([
  // Código de los bloques cercados (paleta de §2.3-e).
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.operatorKeyword, t.modifier, t.tagName], class: "sx-keyword" },
  { tag: [t.string, t.special(t.string), t.regexp, t.character], class: "sx-string" },
  { tag: [t.number, t.bool, t.null, t.atom, t.integer, t.float], class: "sx-number" },
  { tag: [t.typeName, t.className, t.propertyName, t.attributeName, t.namespace], class: "sx-type" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.variableName)], class: "sx-function" },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], class: "sx-comment" },
  { tag: t.deleted, class: "sx-deletion" },
  { tag: [t.variableName, t.operator, t.punctuation, t.bracket, t.separator, t.angleBracket, t.squareBracket, t.paren, t.brace], class: "sx-plain" },
  // Markdown de la vista Código (§2.3-h).
  { tag: t.heading1, class: "sx-heading1" },
  { tag: [t.heading2, t.heading3, t.heading4, t.heading5, t.heading6, t.heading], class: "sx-heading" },
  { tag: t.strong, class: "sx-strong" },
  { tag: t.emphasis, class: "sx-emphasis" },
  { tag: t.link, class: "sx-link" },
  { tag: t.url, class: "sx-url" },
  { tag: t.monospace, class: "sx-code" },
  { tag: t.quote, class: "sx-quote" },
  { tag: taskMarkerTag, class: "sx-task" },
  { tag: [t.processingInstruction, t.contentSeparator, t.meta], class: "sx-meta" },
]);
