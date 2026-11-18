/**
 * Manual de Operación de Synapse, empaquetado con la app (H-061). Los capítulos son Markdown tal como están en la
 * bóveda Proyectos («Synapse › 11 - Manual de Operación»); `manifest.json` trae su título, su descripción, los atributos
 * que el cuerpo cita con `{{atributo:…}}` y la nota de origen. Cada capítulo se carga bajo demanda (chunk propio).
 */
import manifest from "./manifest.json";

export interface Chapter {
  slug: string;
  titulo: string;
  descripcion: string;
  autor: string;
  programa: string;
  responsable: string;
}

export const chapters: readonly Chapter[] = manifest.capitulos;

const sources = import.meta.glob<string>("./*.md", { query: "?raw", import: "default" });

/**
 * Las marcas de paginación del PDF (`<!-- pdf:portada -->`, `<!-- pdf:indice -->`, `<!-- pdf:salto -->`…) y los párrafos
 * `&nbsp;` que separan el título en la portada son del PDF: en pantalla el lector las mostraría como avisos del editor.
 */
export function forScreen(markdown: string, attributes: Record<string, string> = {}): string {
  // Un campo `{{atributo:x}}` se escribe con su valor (sin la marca punteada del editor); uno desconocido se deja como está.
  // El código (en línea o con cercas) no se toca: así los capítulos pueden explicar la sintaxis.
  const resolved = markdown
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/\{\{atributo:([^{}\s:]+)\}\}/g, (field, name: string) => attributes[name] ?? field)))
    .join("");
  return resolved
    .replace(/^<!--\s*\/?pdf:[a-z-]+\s*-->\n?/gm, "")
    .replace(/^&nbsp;\n+/gm, "")
    .replace(/\n{3,}/g, "\n\n");
}

/** Texto Markdown del capítulo listo para leer en pantalla, o `null` si el `slug` no existe. */
export async function loadChapter(slug: string): Promise<string | null> {
  const load = (sources as Record<string, (() => Promise<string>) | undefined>)[`./${slug}.md`];
  const chapter = chapters.find((item) => item.slug === slug);
  return load && chapter ? forScreen(await load(), chapterAttributes(chapter)) : null;
}

/** Los atributos que el cuerpo cita (`{{atributo:programa}}`…) salen del manifiesto, no del texto. */
function chapterAttributes(chapter: Chapter): Record<string, string> {
  return { autor: chapter.autor, programa: chapter.programa, responsable: chapter.responsable };
}
