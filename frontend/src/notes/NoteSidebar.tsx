/**
 * Sidebar de la bóveda abierta: árbol de notas, "Nueva nota", renombrar/mover, borrar y
 * enlace a la papelera (SPEC-0008 RF-003, RF-010…RF-013, RF-019; PLAN-0008 §2.6).
 *
 * Lee sólo los resúmenes (`noteStore.list`, sin `content`) y los vuelve a leer cuando cambia
 * `notesVersion` (escrituras propias, del pull o de otra pestaña). Las carpetas salen de los
 * prefijos de `path` (`buildTree`) y empiezan plegadas; la que contiene la nota abierta se
 * despliega sola. Un renombrado edita la ruta completa: así también se mueve de carpeta.
 *
 * Accesibilidad: `role="tree"`; cada fila es un botón `treeitem` (Enter/Espacio) y el árbol
 * sólo contiene `treeitem`s (C-4). "Renombrar"/"Borrar" viven en una barra (`toolbar`) fuera del
 * árbol, siempre visible para la nota seleccionada (C-1, C-2); F2 y Supr las atajan desde el
 * `treeitem` enfocado.
 * Teclado del patrón WAI-ARIA (VF-9) con *roving tabindex*: un solo `treeitem` tabulable;
 * ↑/↓ recorren los visibles, → abre la carpeta o baja a su primer hijo, ← la cierra o sube al
 * padre, Inicio/Fin saltan a los extremos.
 */
import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useSync } from "../sync/useSync";
import { noteErrorMessage } from "./messages";
import type { NoteSummary } from "./noteStore";
import { buildTree, displayName, type TreeNode } from "./noteTree";

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
/** Destino de foco: el botón «Nueva nota» (cuando no queda ninguna fila). */
const NEW_NOTE = "new-note";

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
  /**
   * Guarda síncrona de operaciones en curso: `busy` (estado) llega tras el render, así que el
   * auto-repeat de F2/Supr podría colarse antes (C-6). `remove` también la cubre mientras espera
   * la confirmación del editor.
   */
  const inFlight = useRef(false);
  /** Destino del foco tras desmontarse el elemento enfocado (C-5): una fila (`n:id`/`f:ruta`) o «Nueva nota». */
  const [focusRequest, setFocusRequest] = useState<string | null>(null);
  const newNoteRef = useRef<HTMLButtonElement>(null);
  /** Nota a la que se refiere la barra de acciones: la última que tomó el foco, o la abierta. */
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /**
   * Relee los resúmenes. `after` decide, SOBRE la lista recién leída, a dónde va el foco (y qué
   * carpetas desplegar): se aplica en el mismo bloque síncrono que `setItems`, así el destino se
   * evalúa contra el árbol resultante y nunca contra uno obsoleto (C-5, H1).
   */
  const reload = useCallback(
    async (after?: (list: NoteSummary[]) => { focus: string; expand?: string[] }) => {
      const list = await notes.list(vaultId);
      setItems(list);
      if (!after) return;
      const { focus, expand } = after(list);
      if (expand?.length) setExpanded((prev) => new Set([...prev, ...expand]));
      setFocusRequest(focus);
    },
    [notes, vaultId],
  );

  useEffect(() => {
    let alive = true;
    void notes.list(vaultId).then((list) => {
      if (alive) setItems(list);
    });
    return () => {
      alive = false;
    };
  }, [notes, vaultId, notesVersion]);

  // La nota que se abre (al crearla o desde fuera) pasa a ser la seleccionada.
  useEffect(() => {
    if (openId !== null) setSelectedId(openId);
  }, [openId]);

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

  // Atiende la petición de foco (llega junto con el árbol que ya la contiene). Si la fila pedida
  // no existe, el foco va a «Nueva nota» y la petición se descarta: nunca queda pendiente.
  useEffect(() => {
    // Con una operación en curso «Nueva nota» está deshabilitado y no admite foco: se espera a que termine.
    if (focusRequest === null || busy) return;
    if (focusRequest !== NEW_NOTE && rows.some((row) => row.key === focusRequest)) focusRow(focusRequest);
    else newNoteRef.current?.focus();
    setFocusRequest(null);
    // `focusRow` sólo usa refs y setState: no hace falta como dependencia.
  }, [focusRequest, rows, busy]);

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
      case "F2":
      case "Delete": {
        if (inFlight.current) return; // misma guarda que los botones (`busy`)
        const note = row.kind === "note" ? items?.find((item) => noteKey(item.id) === row.key) : undefined;
        if (!note) return;
        event.preventDefault();
        setSelectedId(note.id);
        if (event.key === "F2") startRename(note);
        else void remove(note);
        return;
      }
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
    inFlight.current = true;
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
      inFlight.current = false;
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

  function startRename(note: NoteSummary) {
    setError(null);
    setRenaming({ note, path: note.path });
  }

  async function rename(event: FormEvent) {
    event.preventDefault();
    if (renaming === null) return;
    const id = renaming.note.id;
    const ok = await run(async () => {
      await notes.rename(id, renaming.path, renaming.note.rev);
      // La nota pudo moverse a una carpeta plegada: se despliega para que su fila exista y reciba el foco.
      await reload((list) => {
        const moved = list.find((item) => item.id === id);
        return { focus: moved ? noteKey(id) : NEW_NOTE, expand: moved ? ancestors(moved.path) : [] };
      });
    });
    if (ok) setRenaming(null);
  }

  function cancelRename() {
    if (renaming) setFocusRequest(noteKey(renaming.note.id)); // la nota sigue en su sitio: la fila existe
    setRenaming(null);
  }

  async function remove(note: NoteSummary) {
    if (inFlight.current) return; // ya hay un borrado/renombrado en marcha (auto-repeat de Supr)
    inFlight.current = true;
    try {
      // Sólo la nota abierta tiene un borrador que perder.
      if (note.id === openId && confirmDelete && !(await confirmDelete())) return;
      const index = rows.findIndex((row) => row.key === noteKey(note.id));
      inFlight.current = false; // `run` retoma la guarda mientras escribe
      const ok = await run(async () => {
        await notes.softDelete(note.id, note.rev);
        // Foco a la fila vecina (siguiente; si no, anterior; si no, «Nueva nota») calculada sobre el
        // árbol RESULTANTE: sin la nota y sin las carpetas que se vacían con ella (H1).
        await reload((list) => {
          const surviving = new Set(visibleRows(buildTree(list), expanded).map((row) => row.key));
          const next = rows.slice(index + 1).find((row) => surviving.has(row.key));
          const previous = rows.slice(0, Math.max(index, 0)).reverse().find((row) => surviving.has(row.key));
          return { focus: next?.key ?? previous?.key ?? NEW_NOTE };
        });
      });
      if (ok) {
        setSelectedId((current) => (current === note.id ? null : current));
        onDeleted(note.id);
      }
    } finally {
      inFlight.current = false;
    }
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
      return (
        <li key={note.id} role="none" className="note-tree-item">
          <button
            type="button"
            role="treeitem"
            aria-selected={note.id === openId}
            data-key={noteKey(note.id)}
            tabIndex={tabbable === noteKey(note.id) ? 0 : -1}
            onFocus={() => {
              setFocusKey(noteKey(note.id));
              setSelectedId(note.id);
            }}
            className="note-tree-row"
            onClick={() => onOpen(note.id)}
          >
            <span className="note-tree-name" title={node.name}>
              {node.name}
            </span>
          </button>
        </li>
      );
    });
  }

  const selected = items?.find((item) => item.id === selectedId) ?? null;
  const selectedName = selected ? displayName(selected.path.split("/").pop() ?? selected.path) : "";

  return (
    <aside className="note-sidebar" aria-label="Notas de la bóveda">
      <form className="note-sidebar-new" onSubmit={create}>
        <label>
          Título de la nota nueva (opcional)
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <button ref={newNoteRef} type="submit" disabled={busy}>
          Nueva nota
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {selected && (
        <div role="toolbar" aria-label="Acciones de la nota" className="note-actions">
          <span className="note-actions-name" title={selected.path}>
            {selectedName}
          </span>
          <button type="button" aria-label={`Renombrar «${selectedName}»`} onClick={() => startRename(selected)}>
            Renombrar
          </button>
          <button type="button" aria-label={`Borrar «${selectedName}»`} onClick={() => void remove(selected)} disabled={busy}>
            Borrar
          </button>
        </div>
      )}
      {renaming && (
        <form
          className="note-tree-rename"
          onSubmit={rename}
          onKeyDown={(event) => {
            // Escape cancela el renombrado (U-3).
            if (event.key === "Escape") {
              event.preventDefault();
              cancelRename();
            }
          }}
        >
          <label>
            Ruta de la nota
            <input value={renaming.path} onChange={(event) => setRenaming({ note: renaming.note, path: event.target.value })} autoFocus />
          </label>
          <button type="submit" disabled={busy}>
            Guardar ruta
          </button>
          <button type="button" onClick={cancelRename}>
            Cancelar
          </button>
        </form>
      )}
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
