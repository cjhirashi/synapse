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
 * Teclado del patrón WAI-ARIA (VF-9) con *roving tabindex*: un solo `treeitem` tabulable;
 * ↑/↓ recorren los visibles, → abre la carpeta o baja a su primer hijo, ← la cierra o sube al
 * padre, Inicio/Fin saltan a los extremos.
 */
import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  /**
   * Antes de borrar la nota abierta: el editor decide si se puede descartar su borrador (VF-2).
   * Sin esta función se borra sin preguntar.
   */
  confirmDelete?: () => Promise<boolean>;
}

/** Carpetas que contienen a `path`: `a/b/c.md` → `a`, `a/b`. */
function ancestors(path: string): string[] {
  const segments = path.split("/").slice(0, -1);
  return segments.map((_, i) => segments.slice(0, i + 1).join("/"));
}

/** Fila visible del árbol, en orden de pantalla (lo que recorre el teclado). */
interface Row {
  /** `f:{ruta}` para carpetas, `n:{id}` para notas. */
  key: string;
  kind: "folder" | "note";
  /** Ruta de la carpeta (sólo carpetas). */
  path: string;
  /** Clave de la carpeta que la contiene (`null` en la raíz). */
  parent: string | null;
}

const folderKey = (path: string) => `f:${path}`;
const noteKey = (id: string) => `n:${id}`;

/** Filas visibles: las carpetas plegadas no muestran sus hijos. */
function visibleRows(nodes: TreeNode<NoteSummary>[], expanded: ReadonlySet<string>, parent: string | null = null): Row[] {
  return nodes.flatMap((node): Row[] => {
    if (node.kind === "note") return [{ key: noteKey(node.note.id), kind: "note", path: "", parent }];
    const key = folderKey(node.path);
    const self: Row = { key, kind: "folder", path: node.path, parent };
    return expanded.has(node.path) ? [self, ...visibleRows(node.children, expanded, key)] : [self];
  });
}

export default function NoteSidebar({ vaultId, openId, onOpen, onDeleted, onShowTrash, confirmDelete }: NoteSidebarProps) {
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
  const rows = useMemo(() => visibleRows(tree, expanded), [tree, expanded]);

  /** Fila con el foco del teclado (la única con `tabindex=0`); si desaparece, la primera. */
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const tabbable = rows.some((row) => row.key === focusKey) ? focusKey : (rows[0]?.key ?? null);
  const treeRef = useRef<HTMLUListElement>(null);

  /** Mueve el foco real a la fila `key` y la hace la tabulable. */
  function focusRow(key: string) {
    setFocusKey(key);
    const items = treeRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [];
    [...items].find((el) => el.dataset.key === key)?.focus();
  }

  function onTreeKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const key = (event.target as HTMLElement).closest<HTMLElement>('[role="treeitem"]')?.dataset.key;
    const index = rows.findIndex((row) => row.key === key);
    if (index < 0) return; // el teclado de un campo o de una acción no es del árbol
    const row = rows[index];
    const open = row.kind === "folder" && expanded.has(row.path);
    let target: string | undefined;
    switch (event.key) {
      case "ArrowDown":
        target = rows[index + 1]?.key;
        break;
      case "ArrowUp":
        target = rows[index - 1]?.key;
        break;
      case "Home":
        target = rows[0].key;
        break;
      case "End":
        target = rows[rows.length - 1].key;
        break;
      case "ArrowRight":
        if (row.kind !== "folder") return;
        if (!open) toggle(row.path);
        else target = rows[index + 1]?.parent === row.key ? rows[index + 1].key : undefined;
        break;
      case "ArrowLeft":
        if (open) toggle(row.path);
        else target = row.parent ?? undefined;
        break;
      default:
        return;
    }
    // Las flechas y Inicio/Fin no deben desplazar la página.
    event.preventDefault();
    if (target !== undefined) focusRow(target);
  }

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
    // Sólo la nota abierta tiene un borrador que perder.
    if (note.id === openId && confirmDelete && !(await confirmDelete())) return;
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
              data-key={folderKey(node.path)}
              tabIndex={tabbable === folderKey(node.path) ? 0 : -1}
              onFocus={() => setFocusKey(folderKey(node.path))}
              className="note-tree-row note-tree-folder"
              onClick={() => toggle(node.path)}
            >
              {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
              <span className="note-tree-name" title={node.name}>
                {node.name}
              </span>
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
            data-key={noteKey(note.id)}
            tabIndex={tabbable === noteKey(note.id) ? 0 : -1}
            onFocus={() => setFocusKey(noteKey(note.id))}
            className="note-tree-row"
            onClick={() => onOpen(note.id)}
          >
            <span className="note-tree-name" title={node.name}>
              {node.name}
            </span>
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
        <ul ref={treeRef} role="tree" aria-label="Notas" className="note-tree" onKeyDown={onTreeKeyDown}>
          {renderNodes(tree)}
        </ul>
      )}
      <button type="button" className="note-sidebar-trash" onClick={onShowTrash}>
        Papelera de la bóveda
      </button>
    </aside>
  );
}
