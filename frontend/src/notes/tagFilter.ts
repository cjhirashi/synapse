import type { NoteSummary } from "./noteStore";

export interface TagCount {
  tag: string;
  count: number;
}

export interface TaggedNote {
  id: string;
  path: string;
  title: string;
  tags: string[];
}

function tagsOf(summary: NoteSummary): string[] {
  const value = summary.frontmatter?.tags;
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === "string") : [];
}

/** Título que se muestra de una nota: el atributo `titulo` o el nombre del archivo sin `.md`. */
function titleOf(summary: NoteSummary): string {
  const titulo = summary.frontmatter?.titulo;
  if (typeof titulo === "string" && titulo.trim() !== "") return titulo;
  return (summary.path.split("/").pop() ?? summary.path).replace(/\.md$/i, "");
}

/** Notas vivas de la bóveda con sus tags, ordenadas por ruta. */
export function taggedNotes(summaries: readonly NoteSummary[]): TaggedNote[] {
  return summaries
    .filter((summary) => summary.deleted_at === null)
    .map((summary) => ({ id: summary.id, path: summary.path, title: titleOf(summary), tags: tagsOf(summary) }))
    .sort((a, b) => a.path.localeCompare(b.path, "es"));
}

/** Todos los tags de la bóveda con el número de notas que los llevan, por orden alfabético. */
export function countTags(notes: readonly TaggedNote[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const note of notes) for (const tag of new Set(note.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => a.tag.localeCompare(b.tag, "es"));
}

/** Notas que tienen TODOS los tags elegidos; sin tags elegidos no devuelve ninguna. */
export function filterByTags(notes: readonly TaggedNote[], selected: readonly string[]): TaggedNote[] {
  if (selected.length === 0) return [];
  return notes.filter((note) => selected.every((tag) => note.tags.includes(tag)));
}

function fold(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Tags cuyo nombre contiene el texto (sin distinguir mayúsculas ni acentos); texto vacío = todos. */
export function searchTags(tags: readonly TagCount[], query: string): TagCount[] {
  const needle = fold(query.trim());
  return needle === "" ? [...tags] : tags.filter(({ tag }) => fold(tag).includes(needle));
}
