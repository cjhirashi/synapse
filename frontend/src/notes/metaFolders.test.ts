// H-030: la sección META agrupa las carpetas reservadas de la raíz encima de «Raíz».
import { isMetaFolderPath, META_FOLDERS, splitMeta } from "./metaFolders";
import { buildTree } from "./noteTree";

const note = (path: string) => ({ id: `note:v:${path}`, path });
const names = (nodes: { name: string }[]) => nodes.map((n) => n.name);

describe("H-030: isMetaFolderPath", () => {
  it("reconoce las cinco carpetas reservadas, sin distinguir mayúsculas ni anchos de carácter (NFKC + casefold)", () => {
    for (const name of META_FOLDERS) expect(isMetaFolderPath(name)).toBe(true);
    expect(isMetaFolderPath("ag - skills")).toBe(true);
    expect(isMetaFolderPath("Plantillas")).toBe(true);
    expect(isMetaFolderPath("ＢＩＴＡＣＯＲＡ")).toBe(true);
  });

  it("sólo vale la carpeta de la raíz exacta: una subcarpeta con ese nombre, un prefijo o una variante no", () => {
    expect(isMetaFolderPath("Proyectos/PLANTILLAS")).toBe(false);
    expect(isMetaFolderPath("AG - SKILLS/aira")).toBe(false);
    expect(isMetaFolderPath("AG - SKILLS-2")).toBe(false);
    expect(isMetaFolderPath("AG - SKILL")).toBe(false);
    expect(isMetaFolderPath("")).toBe(false);
  });
});

describe("H-030: splitMeta", () => {
  it("saca las carpetas reservadas del árbol en el orden de META y deja el resto como estaba", () => {
    const tree = buildTree([
      note("PLANTILLAS/plantilla-a.md"),
      note("Zeta/z.md"),
      note("AG - AGENTES/aira.md"),
      note("AG - SKILLS/skill-x.md"),
      note("BITACORA/2026-11/dia.md"),
      note("AG - MENSAJES/aira/x.md"),
      note("Inicio.md"),
      note("Ideas/i.md"),
    ]);
    const { meta, rest } = splitMeta(tree);
    expect(names(meta)).toEqual(["AG - SKILLS", "AG - MENSAJES", "AG - AGENTES", "BITACORA", "PLANTILLAS"]);
    expect(names(rest)).toEqual(["Ideas", "Zeta", "Inicio"]);
  });

  it("conserva los hijos de cada carpeta reservada", () => {
    const { meta } = splitMeta(buildTree([note("AG - SKILLS/aira/skill-a.md"), note("AG - SKILLS/skill-b.md")]));
    expect(names(meta[0].children)).toEqual(["aira", "skill-b"]);
  });

  it("una nota suelta que se llama como una carpeta reservada (BITACORA.md) se queda en la raíz", () => {
    const { meta, rest } = splitMeta(buildTree([note("BITACORA.md"), note("PLANTILLAS.md")]));
    expect(meta).toEqual([]);
    expect(names(rest)).toEqual(["BITACORA", "PLANTILLAS"]);
  });

  it("sin carpetas reservadas, META queda vacía y el árbol no cambia", () => {
    const tree = buildTree([note("a/b.md"), note("c.md")]);
    const { meta, rest } = splitMeta(tree);
    expect(meta).toEqual([]);
    expect(rest).toEqual(tree);
  });

  it("la carpeta «Plantillas» que ya existía en una bóveda es la reservada: pasa a META", () => {
    const { meta, rest } = splitMeta(buildTree([note("Plantillas/base.md"), note("Otra/x.md")]));
    expect(names(meta)).toEqual(["Plantillas"]);
    expect(names(rest)).toEqual(["Otra"]);
  });
});
