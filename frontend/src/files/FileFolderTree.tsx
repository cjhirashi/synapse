/**
 * Árbol de carpetas de los archivos de una bóveda (H-046). Mismas filas y mismo menú ⋮ que el árbol de notas
 * (`.note-tree-*`): carpetas con subniveles, raíz arriba, y arrastrar y soltar para mover archivos y carpetas.
 */
import { useEffect, useMemo, useState, type CSSProperties, type DragEvent } from "react";
import { ChevronDown, ChevronRight, Folder, FolderOpen, House } from "lucide-react";
import { TreeRowMenu } from "../notes/TreeRowMenu";
import { ancestorsOf, buildFolderTree, type FolderNode } from "./fileFolderTree";
import "../notes/notes.css";

export const DRAG_FILE = "application/x-synapse-file";
export const DRAG_FOLDER = "application/x-synapse-file-folder";

interface Props {
  folders: string[];
  /** Carpeta abierta ("" = raíz). */
  selected: string;
  onSelect: (path: string) => void;
  onDropFile: (fileId: string, destination: string) => void;
  onDropFolder: (path: string, destination: string) => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
}

export function FileFolderTree({ folders, selected, onSelect, onDropFile, onDropFolder, onRename, onDelete }: Props) {
  const tree = useMemo(() => buildFolderTree(folders), [folders]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(ancestorsOf(selected)));
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // Al abrir una carpeta (por ejemplo tras crearla) se despliegan sus ancestras.
  useEffect(() => {
    const parents = ancestorsOf(selected);
    if (parents.some((p) => !expanded.has(p))) setExpanded((prev) => new Set([...prev, ...parents]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  function toggle(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  }

  const accepts = (event: DragEvent) => event.dataTransfer.types.includes(DRAG_FILE) || event.dataTransfer.types.includes(DRAG_FOLDER);

  const target = (destination: string) => ({
    "data-drop-target": dropTarget === destination ? "true" : undefined,
    onDragOver: (event: DragEvent) => {
      if (!accepts(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDropTarget(destination);
    },
    onDragLeave: () => setDropTarget((current) => (current === destination ? null : current)),
    onDrop: (event: DragEvent) => {
      if (!accepts(event)) return;
      event.preventDefault();
      setDropTarget(null);
      const file = event.dataTransfer.getData(DRAG_FILE);
      const folder = event.dataTransfer.getData(DRAG_FOLDER);
      if (file) onDropFile(file, destination);
      else if (folder) onDropFolder(folder, destination);
    },
  });

  function renderNodes(nodes: FolderNode[], depth: number) {
    return nodes.map((node) => {
      const open = expanded.has(node.path);
      const indent = { "--depth": depth } as CSSProperties;
      return (
        <li key={node.path}>
          <div className="note-tree-line">
            <button
              type="button"
              className="note-tree-row note-tree-folder"
              style={indent}
              aria-expanded={node.children.length > 0 ? open : undefined}
              aria-current={selected === node.path ? "true" : undefined}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(DRAG_FOLDER, node.path);
                event.dataTransfer.effectAllowed = "move";
              }}
              onClick={() => {
                if (node.children.length > 0) toggle(node.path);
                onSelect(node.path);
              }}
              {...target(node.path)}
            >
              {node.children.length === 0 ? (
                <span style={{ width: 12 }} aria-hidden="true" />
              ) : open ? (
                <ChevronDown size={12} aria-hidden="true" />
              ) : (
                <ChevronRight size={12} aria-hidden="true" />
              )}
              {open ? (
                <FolderOpen size={13} aria-hidden="true" className="note-tree-icon-folder" />
              ) : (
                <Folder size={13} aria-hidden="true" className="note-tree-icon-folder" />
              )}
              <span className="note-tree-name" title={node.path}>{node.name}</span>
            </button>
            <TreeRowMenu label={node.name} onRename={() => onRename(node.path)} onDelete={() => onDelete(node.path)} />
          </div>
          {open && node.children.length > 0 && <ul className="note-tree-group">{renderNodes(node.children, depth + 1)}</ul>}
        </li>
      );
    });
  }

  return (
    <div className="note-tree-panel files-tree-panel">
      <ul className="note-tree" aria-label="Carpetas de archivos">
        <li>
          <div className="note-tree-line">
            <button
              type="button"
              className="note-tree-row note-tree-folder note-tree-root"
              style={{ "--depth": 0 } as CSSProperties}
              aria-current={selected === "" ? "true" : undefined}
              onClick={() => onSelect("")}
              {...target("")}
            >
              <House size={14} aria-hidden="true" className="note-tree-icon-root" />
              <span className="note-tree-name">Raíz</span>
            </button>
          </div>
        </li>
        {renderNodes(tree, 0)}
      </ul>
    </div>
  );
}
