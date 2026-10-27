// RF-012: nombre por omisión de una nota creada sin título.
import { nameKey } from "../sync/vaultRules";
import { nextUntitledPath } from "./untitled";

const keys = (...paths: string[]) => new Set(paths.map(nameKey));

describe("RF-012: nextUntitledPath", () => {
  it("la primera nota sin título es «Sin título.md»", () => {
    expect(nextUntitledPath(new Set())).toBe("Sin título.md");
  });

  it("con «Sin título.md» ocupado sigue «Sin título 2.md»", () => {
    expect(nextUntitledPath(keys("Sin título.md"))).toBe("Sin título 2.md");
  });

  it("elige el menor hueco libre desde 2", () => {
    expect(nextUntitledPath(keys("Sin título.md", "Sin título 2.md", "Sin título 4.md"))).toBe("Sin título 3.md");
  });

  it("no se deja engañar por otros nombres ni carpetas", () => {
    expect(nextUntitledPath(keys("Otra.md", "dir/Sin título.md"))).toBe("Sin título.md");
  });

  it("compara por pathKey: mayúsculas y anchura completa cuentan como ocupado", () => {
    expect(nextUntitledPath(keys("SIN TÍTULO.MD"))).toBe("Sin título 2.md");
    expect(nextUntitledPath(keys("Ｓin título.md", "sin título 2.md"))).toBe("Sin título 3.md");
  });

  // SPEC-0010 RF-001/RF-003: el nombre libre se busca POR CARPETA.
  it("en una carpeta usa «Carpeta/Sin título.md» y cuenta sólo las de esa carpeta", () => {
    expect(nextUntitledPath(new Set(), "Proyectos")).toBe("Proyectos/Sin título.md");
    // «Sin título.md» en la raíz no ocupa el de la carpeta.
    expect(nextUntitledPath(keys("Sin título.md"), "Proyectos")).toBe("Proyectos/Sin título.md");
    expect(nextUntitledPath(keys("Proyectos/Sin título.md"), "Proyectos")).toBe("Proyectos/Sin título 2.md");
  });
});
