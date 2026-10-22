/**
 * Sidebar de la bóveda abierta: árbol de notas, "Nueva nota", renombrar/mover, borrar y
 * enlace a la papelera (SPEC-0008 RF-003, RF-010…RF-013, RF-019; PLAN-0008 §2.6).
 *
 * Lee sólo los resúmenes (`noteStore.list`, sin `content`) y los vuelve a leer cuando cambia
 * `notesVersion` (escrituras propias, del pull o de otra pestaña). Las carpetas salen de los
 * prefijos de `path` (`buildTree`) y empiezan plegadas; la que contiene la nota abierta se
 * despliega sola. Un renombrado edita la ruta completa: así también se mueve de carpeta.
 *
 * Accesibilidad: `role="tree"`; cada fila es un botón `treeitem` (Enter/Espacio) y sus
 * acciones son botones propios fuera del `treeitem`, con el nombre de la nota en la etiqueta.
 */
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useSync } from "../sync/useSync";
import { noteErrorMessage } from "./messages";
import type { NoteSummary } from "./noteStore";
import { buildTree, type TreeNode } from "./noteTree";

interface NoteSidebarProps {
  vaultId: string;
  /** Nota abierta en el editor (se marca y se despliega su carpeta). */
  openId: string | null;
  /** Click en una nota: `onOpen(id)` (lectura). Al crear una nota: `onOpen(id, { edit: true })`. */
  onOpen: (id: string, options?: { edit: boolean }) => void;
  /** La nota se mandó a la papelera (el padre cierra el editor si era la abierta). */
  onDeleted: (id: string) => void;
  onShowTrash: () => void;
}

/** Carpetas que contienen a `path`: `a/b/c.md` → `a`, `a/b`. */
function ancestors(path: string): string[] {
  const segments = path.split("/").slice(0, -1);
  return segments.map((_, i) => segments.slice(0, i + 1).join("/"));
}

export default function NoteSidebar({ vaultId, openId, onOpen, onDeleted, onShowTrash }: NoteSidebarProps) {
  const { notes, notesVersion } = useSync();
  const [items, setItems] = useState<NoteSummary[] | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [title, setTitle] = useState("");
  /** Renombrado en curso: la nota (con la revisión que se mostraba) y la ruta escrita. */
  const [renaming, setRenaming] = useState<{ note: NoteSummary; path: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setItems(await notes.list(vaultId));
  }, [notes, vaultId]);

  useEffect(() => {
    let alive = true;
    void notes.list(vaultId).then((list) => {
      if (alive) setItems(list);
    });
    return () => {
      alive = false;
    };
  }, [notes, vaultId, notesVersion]);

  // La carpeta de la nota abierta se despliega (sin plegar las que el usuario abrió).
  useEffect(() => {
    const open = items?.find((item) => item.id === openId);
    if (open) setExpanded((prev) => new Set([...prev, ...ancestors(open.path)]));
  }, [items, openId]);

  const tree = useMemo(() => buildTree(items ?? []), [items]);

  function toggle(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  }

  /** Ejecuta una operación del almacén mostrando su error; `true` si salió bien. */
  async function run(operation: () => Promise<void>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await operation();
      return true;
    } catch (err) {
      setError(noteErrorMessage(err));
      // Una revisión desfasada o una nota que ya no existe: se muestra el estado real.
      void reload();
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const note = await notes.create(vaultId, title);
      setTitle("");
      await reload();
      onOpen(note.id, { edit: true });
    });
  }

  async function rename(event: FormEvent) {
    event.preventDefault();
    if (renaming === null) return;
    const ok = await run(async () => {
      await notes.rename(renaming.note.id, renaming.path, renaming.note.rev);
      await reload();
    });
    if (ok) setRenaming(null);
  }

  async function remove(note: NoteSummary) {
    const ok = await run(async () => {
      await notes.softDelete(note.id, note.rev);
      await reload();
    });
    if (ok) onDeleted(note.id);
  }

  function renderNodes(nodes: TreeNode<NoteSummary>[]) {
    return nodes.map((node) => {
      if (node.kind === "folder") {
        const open = expanded.has(node.path);
        return (
          <li key={`f:${node.path}`} role="none">
            <button
              type="button"
              role="treeitem"
              aria-expanded={open}
              className="note-tree-row note-tree-folder"
              onClick={() => toggle(node.path)}
            >
              {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
              {node.name}
            </button>
            {open && (
              <ul role="group" className="note-tree-group">
                {renderNodes(node.children)}
              </ul>
            )}
          </li>
        );
      }

      const note = node.note;
      if (renaming?.note.id === note.id) {
        return (
          <li key={note.id} role="none">
            <form className="note-tree-rename" onSubmit={rename}>
              <label>
                Ruta de la nota
                <input
                  value={renaming.path}
                  onChange={(event) => setRenaming({ note, path: event.target.value })}
                  autoFocus
                />
              </label>
              <button type="submit" disabled={busy}>
                Guardar ruta
              </button>
              <button type="button" onClick={() => setRenaming(null)}>
                Cancelar
              </button>
            </form>
          </li>
        );
      }
      return (
        <li key={note.id} role="none" className="note-tree-item">
          <button
            type="button"
            role="treeitem"
            aria-selected={note.id === openId}
            className="note-tree-row"
            onClick={() => onOpen(note.id)}
          >
            {node.name}
          </button>
          <span className="note-tree-actions">
            <button type="button" aria-label={`Renombrar «${node.name}»`} onClick={() => setRenaming({ note, path: note.path })}>
              Renombrar
            </button>
            <button type="button" aria-label={`Borrar «${node.name}»`} onClick={() => void remove(note)} disabled={busy}>
              Borrar
            </button>
          </span>
        </li>
      );
    });
  }

  return (
    <aside className="note-sidebar" aria-label="Notas de la bóveda">
      <form className="note-sidebar-new" onSubmit={create}>
        <label>
          Título de la nota nueva (opcional)
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <button type="submit" disabled={busy}>
          Nueva nota
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {items === null ? (
        <p>Cargando…</p>
      ) : items.length === 0 ? (
        <p>Esta bóveda aún no tiene notas.</p>
      ) : (
        <ul role="tree" aria-label="Notas" className="note-tree">
          {renderNodes(tree)}
        </ul>
      )}
      <button type="button" className="note-sidebar-trash" onClick={onShowTrash}>
        Papelera de la bóveda
      </button>
    </aside>
  );
}
