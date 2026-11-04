// H-031: todo enlace que genera un INDICE lleva exactamente a la nota que nombra (ruta completa), sin importar
// el orden de la lista, los homónimos de otras carpetas ni los caracteres del nombre. Se parsea con el mismo
// procesador de Markdown que el editor (`createParseProcessor`) y se resuelve con `resolveWikiLink`.
import { describe, expect, it } from "vitest";
import { splitWikiLinks, resolveWikiLink, type NoteRef } from "../editor/wikilink";
import { createParseProcessor } from "../editor/markdown/parseStage";
import { indexBodyLines } from "./indexBody";
import { INDEX_NAME, folderOf } from "./indexRules";

type Node = { type: string; value?: string; children?: Node[] };

/** Destinos de los wikilinks que el editor reconocería en `line` (texto fuera de código, como el transformador). */
function wikiTargets(line: string): string[] {
  const out: string[] = [];
  const walk = (node: Node) => {
    if (node.type === "text" && node.value !== undefined) {
      for (const seg of splitWikiLinks(node.value)) if (seg.type === "wiki") out.push(seg.target);
    } else node.children?.forEach(walk);
  };
  walk(createParseProcessor().parse(line) as Node);
  return out;
}

const DOCS = [
  "INDICE.md",
  "README.md",
  "Plan.md",
  "00 - AG - SKILLS/skill-bovedas-synapse.md",
  "00 - AG - SKILLS/Plan.md",
  "1 - Proyectos AIRA/1 - Arquitecturas/Plan.md",
  "1 - Proyectos AIRA/5 - Proyectos/1  - AI Solutions/Synapse/README.md",
  "1 - Proyectos AIRA/5 - Proyectos/README.md",
  "Año nuevo/ÍNDICE.md",
  "Año nuevo/Plan.md",
  "Posts/LinkedIn/Plan.md",
  "Posts/Portafolio/Plan.md",
  // Nombres reales de producción y otros con caracteres que el Markdown interpreta.
  "Apache Spark & Big Data/Conceptos/Hadoop MapReduce.md",
  "Temas/2.3 Módulo `collections` de la Biblioteca Estándar.md",
  "ESTÁNDAR_CONTENIDO.md",
  "_privada_/_x_.md",
  "Notas/negrita **x** y *y*.md",
  "Notas/tachado ~~z~~.md",
  "Notas/entidad &amp; &copy; y &#169;.md",
  "Notas/html <b>x</b> y <http://a.b>.md",
  "Notas/barra \\ invertida.md",
  "Notas/C# & Go.md",
  "Notas/www.ejemplo.com.md",
  "Notas/correo a@b.co.md",
  "Notas/Tarea [x].md",
  "Notas/a | b.md",
];

/** Notas de la bóveda: los documentos y un INDICE.md por cada carpeta (y la raíz), como en producción. */
function vault(): { path: string; frontmatter?: Record<string, unknown> }[] {
  const paths = new Set(DOCS);
  for (const doc of DOCS) {
    let folder = folderOf(doc);
    for (;;) {
      paths.add(folder ? `${folder}/${INDEX_NAME}` : INDEX_NAME);
      if (!folder) break;
      folder = folderOf(folder);
    }
  }
  // El título de un documento puede traer una URL aunque su nombre de archivo no pueda (`/` separa carpetas).
  return [...[...paths].map((path) => ({ path })), { path: "Notas/titulada.md", frontmatter: { titulo: "ver http://ejemplo.com/a" } }];
}

function foldersOf(notes: { path: string }[]): string[] {
  const folders = new Set<string>([""]);
  for (const { path } of notes) for (let f = folderOf(path); f; f = folderOf(f)) folders.add(f);
  return [...folders];
}

describe("enlaces de los INDICES", () => {
  const notes = vault();
  const orders: [string, typeof notes][] = [
    ["orden original", notes],
    ["orden inverso", [...notes].reverse()],
    ["orden alfabético", [...notes].sort((a, b) => a.path.localeCompare(b.path, "es"))],
  ];

  for (const [label, ordered] of orders) {
    it(`cada enlace de cada INDICE resuelve a la nota de su ruta (${label})`, () => {
      const refs: NoteRef[] = ordered.map((n, i) => ({ id: `n${i}`, path: n.path }));
      const byId = new Map(refs.map((r) => [r.id, r.path]));
      let linked = 0;
      for (const folder of foldersOf(notes)) {
        for (const line of indexBodyLines("Proyectos", folder, notes)) {
          if (!line.startsWith("- [[")) continue;
          const targets = wikiTargets(line);
          const where = `en el INDICE de «${folder || "raíz"}», la línea ${line}`;
          expect(targets, where).toHaveLength(1);
          expect(byId.get(resolveWikiLink(targets[0], refs) ?? ""), where).toBe(targets[0]);
          linked++;
        }
      }
      expect(linked).toBeGreaterThan(50);
    });
  }

  it("los nombres que el Markdown no deja enlazar (`[`, `]`, `|`, `@`, `://`, `www.`) salen como texto, sin enlace roto", () => {
    const lines = indexBodyLines("Proyectos", "Notas", notes);
    for (const name of ["Tarea [x]", "a | b", "correo a@b.co", "ver http://ejemplo.com/a", "www.ejemplo.com"]) {
      const line = lines.find((l) => l.includes(name));
      expect(line, name).toBe(`- ${name}`);
      expect(wikiTargets(line!)).toEqual([]);
    }
  });

  it("el enlace de navegación de una carpeta lleva al INDICE de su carpeta padre, no a un hermano", () => {
    const refs: NoteRef[] = [...notes].reverse().map((n, i) => ({ id: `n${i}`, path: n.path }));
    const byId = new Map(refs.map((r) => [r.id, r.path]));
    for (const folder of foldersOf(notes).filter(Boolean)) {
      const lines = indexBodyLines("Proyectos", folder, notes);
      const nav = lines[lines.indexOf("## Navegación") + 2];
      const parent = folderOf(folder);
      expect(byId.get(resolveWikiLink(wikiTargets(nav)[0], refs) ?? ""), `Navegación de «${folder}»`).toBe(parent ? `${parent}/${INDEX_NAME}` : INDEX_NAME);
    }
  });
});
