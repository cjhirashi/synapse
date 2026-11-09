/**
 * Árbol de carpetas de archivos a partir de las rutas que devuelve el servidor (H-046).
 * Funciones puras: las rutas llevan `/` entre niveles; la raíz es la cadena vacía.
 */
export interface FolderNode {
  name: string;
  /** Ruta completa (`a/b`): clave estable para plegar y seleccionar. */
  path: string;
  children: FolderNode[];
}

const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function parentOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

export function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

/** `a/b/c` → [`a`, `a/b`]: las carpetas que hay que abrir para ver `c`. */
export function ancestorsOf(path: string): string[] {
  const levels = path.split("/").slice(0, -1);
  return levels.map((_, i) => levels.slice(0, i + 1).join("/"));
}

/** ¿Está `path` dentro de `folder` (o es la misma)? Para impedir mover una carpeta dentro de sí misma. */
export function isInside(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}

export function buildFolderTree(paths: string[]): FolderNode[] {
  const root: FolderNode[] = [];
  const byPath = new Map<string, FolderNode>();
  for (const path of [...new Set(paths)].filter(Boolean).sort((a, b) => a.split("/").length - b.split("/").length)) {
    const node: FolderNode = { name: baseName(path), path, children: [] };
    byPath.set(path, node);
    (byPath.get(parentOf(path))?.children ?? root).push(node);
  }
  const sort = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => collator.compare(a.name, b.name));
    nodes.forEach((n) => sort(n.children));
  };
  sort(root);
  return root;
}

/** Mensaje de error para el nombre de un nivel de carpeta, o `null` si es válido (mismas reglas que el servidor). */
export function folderNameError(name: string): string | null {
  const clean = name.trim();
  if (!clean) return "Escribe un nombre.";
  if (clean.length > 64) return "Máximo 64 caracteres.";
  if (/[\\/\x00-\x1f\x7f]/.test(clean)) return "No puede llevar / ni \\.";
  if (clean === "." || clean === "..") return "Ese nombre no está permitido.";
  return null;
}
