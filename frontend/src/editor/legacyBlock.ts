/**
 * Bloque de YAML heredado al inicio de una nota, detectado SIN cargar `yaml` (SPEC-0010 P-6, UX-H4).
 *
 * En lectura el cuerpo se pinta con markdown: un `---\nclave: valor\n---` inicial salía como regla horizontal más una
 * línea en negrita (Setext). Igual que en Visual (bloque protegido, literal en mono), en lectura se muestra aparte,
 * tal cual. La detección es deliberadamente barata y conservadora —cerco `---` en la línea 1, cierre `---` y al menos
 * una línea `clave: valor` dentro—; la clasificación completa (`classifyLegacy`) sigue ocurriendo al editar.
 */
const BLOCK = /^---[ \t]*\r?\n((?:(?!---[ \t]*(?:\r?\n|$))[^\n]*\n?)*?)---[ \t]*(?:\r?\n|$)/;
const KEY_VALUE = /^[^\s#:][^:\n]*:( |$)/m;

export function splitLegacyBlock(content: string): { block: string; rest: string } | null {
  const match = BLOCK.exec(content);
  if (!match || !KEY_VALUE.test(match[1])) return null;
  return { block: match[0].replace(/\r?\n$/, ""), rest: content.slice(match[0].length) };
}
