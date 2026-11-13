import { describe, expect, it } from "vitest";
import { activeIndex, indentOf, pathMatches, readOutline, sameOutline } from "./outline";

function doc(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

describe("índice de encabezados", () => {
  it("lee solo los encabezados del cuerpo del documento, en orden y con su nivel; ignora los vacíos y los de fuera", () => {
    const root = doc(`
      <h2>Título de la vista</h2>
      <div class="milkdown-view"><h1 id="a">Uno</h1><p>texto</p><h3>  Tres  </h3><h2> </h2><blockquote><h2>Citado</h2></blockquote></div>`);
    const items = readOutline(root);
    expect(items.map((i) => [i.level, i.text])).toEqual([[1, "Uno"], [3, "Tres"], [2, "Citado"]]);
    expect(new Set(items.map((i) => i.key)).size).toBe(3); // las claves no se repiten aunque el texto sí
  });

  it("sameOutline distingue un índice igual de uno con el mismo texto pero nodos nuevos", () => {
    const root = doc('<div class="milkdown-view"><h2>A</h2><h2>B</h2></div>');
    const first = readOutline(root);
    expect(sameOutline(first, readOutline(root))).toBe(true);
    root.querySelector("h2")!.replaceWith(Object.assign(document.createElement("h2"), { textContent: "A" })); // se vuelve a dibujar el nodo
    expect(sameOutline(first, readOutline(root))).toBe(false);
    expect(sameOutline(first, first.slice(1))).toBe(false);
  });

  it("la sangría es relativa al encabezado más alto: un documento que empieza en h2 no sale sangrado", () => {
    const items = readOutline(doc('<div class="milkdown-view"><h2>A</h2><h3>B</h3><h4>C</h4></div>'));
    expect(items.map((i) => indentOf(items, i))).toEqual([0, 1, 2]);
  });

  it("el encabezado vigente es el último que ya llegó a la parte alta; antes de llegar a ninguno, el primero", () => {
    expect(activeIndex([300, 600, 900], 0)).toBe(0);
    expect(activeIndex([-500, 20, 400], 0)).toBe(1);
    expect(activeIndex([-500, -300, -10], 0)).toBe(2);
    expect(activeIndex([], 0)).toBe(0);
  });

  it("una tarea está ligada al documento cuando su ruta es la de este, sin distinguir barras al borde ni mayúsculas", () => {
    expect(pathMatches("Proyectos/Plan.md", "Proyectos/Plan.md")).toBe(true);
    expect(pathMatches("/Proyectos/plan.MD/", "Proyectos/Plan.md")).toBe(true);
    expect(pathMatches("Proyectos", "Proyectos/Plan.md")).toBe(false); // una carpeta no es el documento
    expect(pathMatches(null, "Plan.md")).toBe(false);
    expect(pathMatches("Plan.md", null)).toBe(false);
  });
});
