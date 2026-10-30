/**
 * Resolución pura de wikilinks de Obsidian (H-011, Fase 1: reconocer y mostrar, sin navegar).
 *
 * Milkdown no define `[[Destino]]`/`[[Destino|Alias]]` (no es Commonmark). Este módulo aísla la
 * lógica *sin* Milkdown: reconocer la sintaxis dentro de un texto (`splitWikiLinks`), separar
 * destino y alias (`parseWikiLinkBody`) y resolver el destino contra las notas de la bóveda
 * (`resolveWikiLink`). `MilkdownView` lo usa desde su marca `$MarkSchema` y su transformador remark.
 *
 * Decisiones de producto (Gate 1, Carlos, 2026-10-30; ver historia §3):
 *  - P-1: sólo resuelven destinos a una nota `.md` de la MISMA bóveda; `.docx`/`.pdf`/inexistente → roto.
 *  - P-2: comparación insensible a mayúsculas/minúsculas sobre el nombre de archivo (como Obsidian;
 *    sin plegar acentos más allá de lo que implique `toLowerCase`).
 *  - P-3: dos notas con el mismo nombre en carpetas distintas → resuelve la primera que se encuentre.
 *  - C-7: la resolución devuelve el `id` de la nota (no el nombre); ese id vive como atributo interno
 *    de la marca, listo para la navegación de H-012 sin re-buscar por nombre.
 */

/** Nota de la bóveda que `resolveWikiLink` puede alcanzar: su `id` interno y su ruta (con `.md`). */
export interface NoteRef {
  id: string;
  path: string;
}

/** Destino y alias separados de un cuerpo `[[...]]` (sin los corchetes). */
export interface WikiLinkToken {
  /** El texto del destino, tal cual viaja en el markdown (lo que se resuelve por nombre). */
  target: string;
  /** El alias tras el primer `|`, o `null` si el wikilink no lo trae. */
  alias: string | null;
}

/** Un segmento de texto plano o un wikilink reconocido dentro de un texto. */
export type WikiSegment = { type: "text"; value: string } | ({ type: "wiki"; raw: string } & WikiLinkToken);

/**
 * `[[...]]` con un cuerpo sin corchetes anidados. Se escanea de izquierda a derecha con `exec` en bucle
 * (global) para partir un texto en segmentos; un cuerpo vacío (`[[]]`) no casa (`.+?` exige ≥1 carácter).
 */
const WIKILINK = /\[\[([^[\]]+?)\]\]/g;

/** Separa el cuerpo de un wikilink en `{target, alias}` por el PRIMER `|`; recorta espacios de ambos. */
export function parseWikiLinkBody(body: string): WikiLinkToken {
  const bar = body.indexOf("|");
  if (bar < 0) return { target: body.trim(), alias: null };
  return { target: body.slice(0, bar).trim(), alias: body.slice(bar + 1).trim() };
}

/** El nombre de archivo de una ruta (lo que sigue al último `/`), o la ruta entera si no tiene `/`. */
function baseName(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash >= 0 ? path.slice(slash + 1) : path;
}

/**
 * El `id` de la nota `.md` que resuelve este destino, o `null` (enlace roto). Compara el nombre de
 * archivo del destino contra el de cada nota, insensible a mayúsculas (P-2) y tolerando que el destino
 * traiga o no el sufijo `.md`. Un destino con otra extensión (`.docx`, `.pdf`) no casa con ninguna nota
 * `.md` y queda roto (P-1/C-4). Con nombres duplicados devuelve el primero del listado (P-3).
 */
export function resolveWikiLink(target: string, notes: readonly NoteRef[]): string | null {
  const wanted = baseName(target.trim()).toLowerCase();
  if (!wanted) return null;
  for (const note of notes) {
    const base = baseName(note.path).toLowerCase();
    const baseNoMd = base.endsWith(".md") ? base.slice(0, -3) : base;
    if (wanted === base || wanted === baseNoMd) return note.id;
  }
  return null;
}

/**
 * ¿El destino de un wikilink roto trae una extensión de archivo que Synapse NO gestiona? (H-012 C-3/P-1).
 * Al hacer clic en un roto: sin extensión → se crea la nota; con extensión ajena (`.docx`, `.pdf`…) → no
 * se hace nada. `.md` SÍ lo gestiona, así que no cuenta como ajena (un `[[Nota.md]]` roto se crea igual).
 * Sólo cuenta como extensión un sufijo `.algo` pegado al final del nombre de archivo, sin espacios ni más
 * puntos (así «2.1.19 - …» o «v1.2 plan», con puntos internos seguidos de espacio, no se confunden).
 */
export function hasUnmanagedExtension(target: string): boolean {
  const match = /\.([^./\s]+)$/.exec(baseName(target.trim()));
  return match !== null && match[1].toLowerCase() !== "md";
}

/**
 * Parte un texto en segmentos de texto plano y wikilinks reconocidos, en orden. Un texto sin `[[...]]`
 * devuelve un único segmento de texto. No resuelve nada (eso es `resolveWikiLink`): sólo reconoce la
 * sintaxis (C-1), para que el transformador remark de `MilkdownView` reconstruya los nodos.
 */
export function splitWikiLinks(text: string): WikiSegment[] {
  const segments: WikiSegment[] = [];
  let last = 0;
  WIKILINK.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WIKILINK.exec(text)) !== null) {
    const body = parseWikiLinkBody(match[1]);
    if (!body.target) continue; // `[[ | alias]]` sin destino: no es un wikilink válido, se deja como texto
    if (match.index > last) segments.push({ type: "text", value: text.slice(last, match.index) });
    segments.push({ type: "wiki", raw: match[0], target: body.target, alias: body.alias });
    last = match.index + match[0].length;
  }
  if (last < text.length) segments.push({ type: "text", value: text.slice(last) });
  // Un texto entero sin wikilinks (o con sólo cuerpos vacíos) debe seguir siendo un segmento de texto.
  if (segments.length === 0) segments.push({ type: "text", value: text });
  return segments;
}
