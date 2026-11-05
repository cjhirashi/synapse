/**
 * Sidebar de la bóveda abierta: árbol de notas, "Nueva nota", renombrado en línea, borrado con
 * confirmación y enlace a la papelera (SPEC-0008 RF-003, RF-010…RF-013, RF-019; PLAN-0008 §2.6).
 *
 * Lee sólo los resúmenes (`noteStore.list`, sin `content`) y los vuelve a leer cuando cambia
 * `notesVersion` (escrituras propias, del pull o de otra pestaña). Las carpetas salen de los
 * prefijos de `path` (`buildTree`) y empiezan plegadas; la que contiene la nota abierta se
 * despliega sola. Renombrar cambia sólo el nombre dentro de su carpeta; mover es arrastrar (H-003).
 *
 * Estructura visual (SPEC-0009 RF-003, RF-004): el formulario «Nueva nota» es un bloque propio sobre
 * el panel del árbol (`.note-tree-panel`) y la papelera es el pie. El renombrado no añade filas: el
 * campo ocupa la fila de la nota o carpeta, así que nada se desplaza bajo el cursor.
 *
 * SPEC-0010 (RF-002, RF-006, RF-042, RF-043): primera fila «Raíz»; **carpeta activa** (`aria-current`), que cambia al
 * pulsar una carpeta (o «Raíz») y al abrir una nota (pasa a ser la suya) pero no con ←/→; indicador «Crear en»
 * (región viva), botón y formulario «Nueva carpeta» y la pista de «/» asociada a los tres campos.
 *
 * Accesibilidad: `role="tree"`; cada fila es un botón `treeitem` (Enter/Espacio) y el árbol
 * sólo contiene `treeitem`s (C-4). Cada fila tiene su ⋮ («Renombrar»/«Borrar», C-1, C-2) fuera del
 * tabulador; F2 renombra y Supr borra desde el `treeitem` enfocado (C-9).
 * Teclado del patrón WAI-ARIA (VF-9) con *roving tabindex*: un solo `treeitem` tabulable;
 * ↑/↓ recorren los visibles, → abre la carpeta o baja a su primer hijo, ← la cierra o sube al
 * padre, Inicio/Fin saltan a los extremos.
 */
import { CSSProperties, DragEvent, FormEvent, forwardRef, KeyboardEvent, ReactNode, useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, CircleAlert, CornerDownRight, FileText, Folder, FolderOpen, FolderPlus, House, Lock, Plus, Trash2 } from "lucide-react";
import { useMediaQuery } from "../layout/useMediaQuery";
import { useSync } from "../sync/useSync";
import { folderNameMessage, noteErrorMessage } from "./messages";
import type { NoteSummary } from "./noteStore";
import { ancestors, checkFolderName, folderExists, joinPath, parentFolder } from "./folders";
import { folderOf, indexPathFor, isIndexPath } from "./indexRules";
import { pathKey } from "./noteRules";
import { isMetaFolderPath, isInBitacora, splitMeta, canonicalMetaName } from "./metaFolders";
import { isSystemPath } from "./metaRules";
import { appliesTo, templateName } from "./metaRules";
import { NoteValidationError } from "./errors";
import { buildTree, displayName, type TreeNode } from "./noteTree";
import { colorVar, type PaletteKey } from "../vaults/vaultIcon";
import { ConfirmDelete } from "./ConfirmDelete";
import { TreeRowMenu } from "./TreeRowMenu";

interface NoteSidebarProps {
  vaultId: string;
  /**
   * Color de la bóveda abierta (H-006): el padre lo resuelve igual que `VaultChip`
   * (`parseIcon(vault.icon).color ?? derivedColor(vault.id)`). Tiñe y rellena los iconos de
   * contenido del árbol (nota/carpeta/«Raíz»); los controles siguen neutros.
   */
  vaultColor: PaletteKey;
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
  /** H-026: carpetas inicialmente desplegadas. */
  initialExpanded?: readonly string[];
  /** H-026: notificación cuando expanded cambia. */
  onExpandedChange?: (expanded: string[]) => void;
}

function readMetaOpen(): boolean {
  try {
    return localStorage.getItem(META_OPEN_STORAGE) !== "0";
  } catch {
    return true;
  }
}

function writeMetaOpen(open: boolean): void {
  try {
    localStorage.setItem(META_OPEN_STORAGE, open ? "1" : "0");
  } catch {
    // Sin almacenamiento (modo privado): se recuerda sólo mientras la pestaña siga abierta.
  }
}

/** Fila visible del árbol, en orden de pantalla (lo que recorre el teclado). */
interface Row {
  /** `meta` para la cabecera de META, `root` para la fila «Raíz», `f:{ruta}` para carpetas, `n:{id}` para notas. */
  key: string;
  kind: "meta" | "root" | "folder" | "note";
  /** Ruta de la carpeta (sólo carpetas). */
  path: string;
  /** Clave de la carpeta que la contiene (`null` en la raíz). */
  parent: string | null;
}

const ROOT_KEY = "root";
/** H-030: cabecera plegable de la sección META (primera fila del árbol cuando hay carpetas reservadas). */
const META_KEY = "meta";
/** H-030: META abierta o plegada, recordada por dispositivo (no por bóveda: es una preferencia de pantalla). */
const META_OPEN_STORAGE = "synapse.metaOpen";
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

/** Borrado esperando confirmación (C-7, C-8): una nota, o una carpeta con sus notas activas. */
type PendingDelete = { kind: "note"; note: NoteSummary } | { kind: "folder"; path: string; notes: NoteSummary[] };

/**
 * Renombrado en línea (C-4, C-5): la nota (con la revisión que se mostraba) o la ruta de la carpeta, el
 * nombre actual y el que se escribe. Sólo cambia el nombre dentro de su carpeta.
 */
type InlineRename =
  | { kind: "note"; note: NoteSummary; current: string; value: string }
  | { kind: "folder"; path: string; current: string; value: string };

/** Fila que muestra el renombrado en curso: al cancelar o confirmar, el foco vuelve aquí. */
function inlineRowKey(edit: InlineRename): string {
  return edit.kind === "note" ? noteKey(edit.note.id) : folderKey(edit.path);
}

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
  /** Pide borrar la nota: abre la confirmación (C-7). */
  remove(id: string): void;
  /** Despliega la carpeta (y sus antecesoras), la deja activa y la desplaza a la vista (RF-055). */
  revealFolder(folderPath: string): void;
}

const NoteSidebar = forwardRef<NoteSidebarHandle, NoteSidebarProps>(function NoteSidebar(
  { vaultId, vaultColor, openId, onOpen, onDeleted, onShowTrash, confirmDelete, onPrefetch, initialExpanded, onExpandedChange },
  ref,
) {
  const { notes, notesVersion } = useSync();
  const [items, setItems] = useState<NoteSummary[] | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(initialExpanded ?? []));
  const [title, setTitle] = useState("");
  // H-030b: plantilla elegida para la nota nueva ("" = sin plantilla).
  const [templateId, setTemplateId] = useState("");
  /** Carpeta activa (`""` = raíz): dónde se crea lo nuevo. Estado visual del árbol (RF-043). */
  const [activeFolder, setActiveFolder] = useState("");
  // H-030b: en la carpeta PLANTILLAS se crean plantillas; en las demás, la nota puede nacer de una que aplique ahí.
  const inTemplatesFolder = pathKey(activeFolder) === pathKey("PLANTILLAS");
  const templateOptions = useMemo(() => {
    if (inTemplatesFolder) return [];
    return (items ?? []).flatMap((item) => {
      const name = item.deleted_at === null ? templateName(item.path) : null;
      const scope = item.frontmatter?.alcance;
      if (name === null || !Array.isArray(scope) || !scope.every((a): a is string => typeof a === "string")) return [];
      if (!appliesTo(scope, activeFolder)) return [];
      const titulo = item.frontmatter?.titulo;
      return [{ id: item.id, label: typeof titulo === "string" && titulo ? titulo : name }];
    });
  }, [items, activeFolder, inTemplatesFolder]);
  // Una plantilla elegida que ya no aplica en la carpeta activa se descarta.
  useEffect(() => {
    if (templateId !== "" && !templateOptions.some((option) => option.id === templateId)) setTemplateId("");
  }, [templateId, templateOptions]);
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
  const [inlineRename, setInlineRename] = useState<InlineRename | null>(null);
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
  /** Nodo que se arrastra ahora mismo (`null` = ninguno) y la fila destino resaltada durante el arrastre (C-3). */
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

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
      if (alive) {
        setItems(list);
        // H-026: filtrar expanded a las carpetas que existen (prefijos de notas vivas).
        const existingPaths = new Set<string>();
        for (const note of list) {
          if (note.deleted_at === null) {
            for (const path of ancestors(note.path)) {
              existingPaths.add(path);
            }
          }
        }
        setExpanded((prev) => new Set([...prev].filter(p => existingPaths.has(p))));
      }
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

  // H-026: notificar cambios en expanded (solo si items cargó).
  useEffect(() => {
    if (items === null) return;
    onExpandedChange?.([...expanded]);
  }, [expanded, items, onExpandedChange]);

  // Al abrir una nota (RF-042) la carpeta activa pasa a ser la suya; pulsar otras carpetas después la mueve.
  const lastOpen = useRef<string | null>(null);
  useEffect(() => {
    if (openId === null || lastOpen.current === openId) return;
    const open = items?.find((item) => item.id === openId);
    if (!open) return; // aún no llegó la lista: se reintenta con ella
    lastOpen.current = openId;
    setActiveFolder(parentFolder(open.path));
  }, [items, openId]);

  // Carpeta cuyo INDICE está abierto: su fila se marca como seleccionada, igual que la de una nota abierta.
  const openIndexFolder = useMemo(() => {
    const open = items?.find((item) => item.id === openId);
    return open && isIndexPath(open.path) ? folderOf(open.path) : null;
  }, [items, openId]);

  // H-030: las carpetas reservadas van en la sección META, encima de «Raíz», y no se repiten dentro de ella.
  const { meta, rest: tree } = useMemo(() => splitMeta(buildTree(items ?? [])), [items]);
  const [metaOpen, setMetaOpen] = useState(() => readMetaOpen());
  const rows = useMemo(
    () => [
      ...(meta.length > 0 ? [{ key: META_KEY, kind: "meta" as const, path: "", parent: null }, ...(metaOpen ? visibleRows(meta, expanded, META_KEY) : [])] : []),
      { key: ROOT_KEY, kind: "root" as const, path: "", parent: null },
      ...visibleRows(tree, expanded),
    ],
    [meta, metaOpen, tree, expanded],
  );

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
    const open = row.kind === "meta" ? metaOpen : row.kind === "folder" && expanded.has(row.path);
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
        if (row.kind === "folder") {
          event.preventDefault();
          if (isMetaFolderPath(row.path) || isInBitacora(row.path)) return; // H-030: la reservada no se renombra ni se borra; la BITACORA solo la escribe el servidor
          if (event.key === "F2") startFolderRename(row.path);
          else askDeleteFolder(row.path);
          return;
        }
        const note = row.kind === "note" ? items?.find((item) => noteKey(item.id) === row.key) : undefined;
        if (!note) return;
        event.preventDefault();
        if (isInBitacora(note.path) || isSystemPath(note.path)) return; // H-030b/H-041: la bitácora y los documentos de sistema son de solo lectura
        if (event.key === "F2") startNoteRename(note);
        else askDeleteNote(note);
        return;
      }
      case "ArrowRight":
        if (row.kind !== "folder" && row.kind !== "meta") return;
        if (!open) toggleRow(row);
        else target = rows[index + 1]?.parent === row.key ? rows[index + 1].key : undefined;
        break;
      case "ArrowLeft":
        if (open) toggleRow(row);
        else target = row.parent ?? undefined;
        break;
      default:
        return;
    }
    // Las flechas y Inicio/Fin no deben desplazar la página.
    event.preventDefault();
    if (target !== undefined) focusRow(target);
  }

  /** Pliega o despliega una fila con hijos: una carpeta o la cabecera de META. */
  function toggleRow(row: Row) {
    if (row.kind === "meta") toggleMeta();
    else toggle(row.path);
  }

  function toggleMeta() {
    setMetaOpen((open) => {
      writeMetaOpen(!open);
      return !open;
    });
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
      let note;
      if (inTemplatesFolder) {
        // En PLANTILLAS se crean plantillas, con su definición vacía; se completa en su formulario.
        if (title.trim() === "") throw new NoteValidationError(["path"]);
        note = await notes.createTemplate(vaultId, title);
      } else if (templateId !== "") {
        const template = await notes.get(templateId);
        const atributos = Array.isArray(template.frontmatter.atributos) ? template.frontmatter.atributos : [];
        note = await notes.create(vaultId, title, activeFolder, {
          name: templateName(template.path) ?? "", content: template.content, atributos,
        });
      } else {
        note = await notes.create(vaultId, title, activeFolder);
      }
      setTitle("");
      setTemplateId("");
      await reload();
      onOpen(note.id, { edit: true });
    });
  }

  function startNoteRename(note: NoteSummary) {
    setError(null);
    const current = displayName(note.path.split("/").pop() ?? note.path);
    setInlineRename({ kind: "note", note, current, value: current });
  }

  function startFolderRename(path: string) {
    setError(null);
    const current = path.split("/").pop() ?? path;
    setInlineRename({ kind: "folder", path, current, value: current });
  }

  function cancelInlineRename(edit: InlineRename) {
    setInlineRename(null);
    setFocusRequest(inlineRowKey(edit));
  }

  /**
   * Confirma el renombrado (C-4, C-5, C-6): sin cambios sólo cierra; `/` y los nombres vacíos o con
   * caracteres de control avisan; una carpeta duplicada avisa sin mover nada. Si la operación falla, el
   * campo sigue abierto con el aviso.
   */
  async function commitInlineRename() {
    const edit = inlineRename;
    if (edit === null) return;
    const name = edit.value;
    if (name === edit.current) {
      cancelInlineRename(edit);
      return;
    }
    setError(null);
    const invalid = name.includes("/") ? "slash" : checkFolderName(name);
    if (invalid !== null) {
      setError(folderNameMessage(invalid));
      return;
    }
    if (edit.kind === "folder" && folderExists(items?.filter((item) => item.deleted_at === null) ?? [], parentFolder(edit.path), name)) {
      setError(folderNameMessage("duplicate", name));
      return;
    }
    await run(async () => {
      if (edit.kind === "note") {
        await notes.rename(edit.note.id, joinPath(parentFolder(edit.note.path), name), edit.note.rev);
        await reload(() => ({ focus: noteKey(edit.note.id) }));
        setInlineRename(null);
        return;
      }
      const target = joinPath(parentFolder(edit.path), name);
      await notes.renameFolder(vaultId, edit.path, name);
      // La carpeta renombrada queda desplegada y activa para verse en su sitio (C-5).
      await reload(() => ({ focus: folderKey(target), expand: ancestors(joinPath(target, "_")) }));
      setActiveFolder(target);
      setInlineRename(null);
    });
  }

  /** Pide confirmación para borrar una nota (C-7): nada se toca hasta confirmar. */
  function askDeleteNote(note: NoteSummary) {
    if (inFlight.current || pendingDelete) return;
    setPendingDelete({ kind: "note", note });
  }

  /** Pide confirmación para borrar una carpeta con todas sus notas activas, también las de subcarpetas (C-8). */
  function askDeleteFolder(path: string) {
    if (inFlight.current || pendingDelete) return;
    const folderNotes = (items ?? []).filter((item) => item.deleted_at === null && item.path.startsWith(`${path}/`));
    setPendingDelete({ kind: "folder", path, notes: folderNotes });
  }

  async function confirmPendingDelete() {
    const pending = pendingDelete;
    setPendingDelete(null);
    if (pending?.kind === "note") await removeNote(pending.note);
    else if (pending?.kind === "folder") await removeFolder(pending.path, pending.notes);
  }

  /**
   * Fila que recibe el foco al quitar la de índice `index`, calculada sobre el árbol RESULTANTE (H1): la
   * siguiente que sobreviva, si no la anterior, si no «Nueva nota». Así no cae en una carpeta que desaparece.
   */
  function focusAfterRemoval(index: number, list: NoteSummary[]): string {
    const { meta: metaAfter, rest: restAfter } = splitMeta(buildTree(list));
    const metaRows = metaAfter.length > 0 ? [{ key: META_KEY }, ...(metaOpen ? visibleRows(metaAfter, expanded) : [])] : [];
    const surviving = new Set([...metaRows, ...visibleRows(restAfter, expanded)].map((row) => row.key));
    const next = rows.slice(index + 1).find((row) => surviving.has(row.key));
    const previous = rows.slice(0, Math.max(index, 0)).reverse().find((row) => surviving.has(row.key));
    return next?.key ?? previous?.key ?? NEW_NOTE;
  }

  async function removeNote(note: NoteSummary) {
    if (inFlight.current) return; // ya hay un borrado/renombrado en marcha (auto-repeat de Supr)
    inFlight.current = true;
    try {
      // Sólo la nota abierta tiene un borrador que perder.
      if (note.id === openId && confirmDelete && !(await confirmDelete())) return;
      const index = rows.findIndex((row) => row.key === noteKey(note.id));
      inFlight.current = false; // `run` retoma la guarda mientras escribe
      const ok = await run(async () => {
        await notes.softDelete(note.id, note.rev);
        await reload((list) => ({ focus: focusAfterRemoval(index, list) }));
      });
      if (ok) onDeleted(note.id);
    } finally {
      inFlight.current = false;
    }
  }

  async function removeFolder(path: string, folderNotes: NoteSummary[]) {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      if (confirmDelete && folderNotes.some((item) => item.id === openId) && !(await confirmDelete())) return;
      const index = rows.findIndex((row) => row.key === folderKey(path));
      inFlight.current = false;
      const ok = await run(async () => {
        await notes.softDeleteFolder(vaultId, path);
        await reload((list) => ({ focus: focusAfterRemoval(index, list) }));
      });
      if (ok) {
        setActiveFolder((current) => (current === path || current.startsWith(`${path}/`) ? parentFolder(path) : current));
        for (const note of folderNotes) onDeleted(note.id);
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

  /** Campo del renombrado en línea: ocupa la fila de la nota o carpeta que se edita (C-4, C-5). */
  function renameInput(label: "nota" | "carpeta", style: CSSProperties, icon: ReactNode) {
    return (
      <div className="note-tree-row note-tree-editing" style={style}>
        {icon}
        <input
          aria-label={`Nuevo nombre de la ${label}`}
          aria-describedby={hintId}
          value={inlineRename?.value ?? ""}
          autoFocus
          onChange={(event) => setInlineRename((edit) => edit && { ...edit, value: event.target.value })}
          onKeyDown={onInlineKeyDown}
          onBlur={() => setInlineRename(null)}
        />
      </div>
    );
  }

  /** Enter confirma; Escape cancela y devuelve el foco a la fila. Salir del campo cancela sin escribir (C-4). */
  function onInlineKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commitInlineRename();
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (inlineRename) cancelInlineRename(inlineRename);
    }
  }

  /**
   * `depth`: nivel de carpetas; la sangría de cada fila sale de él (`--depth`, ver notes.css).
   * `reserved` (H-030): las filas de este nivel son las carpetas reservadas de META; sólo ellas, no sus hijos.
   */
  function renderNodes(nodes: TreeNode<NoteSummary>[], depth = 0, reserved = false) {
    const indent = { "--depth": depth } as CSSProperties;
    return nodes.map((node) => {
      if (node.kind === "folder") {
        const open = expanded.has(node.path);
        const editing = inlineRename?.kind === "folder" && inlineRename.path === node.path;
        const icon = open ? (
          <FolderOpen size={13} aria-hidden="true" data-icon="folder-open" className="note-tree-icon-folder" />
        ) : (
          <Folder size={13} aria-hidden="true" data-icon="folder" className="note-tree-icon-folder" />
        );
        return (
          <li key={`f:${node.path}`} role="none">
            <div className="note-tree-line">
              {editing ? (
                renameInput("carpeta", indent, icon)
              ) : (
                <button
                  type="button"
                  role="treeitem"
                  aria-expanded={open}
                  aria-selected={openIndexFolder === node.path}
                  data-key={folderKey(node.path)}
                  tabIndex={tabbable === folderKey(node.path) ? 0 : -1}
                  onFocus={() => setFocusKey(folderKey(node.path))}
                  className="note-tree-row note-tree-folder"
                  style={indent}
                  aria-current={activeFolder === node.path ? "true" : undefined}
                  draggable={!reserved && !isInBitacora(node.path)}
                  data-drop-target={dropTargetKey === folderKey(node.path) ? "true" : undefined}
                  onDragStart={(event) => onRowDragStart(event, { kind: "folder", path: node.path })}
                  onDragOver={(event) => onTargetDragOver(event, node.path, folderKey(node.path))}
                  onDragLeave={() => onTargetDragLeave(folderKey(node.path))}
                  onDrop={(event) => onTargetDrop(event, node.path)}
                  onClick={() => {
                    toggle(node.path);
                    setActiveFolder(node.path);
                    openIndexOf(node.path);
                  }}
                >
                  {open ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
                  {icon}
                  <span className="note-tree-name" title={node.name}>
                    {canonicalMetaName(node.path) ?? node.name}
                  </span>
                  {reserved && <Lock size={11} aria-hidden="true" data-icon="lock" className="note-tree-icon-lock" />}
                </button>
              )}
              {/* H-030: la carpeta reservada no ofrece renombrar, mover ni borrar (el servidor ya lo rechaza). */}
              {!editing && !reserved && !isInBitacora(node.path) && <TreeRowMenu label={node.name} onRename={() => startFolderRename(node.path)} onDelete={() => askDeleteFolder(node.path)} />}
            </div>
            {open && (
              <ul role="group" className="note-tree-group">
                {renderNodes(node.children, depth + 1)}
              </ul>
            )}
          </li>
        );
      }

      const note = node.note;
      const editing = inlineRename?.kind === "note" && inlineRename.note.id === note.id;
      const icon = <FileText size={12} aria-hidden="true" data-icon="file-text" className="note-tree-icon-note" />;
      const system = isSystemPath(note.path);
      return (
        <li key={note.id} role="none">
          <div className="note-tree-line">
            {editing ? (
              renameInput("nota", indent, icon)
            ) : (
              <button
                type="button"
                role="treeitem"
                aria-selected={note.id === openId}
                data-key={noteKey(note.id)}
                tabIndex={tabbable === noteKey(note.id) ? 0 : -1}
                onFocus={() => {
                  setFocusKey(noteKey(note.id));
                  onPrefetch?.(note.id);
                }}
                onPointerEnter={() => onPrefetch?.(note.id)}
                className="note-tree-row note-tree-note"
                style={indent}
                draggable={!isInBitacora(note.path) && !system}
                onDragStart={(event) => onRowDragStart(event, { kind: "note", id: note.id, path: note.path })}
                onClick={() => onOpen(note.id)}
              >
                {icon}
                <span className="note-tree-name" title={system ? `${node.name} · documento de sistema (solo lectura)` : node.name}>
                  {node.name}
                </span>
                {system && <Lock size={11} aria-hidden="true" data-icon="lock" className="note-tree-icon-lock" />}
              </button>
            )}
            {!editing && !isInBitacora(note.path) && !system && <TreeRowMenu label={node.name} onRename={() => startNoteRename(note)} onDelete={() => askDeleteNote(note)} />}
          </div>
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
        aria-selected={openIndexFolder === ""}
        className="note-tree-row note-tree-folder note-tree-root"
        style={{ "--depth": 0 } as CSSProperties}
        data-drop-target={dropTargetKey === ROOT_KEY ? "true" : undefined}
        onDragOver={(event) => onTargetDragOver(event, "", ROOT_KEY)}
        onDragLeave={() => onTargetDragLeave(ROOT_KEY)}
        onDrop={(event) => onTargetDrop(event, "")}
        onClick={() => {
          setActiveFolder("");
          openIndexOf("");
        }}
      >
        <House size={14} aria-hidden="true" data-icon="house" className="note-tree-icon-root" />
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
   * en la carpeta activa; si es válido crea la carpeta con su INDICE (H-031), la despliega y abre ese INDICE.
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
      const folder = joinPath(activeFolder, name);
      await notes.createFolder(vaultId, folder);
      await reload();
      // La carpeta nueva queda activa; su despliegue lo hace el efecto de «nota abierta» al abrirla.
      setActiveFolder(folder);
      const index = (await notes.list(vaultId)).find((item) => pathKey(item.path) === pathKey(indexPathFor(folder)));
      if (index) onOpen(index.id);
    });
    if (ok) closeFolderForm();
  }

  /** H-031: el nombre de una carpeta (o la raíz) abre su INDICE. */
  function openIndexOf(folder: string) {
    const key = pathKey(indexPathFor(folder));
    const index = items?.find((item) => item.deleted_at === null && pathKey(item.path) === key);
    if (index) onOpen(index.id);
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
        if (note) startNoteRename(note);
      },
      remove(id) {
        const note = items?.find((item) => item.id === id);
        if (note) askDeleteNote(note);
      },
      revealFolder,
    }),
    [items],
  );

  return (
    <aside
      className="note-sidebar"
      aria-label="Notas de la bóveda"
      // H-006: la variable que heredan los iconos de contenido del árbol (mismo patrón que `--chip-color`
      // de `VaultChip`): el CSS la usa como color de trazo (solo contorno, sin relleno; C-2 corregido);
      // cambiar de bóveda sólo cambia este valor.
      style={{ "--vault-icon-color": colorVar(vaultColor) } as CSSProperties}
    >
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
          {inTemplatesFolder ? "Nombre de la plantilla nueva" : "Título de la nota nueva (opcional)"}
          <input value={title} onChange={(event) => setTitle(event.target.value)} aria-describedby={`${createInId} ${hintId}`} />
        </label>
        {templateOptions.length > 0 && (
          <label>
            Plantilla
            <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
              <option value="">Sin plantilla</option>
              {templateOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <button ref={newNoteRef} type="submit" disabled={busy}>
          <Plus size={14} aria-hidden="true" />
          {inTemplatesFolder ? "Nueva plantilla" : "Nueva nota"}
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
              {meta.length > 0 && (
                <li role="none" className="note-tree-meta">
                  <button
                    type="button"
                    role="treeitem"
                    aria-expanded={metaOpen}
                    data-key={META_KEY}
                    tabIndex={tabbable === META_KEY ? 0 : -1}
                    onFocus={() => setFocusKey(META_KEY)}
                    className="note-tree-row note-tree-meta-head"
                    style={{ "--depth": 0 } as CSSProperties}
                    onClick={toggleMeta}
                  >
                    {metaOpen ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
                    <span className="note-tree-name">META</span>
                  </button>
                  {metaOpen && (
                    <ul role="group" aria-label="META" className="note-tree-group">
                      {renderNodes(meta, 0, true)}
                    </ul>
                  )}
                </li>
              )}
              {rootRow}
              {renderNodes(tree)}
            </ul>
            {items.length === 0 && <p>Esta bóveda aún no tiene notas.</p>}
          </>
        )}
      </div>
      {pendingDelete?.kind === "note" && (
        <ConfirmDelete
          kind="note"
          name={displayName(pendingDelete.note.path.split("/").pop() ?? pendingDelete.note.path)}
          onConfirm={() => void confirmPendingDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
      {pendingDelete?.kind === "folder" && (
        <ConfirmDelete
          kind="folder"
          name={pendingDelete.path.split("/").pop() ?? pendingDelete.path}
          count={pendingDelete.notes.length}
          onConfirm={() => void confirmPendingDelete()}
          onCancel={() => setPendingDelete(null)}
        />
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
