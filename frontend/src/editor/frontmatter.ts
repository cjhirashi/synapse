/**
 * Conversión entre el bloque YAML de la vista Código y el objeto `frontmatter` de la nota
 * (SPEC-0010 §3, RF-014…RF-018, RF-044, RF-045; PLAN-0010 §2.1). D1: el objeto JSON es la única
 * verdad; el YAML es derivado. Chunk diferido: única importación de `yaml` (lectura no lo pide).
 *
 * Contrato recorrido por `frontmatter.test.ts`: `contracts/frontmatter-yaml.cases.json`.
 */
import { isMap, isScalar, parseDocument, stringify, visit } from "yaml";
import { exceedsDepth } from "../notes/noteRules";

/** Etiquetas del esquema core (las implícitas no fijan `tag`; `!!str` sí, y es válida). */
const CORE_TAGS = new Set([
  "tag:yaml.org,2002:map",
  "tag:yaml.org,2002:seq",
  "tag:yaml.org,2002:str",
  "tag:yaml.org,2002:int",
  "tag:yaml.org,2002:float",
  "tag:yaml.org,2002:bool",
  "tag:yaml.org,2002:null",
]);

/** ±(2^53−1): fuera de este rango un entero no es representable sin pérdida como `number`. */
const MAX_SAFE = 9007199254740991n;

export type ParseResult = { value: Record<string, unknown> } | { error: ParseError; line?: number };
export type ParseError =
  | "yaml-syntax"
  | "not-a-map"
  | "duplicate-key"
  | "empty-key"
  | "invalid-key"
  | "non-finite"
  | "unsafe-integer"
  | "unsupported-tag"
  /** Más de `FRONTMATTER_MAX_DEPTH` niveles (o tantos que agotan la pila del analizador). */
  | "too-deep"
  /** Expansión de alias YAML por encima del límite del analizador (`maxAliasCount`). */
  | "alias-limit";

/** Línea 1 exactamente `---` hasta la siguiente línea exactamente `---`; `\n`/`\r\n` no son parte de la línea. */
export function splitFrontmatter(text: string): { yaml: string | null; body: string } {
  const open = /^---(\r\n|\n)/.exec(text);
  if (!open) return { yaml: null, body: text };
  let i = open[0].length;
  let yaml = "";
  while (i < text.length) {
    const nl = text.indexOf("\n", i);
    const noNewline = nl === -1;
    const lineEnd = noNewline ? text.length : nl > i && text[nl - 1] === "\r" ? nl - 1 : nl;
    const termEnd = noNewline ? text.length : nl + 1;
    if (text.slice(i, lineEnd) === "---") return { yaml, body: text.slice(termEnd) };
    yaml += text.slice(i, termEnd);
    i = termEnd;
  }
  // Sin línea de cierre `---`: no es frontmatter.
  return { yaml: null, body: text };
}

/** Texto de la vista Código a partir de `{frontmatter, body}` (RF-014: sin propiedades = sólo el cuerpo). */
export function composeCode(frontmatter: Record<string, unknown>, body: string): string {
  if (Object.keys(frontmatter).length === 0) return body;
  return `---\n${stringifyFrontmatter(frontmatter)}---\n${body}`;
}

/** Objeto → YAML (sin el cerco `---`), opciones de PLAN-0010 §2.1. */
export function stringifyFrontmatter(frontmatter: Record<string, unknown>): string {
  return stringify(frontmatter, { version: "1.2", schema: "core", lineWidth: 0, minContentWidth: 0 });
}

/** YAML → objeto (`value`) o rechazo (`error`, con `line` 1-based dentro del YAML cuando se conoce). */
export function parseFrontmatterYaml(src: string): ParseResult {
  let doc;
  try {
    // `maxAliasCount` por defecto ya es 100 en `yaml` 2.x (protege contra expansión de alias).
    doc = parseDocument(src, { version: "1.2", schema: "core", uniqueKeys: true, intAsBigInt: true, strict: true });
  } catch {
    return { error: "yaml-syntax" };
  }
  if (doc.errors.length) {
    const err = doc.errors[0];
    const line = err.linePos?.[0]?.line;
    const code: ParseError = err.code === "DUPLICATE_KEY" ? "duplicate-key" : "yaml-syntax";
    return line === undefined ? { error: code } : { error: code, line };
  }
  // Etiquetas o constructos fuera del esquema core llegan como avisos del parser…
  if (doc.warnings.length) return { error: "unsupported-tag" };
  // …o como etiqueta explícita que `yaml` resuelve igual (p. ej. `!!binary`, que no avisa).
  let unsupportedTag = false;
  visit(doc, {
    Node(_key, node) {
      if (node.tag && !CORE_TAGS.has(node.tag)) unsupportedTag = true;
    },
  });
  if (unsupportedTag) return { error: "unsupported-tag" };

  const contents = doc.contents;
  if (contents === null || contents === undefined) return { value: {} };
  if (!isMap(contents)) return { error: "not-a-map" };

  // Claves: deben ser escalares no vacíos ni nulos (RF-018).
  for (const pair of contents.items) {
    const key = pair.key;
    if (!isScalar(key)) return { error: "invalid-key" };
    if (key.value === null || key.value === "") return { error: "empty-key" };
  }

  // Valores: `bigint` fuera de rango → unsafe-integer; no finitos → non-finite; enteros seguros → number.
  try {
    const js = doc.toJS();
    // Tope de profundidad ANTES de normalizar: el servidor rechaza más de 32 niveles y el cliente no debe generar
    // un documento que el servidor rechace (Converge 1, H1).
    if (exceedsDepth(js)) return { error: "too-deep" };
    return { value: normalize(js) as Record<string, unknown> };
  } catch (e) {
    if (e instanceof ValueError) return { error: e.code };
    // Anidamiento tan profundo que agota la pila del analizador.
    if (e instanceof RangeError) return { error: "too-deep" };
    // El analizador corta la expansión de alias (`maxAliasCount`) lanzando un `ReferenceError`.
    if (/alias/i.test((e as Error).message)) return { error: "alias-limit" };
    return { error: "yaml-syntax" };
  }
}

/** Un valor que el frontmatter no admite (entero inseguro, número no finito): lleva su código de rechazo. */
class ValueError extends Error {
  constructor(readonly code: "unsafe-integer" | "non-finite") {
    super(code);
  }
}

function normalize(value: unknown): unknown {
  if (typeof value === "bigint") {
    if (value > MAX_SAFE || value < -MAX_SAFE) throw new ValueError("unsafe-integer");
    return Number(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ValueError("non-finite");
    return value;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    // `defineProperty` y no `out[k] = …`: una clave `__proto__` sería, con la asignación, un cambio de prototipo y la
    // clave se perdería en silencio (Converge 1, M2); así es una clave propia más.
    for (const [k, v] of Object.entries(value)) Object.defineProperty(out, k, { value: normalize(v), enumerable: true, writable: true, configurable: true });
    return out;
  }
  return value;
}

/**
 * Clasifica una nota al abrirla en edición (RF-044, RF-045):
 *  - `migrate`: `frontmatter` vacío y la nota empieza con un bloque estricto `---…---` que es un mapa válido.
 *  - `looks-yaml`: parece frontmatter pero ya hay `frontmatter`, el bloque no es un mapa / es inválido, o
 *    la nota está corrompida por Milkdown (regla del `_doc` del contrato).
 *  - `none`: nada que avisar.
 */
export function classifyLegacy(frontmatter: Record<string, unknown>, content: string): "none" | "migrate" | "looks-yaml" {
  const hasFrontmatter = Object.keys(frontmatter).length > 0;
  const { yaml } = splitFrontmatter(content);
  if (yaml !== null) {
    const parsed = parseFrontmatterYaml(yaml);
    const isValidMap = "value" in parsed;
    return !hasFrontmatter && isValidMap ? "migrate" : "looks-yaml";
  }
  return looksCorrupted(content) ? "looks-yaml" : "none";
}

const DELIMITER = /^(\*{3,}|-{3,})$/;
const KEY_VALUE = /^[^\s#:][^:]*:( |$)/;

/** La línea 1 es `***`/`---` y, antes de la primera línea delimitadora siguiente, hay un `clave: valor`. */
function looksCorrupted(content: string): boolean {
  const lines = content.split(/\r?\n/);
  if (lines.length === 0 || !DELIMITER.test(lines[0])) return false;
  for (let i = 1; i < lines.length; i += 1) {
    if (DELIMITER.test(lines[i])) return false;
    if (KEY_VALUE.test(lines[i])) return true;
  }
  return false;
}
