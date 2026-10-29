/**
 * Sidebar de la bóveda abierta: árbol de notas, "Nueva nota", renombrar/mover, borrar y
 * enlace a la papelera (SPEC-0008 RF-003, RF-010…RF-013, RF-019; PLAN-0008 §2.6).
 *
 * Lee sólo los resúmenes (`noteStore.list`, sin `content`) y los vuelve a leer cuando cambia
 * `notesVersion` (escrituras propias, del pull o de otra pestaña). Las carpetas salen de los
 * prefijos de `path` (`buildTree`) y empiezan plegadas; la que contiene la nota abierta se
 * despliega sola. Un renombrado edita la ruta completa: así también se mueve de carpeta.
 *
 * Estructura visual (SPEC-0009 RF-003, RF-004): el formulario «Nueva nota» es un bloque propio sobre
 * el panel del árbol (`.note-tree-panel`); la barra de acciones y el renombrado van **después** del
 * panel y la papelera es el pie. Así enfocar una nota no desplaza ninguna fila: antes la barra de
 * acciones aparecía sobre el árbol, la fila se movía bajo el cursor y el clic no llegaba a abrirla.
 *
 * SPEC-0010 (RF-002, RF-006, RF-042, RF-043): primera fila «Raíz»; **carpeta activa** (`aria-current`), que cambia al
 * pulsar una carpeta (o «Raíz») y al abrir una nota (pasa a ser la suya) pero no con ←/→; indicador «Crear en»
 * (región viva), botón y formulario «Nueva carpeta» y la pista de «/» asociada a los tres campos.
 *
 * Accesibilidad: `role="tree"`; cada fila es un botón `treeitem` (Enter/Espacio) y el árbol
 * sólo contiene `treeitem`s (C-4). "Renombrar"/"Borrar" viven en una barra (`toolbar`) fuera del
 * árbol, siempre visible para la nota seleccionada (C-1, C-2); F2 y Supr las atajan desde el
 * `treeitem` enfocado.
 * Teclado del patrón WAI-ARIA (VF-9) con *roving tabindex*: un solo `treeitem` tabulable;
 * ↑/↓ recorren los visibles, → abre la carpeta o baja a su primer hijo, ← la cierra o sube al
 * padre, Inicio/Fin saltan a los extremos.
 */
import { CSSProperties, DragEvent, FormEvent, forwardRef, KeyboardEvent, useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, CircleAlert, CornerDownRight, FileText, Folder, FolderOpen, FolderPlus, House, Plus, Trash2 } from "lucide-react";
import { useMediaQuery } from "../layout/useMediaQuery";
import { useSync } from "../sync/useSync";
import { folderNameMessage, noteErrorMessage } from "./messages";
import type { NoteSummary } from "./noteStore";
import { ancestors, checkFolderName, folderExists, joinPath, parentFolder } from "./folders";
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
  /**
   * Puntero o foco sobre la fila de una nota (RNF-001, §10.5): pide su precálculo con prioridad (el
   * clic suele llegar cientos de ms después, o Enter tras el foco). Sin esta función no hace nada.
   */
  onPrefetch?: (id: string) => void;
}

/** Fila visible del árbol, en orden de pantalla (lo que recorre el teclado). */
interface Row {
  /** `root` para la fila «Raíz», `f:{ruta}` para carpetas, `n:{id}` para notas. */
  key: string;
  kind: "root" | "folder" | "note";
  /** Ruta de la carpeta (sólo carpetas). */
  path: string;
  /** Clave de la carpeta que la contiene (`null` en la raíz). */
  parent: string | null;
}

const ROOT_KEY = "root";
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

/** Nodo que se está arrastrando (H-003): una nota (por id y ruta) o una carpeta (por ruta). */
type DragItem = { kind: "note"; id: string; path: string } | { kind: "folder"; path: string };

/**
 * ¿Soltar `drag` en la carpeta `dest` (`""` = raíz) movería algo? `false` cubre C-4 (destino no
 * válido) y C-7 (sin desplazamiento real): una nota ya en esa carpeta, una carpeta sobre sí misma,
 * sobre un descendiente suyo, o ya directamente dentro del destino.
 */
function canDrop(drag: DragItem, dest: string): boolean {
  if (drag.kind === "note") return parentFolder(drag.path) !== dest;
  if (drag.path === dest || dest.startsWith(`${drag.path}/`)) return false;
  return parentFolder(drag.path) !== dest;
}

/** Acciones que el `Workspace` (y, por él, el editor y el menú ⋮) piden a la sidebar por `ref` (RF-062, RF-055). */
export interface NoteSidebarHandle {
  startRename(id: string): void;
  remove(id: string): Promise<void>;
  /** Despliega la carpeta (y sus antecesoras), la deja activa y la desplaza a la vista (RF-055). */
  revealFolder(folderPath: string): void;
}

const NoteSidebar = forwardRef<NoteSidebarHandle, NoteSidebarProps>(function NoteSidebar(
  { vaultId, openId, onOpen, onDeleted, onShowTrash, confirmDelete, onPrefetch },
  ref,
) {
  const { notes, notesVersion } = useSync();
  const [items, setItems] = useState<NoteSummary[] | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [title, setTitle] = useState("");
  /** Carpeta activa (`""` = raíz): dónde se crea lo nuevo. Estado visual del árbol (RF-043). */
  const [activeFolder, setActiveFolder] = useState("");
  /** Formulario «Nueva carpeta» abierto, su texto y su mensaje de error (`null` = sin error). */
  const [folderForm, setFolderForm] = useState<{ name: string; message: string | null } | null>(null);
  /** A ≤ 640 px el bloque de creación es un disclosure («Crear…»): la barra lateral no empuja al editor fuera de la pantalla. */
  const compact = useMediaQuery("(max-width: 640px)");
  const [createOpen, setCreateOpen] = useState(false);
  const fieldsId = useId();
  const uid = useId();
  const createInId = "note-create-in";
  const hintId = `${uid}-folder-hint`;
  const folderErrorId = `${uid}-folder-error`;
  const newFolderRef = useRef<HTMLButtonElement>(null);
  /** El formulario se cerró a propósito: el foco vuelve a «Nueva carpeta» cuando el botón se vuelve a ver. */
  const refocusNewFolder = useRef(false);
  useEffect(() => {
    if (folderForm === null && refocusNewFolder.current) {
      refocusNewFolder.current = false;
      newFolderRef.current?.focus();
    }
  }, [folderForm]);
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
  /** Nodo que se arrastra ahora mismo (`null` = ninguno) y la fila destino resaltada durante el arrastre (C-3). */
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);

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

  // Al abrir una nota (RF-042) la carpeta activa pasa a ser la suya; pulsar otras carpetas después la mueve.
  const lastOpen = useRef<string | null>(null);
  useEffect(() => {
    if (openId === null || lastOpen.current === openId) return;
    const open = items?.find((item) => item.id === openId);
    if (!open) return; // aún no llegó la lista: se reintenta con ella
    lastOpen.current = openId;
    setActiveFolder(parentFolder(open.path));
  }, [items, openId]);

  const tree = useMemo(() => buildTree(items ?? []), [items]);
  const rows = useMemo(() => [{ key: ROOT_KEY, kind: "root" as const, path: "", parent: null }, ...visibleRows(tree, expanded)], [tree, expanded]);

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
      // RF-001/RF-003: la nota nueva nace en la carpeta activa (`""` = raíz). La carpeta se despliega
      // sola al abrirse la nota (efecto de «nota abierta»); no se toca `expanded` aquí (robaría el foco).
      const note = await notes.create(vaultId, title, activeFolder);
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

  // --- Drag & drop (H-003): mover notas/carpetas arrastrándolas sobre una carpeta o «Raíz» ---

  /** Empieza a arrastrar una fila (nota o carpeta): guarda el nodo y marca el efecto «mover». */
  function onRowDragStart(event: DragEvent, item: DragItem) {
    setDragItem(item);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", item.path);
    }
  }

  /** Fila de carpeta/«Raíz» como destino: resalta y habilita el drop sólo si movería algo (C-3, C-4, C-7). */
  function onTargetDragOver(event: DragEvent, dest: string, key: string) {
    if (!dragItem || !canDrop(dragItem, dest)) return;
    event.preventDefault(); // sin `preventDefault` el navegador no admite el drop
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    if (dropTargetKey !== key) setDropTargetKey(key);
  }

  function onTargetDragLeave(key: string) {
    setDropTargetKey((current) => (current === key ? null : current));
  }

  /** Suelta sobre una carpeta/«Raíz»: mueve si el destino es válido; si no, no hace nada (C-4, C-7). */
  function onTargetDrop(event: DragEvent, dest: string) {
    event.preventDefault();
    const drag = dragItem;
    setDragItem(null);
    setDropTargetKey(null);
    if (drag && canDrop(drag, dest)) void performMove(drag, dest);
  }

  /** Ejecuta el movimiento reusando el PATCH de ruta: `rename` por nota (C-1) o `moveFolder` en lote (C-2). */
  async function performMove(drag: DragItem, dest: string) {
    if (drag.kind === "note") {
      const note = items?.find((item) => item.id === drag.id);
      if (!note) return;
      const target = joinPath(dest, note.path.split("/").pop() ?? note.path);
      await run(async () => {
        await notes.rename(note.id, target, note.rev);
        // La nota pudo caer en una carpeta plegada: se despliega para que su fila exista y reciba el foco.
        await reload((list) => {
          const moved = list.find((item) => item.id === note.id);
          return { focus: moved ? noteKey(note.id) : NEW_NOTE, expand: moved ? ancestors(moved.path) : [] };
        });
      });
      return;
    }
    const name = drag.path.split("/").pop() ?? drag.path;
    // C-5: el destino ya tiene una carpeta con ese nombre → mismo aviso que crear/renombrar carpeta, sin mover.
    if (folderExists(items?.filter((item) => item.deleted_at === null) ?? [], dest, name)) {
      setError(folderNameMessage("duplicate", name));
      return;
    }
    const moved = joinPath(dest, name);
    await run(async () => {
      await notes.moveFolder(vaultId, drag.path, dest);
      await reload();
      // La carpeta movida queda desplegada y activa para verse en su nuevo sitio.
      setExpanded((prev) => new Set([...prev, ...ancestors(joinPath(moved, "_")), moved]));
      setActiveFolder(moved);
    });
  }

  /** `depth`: nivel de carpetas; la sangría de cada fila sale de él (`--depth`, ver notes.css). */
  function renderNodes(nodes: TreeNode<NoteSummary>[], depth = 0) {
    const indent = { "--depth": depth } as CSSProperties;
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
              style={indent}
              aria-current={activeFolder === node.path ? "true" : undefined}
              draggable
              data-drop-target={dropTargetKey === folderKey(node.path) ? "true" : undefined}
              onDragStart={(event) => onRowDragStart(event, { kind: "folder", path: node.path })}
              onDragOver={(event) => onTargetDragOver(event, node.path, folderKey(node.path))}
              onDragLeave={() => onTargetDragLeave(folderKey(node.path))}
              onDrop={(event) => onTargetDrop(event, node.path)}
              onClick={() => {
                toggle(node.path);
                setActiveFolder(node.path);
              }}
            >
              {open ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
              {open ? (
                <FolderOpen size={13} aria-hidden="true" data-icon="folder-open" className="note-tree-icon-folder" />
              ) : (
                <Folder size={13} aria-hidden="true" data-icon="folder" className="note-tree-icon-folder" />
              )}
              <span className="note-tree-name" title={node.name}>
                {node.name}
              </span>
            </button>
            {open && (
              <ul role="group" className="note-tree-group">
                {renderNodes(node.children, depth + 1)}
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
              onPrefetch?.(note.id);
            }}
            onPointerEnter={() => onPrefetch?.(note.id)}
            className="note-tree-row note-tree-note"
            style={indent}
            draggable
            onDragStart={(event) => onRowDragStart(event, { kind: "note", id: note.id, path: note.path })}
            onClick={() => onOpen(note.id)}
          >
            <FileText size={12} aria-hidden="true" data-icon="file-text" className="note-tree-icon-note" />
            <span className="note-tree-name" title={node.name}>
              {node.name}
            </span>
          </button>
        </li>
      );
    });
  }

  /** Fila «Raíz»: primera del árbol, sin chevron; activarla vuelve la carpeta activa a la raíz. */
  const rootRow = (
    <li role="none">
      <button
        type="button"
        role="treeitem"
        data-key={ROOT_KEY}
        tabIndex={tabbable === ROOT_KEY ? 0 : -1}
        onFocus={() => setFocusKey(ROOT_KEY)}
        aria-current={activeFolder === "" ? "true" : undefined}
        className="note-tree-row note-tree-folder note-tree-root"
        style={{ "--depth": 0 } as CSSProperties}
        data-drop-target={dropTargetKey === ROOT_KEY ? "true" : undefined}
        onDragOver={(event) => onTargetDragOver(event, "", ROOT_KEY)}
        onDragLeave={() => onTargetDragLeave(ROOT_KEY)}
        onDrop={(event) => onTargetDrop(event, "")}
        onClick={() => setActiveFolder("")}
      >
        <House size={14} aria-hidden="true" data-icon="house" />
        <span className="note-tree-name">Raíz</span>
      </button>
    </li>
  );

  function closeFolderForm() {
    setFolderForm(null);
    refocusNewFolder.current = true;
  }

  /**
   * «Crear carpeta» (RF-004, RF-005, RF-042): valida el nombre (vacío/tramo/control) y que no exista ya
   * en la carpeta activa; si es válido crea `{activa}/{nombre}/Sin título.md`, despliega la carpeta y
   * abre la nota en edición. Una carpeta no se guarda por sí sola: existe por tener una nota dentro.
   */
  async function submitFolder(event: FormEvent) {
    event.preventDefault();
    if (folderForm === null) return;
    const name = folderForm.name;
    const invalid = checkFolderName(name);
    if (invalid !== null) {
      setFolderForm({ ...folderForm, message: folderNameMessage(invalid) });
      return;
    }
    if (folderExists(items?.filter((item) => item.deleted_at === null) ?? [], activeFolder, name)) {
      setFolderForm({ ...folderForm, message: folderNameMessage("duplicate", name) });
      return;
    }
    const ok = await run(async () => {
      const note = await notes.create(vaultId, "", joinPath(activeFolder, name));
      await reload();
      // La carpeta nueva queda activa; su despliegue lo hace el efecto de «nota abierta» al abrirla.
      setActiveFolder(joinPath(activeFolder, name));
      onOpen(note.id, { edit: true });
    });
    if (ok) closeFolderForm();
  }

  /** Despliega una carpeta y sus antecesoras, la deja activa y la trae a la vista (RF-055). */
  function revealFolder(folderPath: string) {
    if (folderPath === "") {
      setActiveFolder("");
      return;
    }
    const prefixes = ancestors(joinPath(folderPath, "_")); // antecesoras + la propia carpeta
    setExpanded((prev) => new Set([...prev, ...prefixes]));
    setActiveFolder(folderPath);
    // Sólo se desplaza el panel del árbol, no la página (`scrollIntoView` no existe en jsdom: se omite).
    requestAnimationFrame(() => {
      const row = treeRef.current?.querySelector<HTMLElement>(`[data-key="${folderKey(folderPath)}"]`);
      row?.scrollIntoView?.({ block: "nearest" });
    });
  }

  useImperativeHandle(
    ref,
    () => ({
      startRename(id) {
        const note = items?.find((item) => item.id === id);
        if (note) startRename(note);
      },
      remove(id) {
        const note = items?.find((item) => item.id === id);
        return note ? remove(note) : Promise.resolve();
      },
      revealFolder,
    }),
    [items],
  );

  const selected = items?.find((item) => item.id === selectedId) ?? null;
  const selectedName = selected ? displayName(selected.path.split("/").pop() ?? selected.path) : "";

  return (
    <aside className="note-sidebar" aria-label="Notas de la bóveda">
      <form className="note-sidebar-new" onSubmit={create}>
        <p id={createInId} className="note-create-in" aria-live="polite" aria-atomic="true">
          {activeFolder === "" ? <House size={14} aria-hidden="true" /> : <FolderOpen size={14} aria-hidden="true" />}
          <span>
            Crear en: <strong title={activeFolder || "Raíz"}>{activeFolder || "Raíz"}</strong>
          </span>
        </p>
        {compact && (
          <button type="button" className="note-sidebar-secondary" aria-expanded={createOpen} aria-controls={fieldsId} onClick={() => setCreateOpen((open) => !open)}>
            <Plus size={14} aria-hidden="true" />
            Crear…
          </button>
        )}
        <div id={fieldsId} className="note-create-fields" hidden={compact && !createOpen}>
        <label>
          Título de la nota nueva (opcional)
          <input value={title} onChange={(event) => setTitle(event.target.value)} aria-describedby={`${createInId} ${hintId}`} />
        </label>
        <button ref={newNoteRef} type="submit" disabled={busy}>
          <Plus size={14} aria-hidden="true" />
          Nueva nota
        </button>
        <button
          ref={newFolderRef}
          type="button"
          className="note-sidebar-secondary"
          hidden={folderForm !== null}
          onClick={() => setFolderForm({ name: "", message: null })}
        >
          <FolderPlus size={14} aria-hidden="true" />
          Nueva carpeta
        </button>
        <p id={hintId} className="note-folder-hint">
          <CornerDownRight size={12} aria-hidden="true" />
          Usa / para crear subcarpetas (por ejemplo, Proyectos/Ideas)
        </p>
        </div>
      </form>
      {folderForm !== null && (
          <form
            className="note-sidebar-new note-sidebar-folder"
            onSubmit={submitFolder}
            onKeyDown={(event) => {
              // Esc cancela y devuelve el foco al botón que lo abrió.
              if (event.key === "Escape") {
                event.preventDefault();
                closeFolderForm();
              }
            }}
          >
            <label>
              Nombre de la carpeta
              <input
                autoFocus
                value={folderForm.name}
                onChange={(event) => setFolderForm({ name: event.target.value, message: null })}
                aria-invalid={folderForm.message !== null ? true : undefined}
                aria-describedby={folderForm.message !== null ? `${hintId} ${folderErrorId}` : hintId}
              />
            </label>
            {folderForm.message !== null && (
              <p id={folderErrorId} role="alert" className="note-sidebar-error">
                <CircleAlert size={12} aria-hidden="true" />
                {folderForm.message}
              </p>
            )}
            <div className="note-sidebar-folder-actions">
              <button type="submit">Crear carpeta</button>
              <button type="button" onClick={closeFolderForm}>
                Cancelar
              </button>
            </div>
          </form>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="note-tree-panel">
        {items === null ? (
          <p>Cargando…</p>
        ) : (
          <>
            <ul ref={treeRef} role="tree" aria-label="Notas" className="note-tree" onKeyDown={onTreeKeyDown}>
              {rootRow}
              {renderNodes(tree)}
            </ul>
            {items.length === 0 && <p>Esta bóveda aún no tiene notas.</p>}
          </>
        )}
      </div>
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
            <input
              value={renaming.path}
              onChange={(event) => setRenaming({ note: renaming.note, path: event.target.value })}
              aria-describedby={hintId}
              autoFocus
            />
          </label>
          <button type="submit" disabled={busy}>
            Guardar ruta
          </button>
          <button type="button" onClick={cancelRename}>
            Cancelar
          </button>
        </form>
      )}
      <div className="note-sidebar-footer">
        <button type="button" className="note-sidebar-trash" onClick={onShowTrash}>
          <Trash2 size={14} aria-hidden="true" />
          Papelera de la bóveda
        </button>
      </div>
    </aside>
  );
});

export default NoteSidebar;
