import { describe, expect, it } from "vitest";
import { ancestorsOf, baseName, buildFolderTree, folderNameError, isInside, joinPath, parentOf } from "./fileFolderTree";

describe("fileFolderTree", () => {
  it("arma el árbol con subniveles, ordenado sin distinguir mayúsculas", () => {
    const tree = buildFolderTree(["b", "A", "A/y", "A/x", "A/x/z"]);
    expect(tree.map((n) => n.name)).toEqual(["A", "b"]);
    expect(tree[0].children.map((n) => n.name)).toEqual(["x", "y"]);
    expect(tree[0].children[0].children[0].path).toBe("A/x/z");
  });

  it("ignora la raíz y repetidos, y cuelga cada ruta de su padre aunque llegue desordenada", () => {
    const tree = buildFolderTree(["a/b", "", "a", "a"]);
    expect(tree).toHaveLength(1);
    expect(tree[0].children.map((n) => n.path)).toEqual(["a/b"]);
  });

  it("utilidades de ruta", () => {
    expect(baseName("a/b/c")).toBe("c");
    expect(parentOf("a/b/c")).toBe("a/b");
    expect(parentOf("a")).toBe("");
    expect(joinPath("", "a")).toBe("a");
    expect(joinPath("a", "b")).toBe("a/b");
    expect(ancestorsOf("a/b/c")).toEqual(["a", "a/b"]);
    expect(ancestorsOf("a")).toEqual([]);
  });

  it("isInside no confunde prefijos de nombre con carpetas", () => {
    expect(isInside("a/b", "a")).toBe(true);
    expect(isInside("a", "a")).toBe(true);
    expect(isInside("ab", "a")).toBe(false);
  });

  it("valida el nombre de un nivel", () => {
    expect(folderNameError("Mis fotos")).toBeNull();
    expect(folderNameError("  ")).not.toBeNull();
    expect(folderNameError("a/b")).not.toBeNull();
    expect(folderNameError("..")).not.toBeNull();
    expect(folderNameError("x".repeat(65))).not.toBeNull();
  });
});
