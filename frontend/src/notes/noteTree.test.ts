// RF-001, RF-019: la sidebar muestra las notas de la bóveda como árbol según su `path`.
import { buildTree, type TreeNode } from "./noteTree";

const note = (path: string) => ({ id: `note:v:${path}`, path });
const names = (nodes: TreeNode<{ id: string; path: string }>[]) => nodes.map((n) => `${n.kind}:${n.name}`);

describe("RF-019: buildTree", () => {
  it("anida por prefijos de ruta sin aplanar", () => {
    const tree = buildTree([note("a/b/c.md"), note("a/d.md")]);
    expect(names(tree)).toEqual(["folder:a"]);
    const a = tree[0];
    if (a.kind !== "folder") throw new Error("a debe ser carpeta");
    expect(a.path).toBe("a");
    expect(names(a.children)).toEqual(["folder:b", "note:d"]);
    const b = a.children[0];
    if (b.kind !== "folder") throw new Error("b debe ser carpeta");
    expect(b.path).toBe("a/b");
    expect(names(b.children)).toEqual(["note:c"]);
  });

  it("pone las carpetas antes que las notas en cada nivel", () => {
    const tree = buildTree([note("a.md"), note("z/x.md"), note("b.md")]);
    expect(names(tree)).toEqual(["folder:z", "note:a", "note:b"]);
  });

  it("ordena en español, numérico y sin distinguir mayúsculas ni acentos", () => {
    const tree = buildTree([note("nota 10.md"), note("Nota 2.md"), note("ñu.md"), note("Ábaco.md"), note("zeta.md")]);
    expect(names(tree)).toEqual(["note:Ábaco", "note:Nota 2", "note:nota 10", "note:ñu", "note:zeta"]);
  });

  it("muestra el nombre sin la extensión .md (cualquier mayúscula) y conserva la nota", () => {
    const [first, second] = buildTree([note("Uno.MD"), note("dos.txt")]);
    expect(first).toMatchObject({ kind: "note", name: "dos.txt" });
    expect(second).toMatchObject({ kind: "note", name: "Uno" });
    if (second.kind === "note") expect(second.note.id).toBe("note:v:Uno.MD");
  });

  it("una carpeta sin notas no existe y sin notas el árbol está vacío", () => {
    expect(buildTree([])).toEqual([]);
  });

  it("carpeta y nota con el mismo nombre conviven", () => {
    const tree = buildTree([note("a.md"), note("a/b.md")]);
    expect(names(tree)).toEqual(["folder:a", "note:a"]);
  });
});
