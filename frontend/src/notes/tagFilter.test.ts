import { describe, expect, it } from "vitest";
import type { NoteSummary } from "./noteStore";
import { countTags, filterByTags, searchTags, taggedNotes } from "./tagFilter";

function summary(path: string, frontmatter: Record<string, unknown> | undefined, deleted = false): NoteSummary {
  return { id: path, path, rev: "1", updated_at: "2026-11-10T00:00:00Z", deleted_at: deleted ? "2026-11-10T00:00:00Z" : null, size: 1, frontmatter };
}

const notes = taggedNotes([
  summary("B/Dos.md", { tags: ["trabajo", "tr26"] }),
  summary("A/Uno.md", { titulo: "Primero", tags: ["trabajo"] }),
  summary("C/Tres.md", { tags: ["personal"] }),
  summary("D/Sin.md", undefined),
  summary("E/Borrada.md", { tags: ["trabajo"] }, true),
]);

describe("taggedNotes", () => {
  it("omite las borradas, ordena por ruta y toma el título del atributo o del archivo", () => {
    expect(notes.map((n) => [n.path, n.title])).toEqual([
      ["A/Uno.md", "Primero"],
      ["B/Dos.md", "Dos"],
      ["C/Tres.md", "Tres"],
      ["D/Sin.md", "Sin"],
    ]);
  });

  it("ignora tags que no son texto", () => {
    expect(taggedNotes([summary("X.md", { tags: ["ok", 3, null] })])[0].tags).toEqual(["ok"]);
  });
});

describe("countTags", () => {
  it("cuenta las notas por tag en orden alfabético", () => {
    expect(countTags(notes)).toEqual([
      { tag: "personal", count: 1 },
      { tag: "tr26", count: 1 },
      { tag: "trabajo", count: 2 },
    ]);
  });
});

describe("filterByTags", () => {
  it("sin tags elegidos no devuelve nada", () => {
    expect(filterByTags(notes, [])).toEqual([]);
  });

  it("con un tag devuelve las notas que lo llevan", () => {
    expect(filterByTags(notes, ["trabajo"]).map((n) => n.path)).toEqual(["A/Uno.md", "B/Dos.md"]);
  });

  it("con varios tags exige todos (Y)", () => {
    expect(filterByTags(notes, ["trabajo", "tr26"]).map((n) => n.path)).toEqual(["B/Dos.md"]);
    expect(filterByTags(notes, ["trabajo", "personal"])).toEqual([]);
  });
});

describe("searchTags", () => {
  const tags = [
    { tag: "filosofía-masónica", count: 1 },
    { tag: "biblioteca", count: 121 },
    { tag: "Bitácora", count: 3 },
    { tag: "bitácora", count: 2 },
  ];

  it("sin texto devuelve todos", () => {
    expect(searchTags(tags, "  ")).toEqual(tags);
  });

  it("coincide con una parte del nombre, sin distinguir mayúsculas ni acentos", () => {
    expect(searchTags(tags, "BITACO").map((t) => t.tag)).toEqual(["Bitácora", "bitácora"]);
    expect(searchTags(tags, "mason").map((t) => t.tag)).toEqual(["filosofía-masónica"]);
  });

  it("con la palabra exacta devuelve ese tag", () => {
    expect(searchTags(tags, "biblioteca")).toEqual([{ tag: "biblioteca", count: 121 }]);
  });

  it("sin coincidencias devuelve vacío", () => {
    expect(searchTags(tags, "zzz")).toEqual([]);
  });
});
