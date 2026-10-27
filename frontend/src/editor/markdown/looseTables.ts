/**
 * Tablas con líneas en blanco entre sus filas (SPEC-0010 RF-066, enmienda 3; decisión de producto de AIRA, 2026-10-28).
 *
 * GFM (y `micromark-extension-gfm-table`, que no tiene ninguna opción para esto) exige que cabecera, separadora y filas
 * sean líneas consecutivas: una línea en blanco rompe la tabla y los pipes salen como texto. Quien escribe a mano
 * (o un agente) suele dejar esas líneas, así que `joinLooseTableRows` las quita ANTES de parsear. Es una función pura y
 * estricta, pensada para el menor riesgo posible:
 *
 *  - sólo actúa sobre una tabla GFM válida: una fila de cabecera con pipes, seguida —saltando SÓLO líneas en
 *    blanco— de una separadora válida con el MISMO número de columnas; después absorbe filas de datos con pipes y
 *    ese mismo número de columnas, también separadas por líneas en blanco;
 *  - para en cuanto la siguiente línea no vacía no es una fila así, o cuando aparece otra separadora (una tabla
 *    NUEVA: dos tablas seguidas no se fusionan);
 *  - nunca actúa dentro del bloque YAML inicial, de bloques de código cercados (``` y ~~~), de código indentado ni
 *    de citas (la cabecera debe tener ≤ 3 espacios de sangría y no empezar por `>`);
 *  - lo que no es esa tabla queda byte a byte igual (también los fines de línea, CRLF incluido).
 *
 * Se aplica en el ÚNICO punto de entrada del parseo, así que el hilo principal, el Worker de la caché precalculada y la
 * vista de lectura ven el mismo árbol (`cachedParser` y `parseStage`). La vista Código no cambia el texto del usuario;
 * si se guarda desde Visual, la tabla se serializa compacta (comportamiento aceptado y documentado).
 */

interface Line {
  text: string;
  eol: string;
}

const BLANK = /^[ \t]*$/;
/** Pipe sin escapar (`\|` no separa celdas). */
const UNESCAPED_PIPE = /(?<!\\)\|/;
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const FRONTMATTER_FENCE = /^---[ \t]*$/;
const DELIMITER_CELL = /^\s*:?-+:?\s*$/;

/** Celdas de una fila: recorta los pipes exteriores y separa por los pipes sin escapar. */
function cells(text: string): string[] {
  let body = text.trim();
  if (body.startsWith("|")) body = body.slice(1);
  if (/(?<!\\)\|$/.test(body)) body = body.slice(0, -1);
  return body.split(/(?<!\\)\|/);
}

/** ¿Podría ser una fila de tabla? Con pipes, sangría ≤ 3 espacios (más es código) y fuera de una cita. */
function isRow(text: string): boolean {
  if (!UNESCAPED_PIPE.test(text) || /^(?: {4,}|\t)/.test(text)) return false;
  return !text.trimStart().startsWith(">");
}

/** ¿Es una separadora GFM (`|---|:--:|`) de exactamente `columns` columnas? Exige algún pipe: `---` solo es una regla. */
function isDelimiter(text: string, columns: number): boolean {
  if (!isRow(text)) return false;
  const parts = cells(text);
  return parts.length === columns && parts.every((cell) => DELIMITER_CELL.test(cell));
}

/** ¿Es una separadora GFM de cualquier número de columnas? */
const isAnyDelimiter = (text: string): boolean => isRow(text) && cells(text).every((cell) => DELIMITER_CELL.test(cell));

function split(markdown: string): Line[] {
  const parts = markdown.split(/(\r\n|\n)/);
  const lines: Line[] = [];
  for (let i = 0; i < parts.length; i += 2) lines.push({ text: parts[i], eol: parts[i + 1] ?? "" });
  return lines;
}

export function joinLooseTableRows(markdown: string): string {
  // Atajo barato: sin una línea en blanco y un pipe no hay nada que unir (el caso de casi todas las notas).
  if (!markdown.includes("|")) return markdown;
  const lines = split(markdown);
  const out: Line[] = [];
  const blank = (i: number) => BLANK.test(lines[i].text);
  const n = lines.length;

  let i = 0;
  // Bloque YAML inicial: ni se toca ni se mira dentro.
  if (n > 0 && FRONTMATTER_FENCE.test(lines[0].text)) {
    const close = lines.findIndex((line, k) => k > 0 && FRONTMATTER_FENCE.test(line.text));
    if (close > 0) {
      out.push(...lines.slice(0, close + 1));
      i = close + 1;
    }
  }

  let fence: { char: string; length: number } | null = null;
  for (; i < n; i += 1) {
    const line = lines[i];
    // Código cercado: sus líneas pasan tal cual hasta el cierre.
    const opening = FENCE.exec(line.text);
    if (fence) {
      const closing = opening && opening[1][0] === fence.char && opening[1].length >= fence.length && BLANK.test(opening[2]);
      if (closing) fence = null;
      out.push(line);
      continue;
    }
    if (opening && !(opening[1][0] === "`" && opening[2].includes("`"))) {
      fence = { char: opening[1][0], length: opening[1].length };
      out.push(line);
      continue;
    }

    if (!isRow(line.text)) {
      out.push(line);
      continue;
    }
    const columns = cells(line.text).length;
    // Separadora: la siguiente línea que no esté en blanco.
    let separator = i + 1;
    while (separator < n && blank(separator)) separator += 1;
    if (separator >= n || !isDelimiter(lines[separator].text, columns)) {
      out.push(line);
      continue;
    }

    // Tabla: cabecera + separadora (sin las líneas en blanco de en medio) + filas de datos absorbidas.
    const table = [line, lines[separator]];
    let last = separator;
    for (;;) {
      let next = last + 1;
      while (next < n && blank(next)) next += 1;
      if (next >= n) break;
      const candidate = lines[next].text;
      // Termina la tabla: no es una fila de las mismas columnas, o es otra separadora.
      if (!isRow(candidate) || cells(candidate).length !== columns || isAnyDelimiter(candidate)) break;
      // Una fila seguida de su separadora es la CABECERA de otra tabla: no se fusionan.
      let after = next + 1;
      while (after < n && blank(after)) after += 1;
      if (after < n && isDelimiter(lines[after].text, columns)) break;
      table.push(lines[next]);
      last = next;
    }
    out.push(...table);
    i = last;
  }
  return out.map((line) => line.text + line.eol).join("");
}
