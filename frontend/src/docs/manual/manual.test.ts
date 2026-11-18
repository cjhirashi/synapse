// H-061: el manifiesto y los capítulos empaquetados del Manual de Operación van de la mano.
import { expect, test } from "vitest";
import { chapters, forScreen, loadChapter } from ".";

test("hay 14 capítulos con slug único y numerados en orden", () => {
  expect(chapters).toHaveLength(14);
  expect(new Set(chapters.map((chapter) => chapter.slug)).size).toBe(14);
  chapters.forEach((chapter, i) => expect(chapter.slug.startsWith(String(i + 1).padStart(2, "0") + "-")).toBe(true));
});

test("cada capítulo tiene su Markdown listo para pantalla: atributos resueltos, sin marcas del PDF", async () => {
  for (const chapter of chapters) {
    const text = await loadChapter(chapter.slug);
    expect(text, chapter.slug).toContain("# Manual de Operación - Synapse");
    expect(text, chapter.slug).toContain("**Autor:** Carlos Jiménez");
    expect(text, chapter.slug).toContain("**Responsable:** Aira");
    expect(text, chapter.slug).not.toMatch(/(^|[^`])\{\{atributo:(autor|programa|responsable)\}\}/);
    expect(text, chapter.slug).not.toMatch(/<!--\s*\/?pdf:/);
    expect(text, chapter.slug).not.toContain("&nbsp;");
  }
});

test("un capítulo que no existe devuelve null", async () => {
  expect(await loadChapter("99-no-existe")).toBeNull();
});

test("forScreen quita las marcas del PDF y los espaciadores, y deja el resto igual", () => {
  const source = "<!-- pdf:portada -->\n\n# Título\n\n&nbsp;\n\n&nbsp;\n\n**Autor:** {{atributo:autor}} {{atributo:otro}}\n\n<!-- /pdf:portada -->\n\n<!-- pdf:indice -->\n\n## Qué aprenderás\n";
  expect(forScreen(source, { autor: "Ana" })).toBe("\n# Título\n\n**Autor:** Ana {{atributo:otro}}\n\n\n## Qué aprenderás\n".replace(/\n{3,}/g, "\n\n"));
});

test("forScreen no resuelve campos dentro de código: la sintaxis se puede explicar", () => {
  expect(forScreen("Escribe `{{atributo:autor}}` y verás {{atributo:autor}}.", { autor: "Ana" })).toBe("Escribe `{{atributo:autor}}` y verás Ana.");
});
