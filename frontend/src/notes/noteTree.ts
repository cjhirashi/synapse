/**
 * Árbol de la sidebar a partir de las rutas de las notas (SPEC-0008 RF-001, RF-019).
 *
 * Función pura. Las carpetas son los prefijos de `path` partidos por `/` (segmentos exactos,
 * sin aplanar); en cada nivel van primero las carpetas y después las notas, ambas en orden
 * `es` numérico y sin distinguir mayúsculas ni acentos. Una carpeta existe sólo mientras
 * tenga alguna nota dentro (no hay carpetas vacías: no se guardan, se derivan).
 */

export interface FolderNode<T> {
  kind: "folder";
  /** Nombre del segmento. */
  name: string;
  /** Ruta completa de la carpeta (`a/b`), clave estable para plegar/desplegar. */
  path: string;
  children: TreeNode<T>[];
}

export interface NoteNode<T> {
  kind: "note";
  /** Nombre visible: el último segmento sin `.md`. */
  name: string;
  note: T;
}

export type TreeNode<T> = FolderNode<T> | NoteNode<T>;

const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

/** Nombre sin la extensión `.md` (sin distinguir mayúsculas, como al crear: PLAN-0008 §2.6). */
function displayName(segment: string): string {
  return segment.replace(/\.md$/i, "");
}

function byName(a: TreeNode<unknown>, b: TreeNode<unknown>): number {
  if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
  return collator.compare(a.name, b.name);
}

function sortTree<T>(nodes: TreeNode<T>[]): void {
  nodes.sort(byName);
  for (const node of nodes) if (node.kind === "folder") sortTree(node.children);
}

export function buildTree<T extends { path: string }>(notes: T[]): TreeNode<T>[] {
  const root: TreeNode<T>[] = [];
  /** Carpetas ya creadas, por ruta completa. */
  const folders = new Map<string, FolderNode<T>>();

  for (const note of notes) {
    const segments = note.path.split("/");
    const file = segments.pop() as string;
    let siblings = root;
    let prefix = "";
    for (const segment of segments) {
      prefix = prefix ? `${prefix}/${segment}` : segment;
      let folder = folders.get(prefix);
      if (!folder) {
        folder = { kind: "folder", name: segment, path: prefix, children: [] };
        folders.set(prefix, folder);
        siblings.push(folder);
      }
      siblings = folder.children;
    }
    siblings.push({ kind: "note", name: displayName(file), note });
  }

  sortTree(root);
  return root;
}
