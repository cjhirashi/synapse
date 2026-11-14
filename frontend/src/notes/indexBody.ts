/**
 * Cuerpo generado de un INDICE (H-031), desde la copia local de las notas. Espejo de
 * `backend/app/core/index_body.py`; ambos cumplen `backend/tests/fixtures/indice_cuerpo.json`.
 */
import { INDEX_NAME, isIndexPath } from "./indexRules";
import { pathKey } from "./noteRules";

export const DESCRIPCION_MAX = 80;

export interface IndexNote {
  path: string;
  frontmatter?: Record<string, unknown> | null;
}

const flat = (value: string): string => value.replace(/\s+/gu, " ").trim();
const text = (fm: Record<string, unknown>, key: string): string => (typeof fm[key] === "string" ? (fm[key] as string) : "");

function extraText(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value.join(", ");
  return "";
}

/** Comparación por puntos de código (como Python), no por unidades UTF-16. */
function byCodePoints(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const diff = x[i].codePointAt(0)! - y[i].codePointAt(0)!;
    if (diff !== 0) return diff;
  }
  return x.length - y.length;
}

/** Una parte del elemento: la descripción (`label` nulo) o un dato con nombre (Estado, Tags, Actualizado, columnas `extra`). */
export interface IndexPart {
  label: string | null;
  value: string;
}

/** Partes del elemento con valor, en orden: descripción, Estado, Tags, Actualizado y las columnas `extra`. */
export function metaParts(fm: Record<string, unknown>, extra: readonly string[]): IndexPart[] {
  const points = [...flat(text(fm, "descripcion"))];
  const description = points.length > DESCRIPCION_MAX ? points.slice(0, DESCRIPCION_MAX).join("") + "…" : points.join("");
  const tags = Array.isArray(fm.tags) && fm.tags.every((tag) => typeof tag === "string") ? (fm.tags as string[]).join(", ") : "";
  const labeled: [string, string][] = [["Estado", text(fm, "estado")], ["Tags", tags], ["Actualizado", text(fm, "fecha_actualizacion")]];
  for (const key of extra) labeled.push([key, extraText(fm[key])]);
  return [
    ...(description ? [{ label: null, value: description }] : []),
    ...labeled.filter(([, value]) => flat(value)).map(([label, value]) => ({ label, value: flat(value) })),
  ];
}

const meta = (fm: Record<string, unknown>, extra: readonly string[]): string[] =>
  metaParts(fm, extra).map((part) => (part.label === null ? part.value : `${part.label}: ${part.value}`));

const ENTITY = /&(?:#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{0,31});/gu;
const ALNUM = /^[\p{L}\p{N}]$/u;

/** Escapa con `\` lo que el parser de Markdown interpretaría dentro de un enlace (código, énfasis, HTML, entidades). */
function escapeInline(text: string): string {
  const chars = [...text];
  const entities = new Set<number>();
  let offset = 0;
  const unitToIndex = new Map<number, number>();
  for (const [i, ch] of chars.entries()) {
    unitToIndex.set(offset, i);
    offset += ch.length;
  }
  for (const m of text.matchAll(ENTITY)) entities.add(unitToIndex.get(m.index!)!);
  return chars
    .map((ch, i) => {
      if ("\\`*~<".includes(ch)) return `\\${ch}`;
      if (ch === "_" && !(i > 0 && i < chars.length - 1 && ALNUM.test(chars[i - 1]) && ALNUM.test(chars[i + 1]))) return "\\_";
      if (ch === "&" && entities.has(i)) return "\\&";
      return ch;
    })
    .join("");
}

const AUTOLINK = /@|:\/\/|www\./iu;

/**
 * Wikilink `[[ruta\|texto]]`. Con `[`, `]` (o `|` en la ruta), o algo que GFM convierte en autoenlace (`@`, `://`,
 * `www.`), el wikilink no se reconocería: texto plano, sin enlace.
 */
function link(path: string, label: string): string {
  if (/[[\]]/u.test(path + label) || path.includes("|") || AUTOLINK.test(path + label)) return flat(label);
  return `[[${escapeInline(path)}\\|${escapeInline(flat(label)).replace(/\|/g, "\\|")}]]`;
}

const item = (target: string, parts: string[]): string => (parts.length ? `- ${target} — ${parts.join(" · ")}` : `- ${target}`);

/** Lo que lista un INDICE: la carpeta, su enlace de navegación, las subcarpetas y los documentos, ya ordenados. */
export interface IndexModel {
  title: string;
  /** Enlace a la carpeta de arriba (`path` es el de su INDICE); `null` en la raíz. */
  parent: { path: string; label: string } | null;
  subfolders: { name: string; path: string; fm: Record<string, unknown> }[];
  documents: { path: string; title: string; fm: Record<string, unknown> }[];
}

export function indexModel(vaultName: string, folder: string, notes: readonly IndexNote[]): IndexModel {
  const byPath = new Map(notes.map((note) => [note.path, note.frontmatter ?? {}]));
  const prefix = folder ? `${folder}/` : "";
  let parent: IndexModel["parent"] = null;
  if (folder) {
    const up = folder.split("/").slice(0, -1).join("/");
    parent = { path: (up ? `${up}/` : "") + INDEX_NAME, label: up ? up.split("/").at(-1)! : vaultName };
  }
  const subfolders = new Set<string>();
  const documents: { path: string; base: string }[] = [];
  for (const path of byPath.keys()) {
    if (!path.startsWith(prefix)) continue;
    const parts = path.slice(prefix.length).split("/");
    if (parts.length > 1) subfolders.add(parts[0]);
    else if (!isIndexPath(path)) documents.push({ path, base: parts[0].slice(0, -3) });
  }
  return {
    title: folder ? folder.split("/").at(-1)! : vaultName,
    parent,
    subfolders: [...subfolders].sort((a, b) => byCodePoints(pathKey(a), pathKey(b))).map((name) => {
      const path = `${prefix}${name}/${INDEX_NAME}`;
      return { name, path, fm: byPath.get(path) ?? {} };
    }),
    documents: documents.sort((a, b) => byCodePoints(pathKey(a.base), pathKey(b.base))).map(({ path, base }) => {
      const fm = byPath.get(path)!;
      return { path, title: typeof fm.titulo === "string" && fm.titulo ? fm.titulo : base, fm };
    }),
  };
}

/** Líneas del cuerpo del INDICE de `folder` (`""` = raíz). `notes`: las notas vivas de la bóveda. */
export function indexBodyLines(vaultName: string, folder: string, notes: readonly IndexNote[], extra: readonly string[] = []): string[] {
  const model = indexModel(vaultName, folder, notes);
  const lines = [`# ${model.title}`];
  if (model.parent) lines.push("", "## Navegación", "", `- ${link(model.parent.path, model.parent.label)}`);
  lines.push("", "## Subcarpetas", "");
  if (model.subfolders.length) {
    for (const sub of model.subfolders) lines.push(item(link(sub.path, sub.name), meta(sub.fm, extra)));
  } else lines.push("_Sin subcarpetas._");
  lines.push("", "## Documentos", "");
  if (model.documents.length) {
    for (const doc of model.documents) lines.push(item(link(doc.path, doc.title), meta(doc.fm, extra)));
  } else lines.push("_Sin documentos._");
  return lines;
}

export const renderIndexBody = (vaultName: string, folder: string, notes: readonly IndexNote[], extra: readonly string[] = []): string =>
  indexBodyLines(vaultName, folder, notes, extra).join("\n") + "\n";
