/**
 * Ruta `/vaults/:id`: la bóveda abierta, con su sidebar de notas y el editor (SPEC-0008
 * RF-001, RF-002, RF-014, RF-015, RF-019; PLAN-0008 §2.6).
 *
 * - La bóveda se lee de la réplica y se relee con `dataVersion`: una que llega después por el
 *   pull sustituye al 404, y una que se borra mientras está abierta pasa a 404 (RF-002, RF-014).
 *   Un id que no es un UUID canónico no se consulta siquiera.
 * - La nota abierta vive en el estado del componente, sin URL (RF-015 original: entrar abría vacío). Desde H-026
 *   se recuerda por dispositivo, usuario y bóveda (`workspaceMemory`): al entrar se restaura el último
 *   documento (con sus carpetas y su scroll) y solo sin registro, o con un documento que ya no existe, abre vacío.
 * - El editor (Milkdown + CodeMirror) se carga bajo demanda con `React.lazy`: `/vaults` no lo
 *   descarga (P-3).
 */
import { CSSProperties, KeyboardEvent, lazy, Suspense, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { FileText, FolderOpen, PanelLeft, PanelLeftClose, PanelRight, PanelRightClose } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { MeContext } from "../auth/RequireAuth";
import { whenIdle } from "../editor/deferred/idle";
import { hasUnmanagedExtension } from "../editor/wikilink";
import type { NoteEditorHandle } from "../editor/NoteEditor";
import { useSync } from "../sync/useSync";
import type { Vault } from "../sync/vaultStore";
import { catalogEstados, withEstado } from "../editor/catalogEstados";
import { canStep, type History, load as loadHistory, push, save as saveHistory, step } from "./noteHistory";
import { parentFolder } from "./folders";
import { NOTE_ID_PREFIX } from "./noteRules";
import VaultFiles from "../files/VaultFiles";
import { listMyOpenTasks } from "../tasks/tasksApi";
import NoteSidebar, { type NoteSidebarHandle } from "./NoteSidebar";
import TagFilterPanel from "./TagFilterPanel";
import DocAside from "./DocAside";
import VaultTabs, { TAB_ORDER } from "./VaultTabs";

// La pestaña Tareas (H-053) se carga al abrirla: no engorda el chunk de entrada.
const VaultTasks = lazy(() => import("../tasks/VaultTasks"));
import SidebarResizeHandle from "./SidebarResizeHandle";
import { useSidebarWidth } from "./useSidebarWidth";
import { readMemory, writeMemory, forgetNote, type VaultTab } from "./workspaceMemory";
import { isIndexPath } from "./indexRules";
import { isInBitacora, isInMensajes } from "./metaFolders";
import { isSystemPath } from "./metaRules";
import { templateName } from "./metaRules";
import { useMediaQuery } from "../layout/useMediaQuery";
import { colorVar, derivedColor, parseIcon } from "../vaults/vaultIcon";
import VaultChip from "../vaults/VaultChip";
import NoteTrash from "./NoteTrash";
import { createParseWorkspace, type ParseWorkspace } from "./parseWorkspace";
import "./notes.css";

/** El chunk del editor: `React.lazy` lo pide al abrir una nota y `Workspace` lo precarga en idle (M-1). */
const loadEditor = () => import("../editor/NoteEditor");
const NoteEditor = lazy(loadEditor);
const IndexView = lazy(() => import("./IndexView"));
const BitacoraView = lazy(() => import("./BitacoraView"));
const MensajeView = lazy(() => import("./MensajeView"));
const SystemDocView = lazy(() => import("./SystemDocView"));
const TemplateView = lazy(() => import("./TemplateView"));

/**
 * Botón de alternar la barra de notas (H-009 C-1/C-8). Un único origen de marcado (icono, etiqueta,
 * `aria-expanded`/`aria-controls`) usado en dos sitios: la fila de título del editor (`NoteEditor`,
 * como primer elemento) y, sin nota abierta, flotando sobre el panel vacío. `floating` conmuta el
 * estilo: el del editor reutiliza `note-nav-button` (editor.css), el flotante se estiliza aparte en
 * `notes.css` (siempre cargado, aunque el chunk del editor no).
 */
function SidebarToggle({ open, controls, onToggle, floating = false }: { open: boolean; controls: string; onToggle: () => void; floating?: boolean }) {
  const label = open ? "Ocultar la barra de notas" : "Mostrar la barra de notas";
  return (
    <button
      type="button"
      className={floating ? "vault-sidebar-toggle vault-sidebar-toggle--floating" : "note-nav-button vault-sidebar-toggle"}
      aria-expanded={open}
      aria-controls={controls}
      aria-label={label}
      title={label}
      onClick={onToggle}
    >
      {open ? <PanelLeftClose size={16} aria-hidden="true" /> : <PanelLeft size={16} aria-hidden="true" />}
    </button>
  );
}

/** Botón de la barra derecha del documento (índice y tareas ligadas), en el extremo derecho de la franja superior. */
function AsideToggle({ open, controls, onToggle }: { open: boolean; controls: string; onToggle: () => void }) {
  const label = open ? "Ocultar el índice y las tareas del documento" : "Mostrar el índice y las tareas del documento";
  return (
    <button type="button" className="note-nav-button vault-aside-toggle" data-aside-toggle="" aria-expanded={open} aria-controls={controls} aria-label={label} title={label} onClick={onToggle}>
      {open ? <PanelRightClose size={16} aria-hidden="true" /> : <PanelRight size={16} aria-hidden="true" />}
    </button>
  );
}

const ASIDE_KEY = "synapse.docAside";
/** La barra derecha se muestra por defecto en escritorio; si la persona la ocultó, se recuerda. */
function readAsidePreference(): boolean {
  try { return window.localStorage.getItem(ASIDE_KEY) !== "0"; } catch { return true; }
}
function writeAsidePreference(open: boolean): void {
  try { window.localStorage.setItem(ASIDE_KEY, open ? "1" : "0"); } catch { /* sin almacenamiento no se recuerda */ }
}

/** UUID en su forma canónica (minúsculas), la única que forman los ids de bóveda. */
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Load = { state: "loading" } | { state: "missing" } | { state: "ready"; vault: Vault };

export default function VaultWorkspacePage() {
  const { id = "" } = useParams();
  const { vaults, dataVersion } = useSync();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  /** Borrador sin guardar de la nota abierta: sobrevive al 404 si la bóveda pasa a la papelera (E-2). */
  const [salvaged, setSalvaged] = useState<string | null>(null);

  // Otra bóveda no hereda el borrador de la anterior.
  useEffect(() => setSalvaged(null), [id]);

  useEffect(() => {
    if (!CANONICAL_UUID.test(id)) {
      setLoad({ state: "missing" });
      return;
    }
    let alive = true;
    vaults.get(id).then(
      (vault) => alive && setLoad({ state: "ready", vault }),
      // `get` falla si no existe o está en la papelera (RF-002); un error de lectura se trata igual.
      () => alive && setLoad({ state: "missing" }),
    );
    return () => {
      alive = false;
    };
  }, [vaults, id, dataVersion]);

  if (load.state === "loading") return <p>Cargando…</p>;
  if (load.state === "missing") {
    return (
      <section>
        <p role="alert">Esta bóveda no existe o está en la papelera.</p>
        {salvaged !== null && <SalvagedDraft text={salvaged} />}
        <Link to="/vaults">Volver a las bóvedas</Link>
      </section>
    );
  }
  // `key`: otra bóveda es otro espacio de trabajo, sin nota abierta ni borradores heredados.
  return <Workspace key={load.vault.id} vault={load.vault} onDirtyDraft={setSalvaged} />;
}

/**
 * Nota que pide el estado de navegación (el "Corregir" de un rechazo, SPEC-0008 RF-004),
 * sólo si es de esta bóveda: el id de nota lleva el de su bóveda.
 */
function requestedNote(state: unknown, vaultId: string): string | null {
  const noteId = (state as { noteId?: unknown } | null)?.noteId;
  return typeof noteId === "string" && noteId.startsWith(`${NOTE_ID_PREFIX}${vaultId}:`) ? noteId : null;
}

/**
 * El borrador que quedaba sin guardar cuando la bóveda se fue a la papelera: sólo lectura (RF-014,
 * no se edita ni se guarda) y con «Copiar texto» para que no se pierda en silencio (E-2).
 */
function SalvagedDraft({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  async function copy() {
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Sin API de portapapeles (contexto no seguro) o permiso denegado (E-4): se avisa y se deja el
      // texto seleccionado para que el usuario lo copie con el teclado.
      setCopied(false);
      setCopyFailed(true);
      area.current?.focus();
      area.current?.select();
    }
  }
  return (
    <div className="note-editor-notice">
      <p>Tenías cambios sin guardar en una nota de esta bóveda. Cópialos antes de salir:</p>
      <textarea ref={area} aria-label="Borrador sin guardar" readOnly rows={8} value={text} />
      <button type="button" onClick={() => void copy()}>
        Copiar texto
      </button>
      {copied && <span role="status">Copiado</span>}
      {copyFailed && <span role="status">No se pudo copiar; selecciona el texto.</span>}
    </div>
  );
}

function Workspace({ vault, onDirtyDraft }: { vault: Vault; onDirtyDraft: (draft: string | null) => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { notes, notesVersion, vaults, status } = useSync();
  // H-006: color de los iconos de contenido de la sidebar, resuelto igual que `VaultChip`
  // (color elegido en `Vault.icon`, o el derivado del id si no hay uno).
  const vaultColor = parseIcon(vault.icon).color ?? derivedColor(vault.id);
  // H-029: estados propios de la bóveda (su catálogo de atributos) y alta de uno nuevo desde una nota.
  const estadoOptions = useMemo(() => catalogEstados(vault.attributes), [vault.attributes]);
  const addEstadoToCatalog = useCallback(
    async (estado: string) => {
      try {
        const fresh = await vaults.get(vault.id);
        const next = withEstado(fresh.attributes, estado);
        if (next !== null) await vaults.setAttributes(vault.id, next, fresh.rev);
      } catch {
        // La nota ya guardó su estado; el catálogo se completa la próxima vez que se cree.
      }
    },
    [vaults, vault.id],
  );

  // H-009: la barra de notas es fija/dockeada en tableta y escritorio (> 640 px) y flotante en móvil
  // (≤ 640 px). `isMobile` decide el MODO; `sidebarOpen` la visibilidad. Mismo media query que usa
  // `NoteSidebar` para su bloque de creación compacto (640 px), vía el mismo `useMediaQuery`.
  const isMobile = useMediaQuery("(max-width: 640px)");
  // H-023 C-4/C-6: el ancho es ajustable sólo en escritorio; tableta y móvil quedan en la hoja (240 px).
  // El estado vive aquí y no en el asa, así sobrevive a ocultar la barra (C-8).
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const { width: sidebarWidth, setWidth: setSidebarWidth, reset: resetSidebarWidth } = useSidebarWidth();
  // Default por ancho (C-3/C-4): oculta en móvil, visible en tableta/escritorio. Sin persistencia
  // entre sesiones (Descartes): cada apertura de bóveda usa el default del ancho actual.
  const [sidebarOpen, setSidebarOpen] = useState(() => !isMobile);
  const sideId = useId();
  /** El contenedor de la barra, para el cierre por click-afuera de la flotante (C-6). */
  const sideRef = useRef<HTMLDivElement>(null);
  const toggleSidebar = () => {
    if (isMobile && !sidebarOpen) setAsideOpen(false); // en móvil las dos barras flotan en el mismo sitio: una a la vez
    setSidebarOpen((v) => !v);
  };

  // Barra derecha (índice de encabezados y tareas ligadas): fija en escritorio y recordada; en tableta y móvil empieza oculta, y en móvil flota.
  const asideId = useId();
  const asideRef = useRef<HTMLDivElement>(null);
  const [asideOpen, setAsideOpen] = useState(() => isDesktop && readAsidePreference());
  const toggleAside = () => {
    const next = !asideOpen;
    setAsideOpen(next);
    if (next && isMobile) setSidebarOpen(false);
    if (isDesktop) writeAsidePreference(next);
  };
  useEffect(() => {
    // Al cruzar de ancho se recalcula como la izquierda: escritorio recuerda la preferencia; tableta y móvil, oculta.
    setAsideOpen(isDesktop && readAsidePreference());
  }, [isDesktop, isMobile]);
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null);

  // C-7: al cruzar el breakpoint (resize/rotación) se recalcula la visibilidad según el default del
  // nuevo ancho — a escritorio queda visible y fija; a móvil, oculta. La nota abierta (`openId`) vive
  // en otro estado y no se toca, así que no se pierde. Sin persistir la preferencia (Descartes).
  useEffect(() => {
    setSidebarOpen(!isMobile);
  }, [isMobile]);

  // C-6/C-8: sólo cuando la barra es flotante y está abierta (móvil), un click fuera de ella o
  // `Escape` la cierran — cierre por mousedown + keydown en `document`. Fija
  // (tableta/escritorio) no se cierra así: sólo el botón la oculta.
  // H-028 C5: ignora clics dentro de menús portaled (.note-menu) o diálogos modales (.confirm-dialog, .modal-backdrop).
  useEffect(() => {
    if (!isMobile || !sidebarOpen) return;
    const onDown = (e: globalThis.MouseEvent) => {
      const el = e.target as Element;
      // Ignora clics dentro de elementos portaled (menú, diálogos de confirmación).
      if (el?.closest?.(".note-menu") || el?.closest?.(".confirm-dialog") || el?.closest?.(".modal-backdrop")) {
        return;
      }
      if (sideRef.current && !sideRef.current.contains(e.target as Node)) setSidebarOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [isMobile, sidebarOpen]);

  // Barra derecha flotante (móvil): un clic fuera o Escape la cierran, salvo el clic en su propio botón o en menús y diálogos.
  useEffect(() => {
    if (!isMobile || !asideOpen) return;
    const onDown = (e: globalThis.MouseEvent) => {
      const el = e.target as Element;
      if (el?.closest?.(".note-menu, .confirm-dialog, .modal-backdrop, [data-aside-toggle]")) return;
      if (asideRef.current && !asideRef.current.contains(e.target as Node)) setAsideOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setAsideOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [isMobile, asideOpen]);

  // RNF-001 (PLAN-0010 §10.4/§10.5): caché de parseo + programador de precálculo propios de esta
  // bóveda. El `Workspace` está `key`-ado por bóveda, así que montar/desmontar = cambio de bóveda o
  // logout: el `dispose` termina el Worker y vacía la caché (ningún dato sobrevive a la sesión).
  const [parsing, setParsing] = useState<ParseWorkspace | null>(null);
  useEffect(() => {
    const pw = createParseWorkspace(notes);
    setParsing(pw);
    return () => {
      pw?.dispose();
      setParsing(null);
    };
  }, [notes]);

  // Tras montar y tras cada `notesVersion` (sync/pull/otra pestaña) se reconcilian las candidatas
  // (resúmenes con `size`): el programador precalcula las notas grandes sin leer sus cuerpos para decidir.
  useEffect(() => {
    if (!parsing) return;
    let alive = true;
    notes
      .list(vault.id)
      .then((summaries) => {
        if (!alive) return;
        parsing.scheduler.reconcile(summaries.map((s) => ({ id: s.id, rev: s.rev, size: s.size })));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [parsing, notes, notesVersion, vault.id]);
  // Historial de notas abiertas (RF-056…RF-060): por bóveda, en `sessionStorage` (sobrevive a recargar la pestaña).
  const [history, setHistory] = useState<History>(() => loadHistory(sessionStorage, vault.id));
  const historyRef = useRef(history);
  /** Ruta de la nota abierta ahora (la entrega `onOpened`): de ella sale la carpeta de origen de H-021 C-7. */
  const openPathRef = useRef<string>("");
  /** Salto de historial pedido y aún sin confirmar: sólo se mueve la posición cuando el editor abre de verdad la nota. */
  const jump = useRef<{ target: string; history: History; direction: -1 | 1 } | null>(null);
  /** Cola de saltos: cada uno espera a que el anterior termine (se abrió, se canceló o venció el plazo), L-5. */
  const navigation = useRef<Promise<void>>(Promise.resolve());
  /** Resuelve la espera del salto en curso. */
  const settleJump = useRef<(() => void) | null>(null);
  /** Ids de las notas vivas (las borradas no son destino): se relee con cada versión de las notas. */
  const [liveIds, setLiveIds] = useState<ReadonlySet<string> | null>(null);
  const isLive = (id: string) => liveIds?.has(id) ?? true;
  /** Notas vivas `{id, path}` de la bóveda para resolver wikilinks (H-011); se relee con cada versión. */
  const [noteRefs, setNoteRefs] = useState<{ id: string; path: string }[]>([]);
  function commitHistory(next: History) {
    historyRef.current = next;
    setHistory(next);
    saveHistory(sessionStorage, vault.id, next);
  }

  // H-031: cada carpeta (y la raíz) tiene su INDICE. Se completa sólo con la réplica al día: antes, un INDICE que
  // aún no llegó del servidor se crearía de nuevo aquí y el push lo rechazaría por ruta ocupada.
  const synced = status.state === "online" && !status.pending;
  useEffect(() => {
    if (!synced) return;
    void notes.ensureIndexes(vault.id).catch(() => undefined);
  }, [notes, synced, vault.id]);

  // H-026: memoria por dispositivo, usuario y bóveda (documento abierto y carpetas desplegadas). Sin usuario no recuerda.
  const userId = useContext(MeContext)?.user_id ?? null;
  const remembered = useRef<ReturnType<typeof readMemory> | undefined>(undefined);
  if (remembered.current === undefined) remembered.current = userId ? readMemory(userId, vault.id) : null;
  // Hasta intentar restaurar el documento no se guarda nada: el estado vacío inicial no debe borrar lo recordado.
  const [memoryReady, setMemoryReady] = useState(false);
  const rememberExpanded = useCallback(
    (expanded: string[]) => {
      if (userId) writeMemory(userId, vault.id, { expanded });
    },
    [userId, vault.id],
  );

  const rememberScroll = useCallback(
    (px: number) => {
      if (userId) writeMemory(userId, vault.id, { scroll: px });
    },
    [userId, vault.id],
  );

  // RNF-001 (Converge 1, M-1): el chunk del editor (~1 MB: Milkdown, CodeMirror…) se descarga, analiza y compila en idle,
  // ya dentro de una bóveda, y no en el «clic → legible» de la primera nota. Sigue siendo un chunk aparte: `/vaults` no
  // lo descarga (P-3) y mermaid, svg-pan-zoom, yaml y las gramáticas siguen pidiéndose sólo cuando una nota los usa.
  useEffect(() => whenIdle(() => void loadEditor(), 2000), []);

  /** Nota abierta (RF-015: restaurada de memoria si existe y es viva, de lo contrario vacía). */
  const [openId, setOpenId] = useState<string | null>(() => requestedNote(location.state, vault.id));

  // El estado de navegación vive en el historial del navegador y sobreviviría a recargar:
  // una vez usado se limpia, para que un pedido explícito no se repita al recargar (lo demás lo decide la memoria, H-026).
  useEffect(() => {
    if (location.state !== null) navigate(location.pathname, { replace: true, state: null });
    // Sólo al montar: es lo que el estado inicial de `openId` ya consumió.
  }, []);

  // H-052: pestaña de la barra lateral, recordada por usuario y bóveda. El árbol de archivos de la pestaña
  // «Archivos» se dibuja en `filesSlot`, dentro de la barra, mientras su tabla ocupa la zona principal.
  // H-053: un enlace `?tab=tareas&task=<id>` (el de un aviso) abre la pestaña Tareas y resalta esa tarea; manda sobre la memoria.
  // Se relee al cambiar la URL: un aviso puede llegar con la bóveda ya abierta (no se vuelve a montar).
  const [focusTask, setFocusTask] = useState<string | null>(() => new URLSearchParams(location.search).get("task"));
  const [tab, setTab] = useState<VaultTab>(() => (new URLSearchParams(location.search).get("tab") === "tareas" ? "tareas" : remembered.current?.tab ?? "documentos"));
  // Movimiento del cambio de pestaña: hacia dónde va (por el orden de las pestañas) y si ya hubo un cambio (la carga inicial no se anima).
  // Se calcula al renderizar, no en un efecto, para que la animación arranque con el panel nuevo y no un cuadro después.
  const [seenTab, setSeenTab] = useState(tab);
  const [tabMotion, setTabMotion] = useState<{ moved: boolean; dir: "next" | "prev" }>({ moved: false, dir: "next" });
  if (seenTab !== tab) {
    setSeenTab(tab);
    setTabMotion({ moved: true, dir: TAB_ORDER.indexOf(tab) > TAB_ORDER.indexOf(seenTab) ? "next" : "prev" });
  }
  const [filesSlot, setFilesSlot] = useState<HTMLElement | null>(null);
  const [tasksSlot, setTasksSlot] = useState<HTMLElement | null>(null);
  const [taskCount, setTaskCount] = useState(0);
  const panelId = useId();
  useEffect(() => {
    const query = new URLSearchParams(location.search);
    if (query.get("tab") === "tareas") {
      setTab("tareas");
      setFocusTask(query.get("task"));
    }
  }, [location.search]);
  useEffect(() => {
    // El contador de la pestaña «Tareas» se lee al abrir la bóveda; la pestaña lo mantiene al día cuando está abierta.
    let cancelled = false;
    listMyOpenTasks(vault.id)
      .then((list) => { if (!cancelled) setTaskCount(list.length); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [vault.id]);
  const changeTab = useCallback(
    (next: VaultTab) => {
      setTab(next);
      setShowTrash(false);
      if (userId) writeMemory(userId, vault.id, { tab: next });
    },
    [userId, vault.id],
  );

  /** La nota recién creada abre en edición; una elegida del árbol, en lectura. */
  const [editOnOpen, setEditOnOpen] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  /** H-026: scroll a restaurar en la nota abierta. */
  const [scrollTarget, setScrollTarget] = useState<{ noteId: string; px: number } | null>(null);

  // Cerrar la nota a propósito (borrarla descartando cambios…) suelta el borrador conservado: sólo la
  // pérdida involuntaria de la bóveda (papelera por sync) lo deja disponible en el 404 (E-3).
  useEffect(() => {
    if (openId === null) onDirtyDraft(null);
  }, [openId, onDirtyDraft]);

  // Quiénes están vivos, para habilitar Atrás/Adelante (RF-056, RF-058) y para resolver wikilinks (H-011).
  // Aparte del precálculo: éste puede no existir.
  useEffect(() => {
    let alive = true;
    notes
      .list(vault.id)
      .then((summaries) => {
        if (!alive) return;
        const live = summaries.filter((s) => s.deleted_at === null);
        setLiveIds(new Set(live.map((s) => s.id)));
        setNoteRefs(live.map((s) => ({ id: s.id, path: s.path })));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [notes, notesVersion, vault.id]);

  // H-026: con la lista de notas cargada se restaura, una sola vez, el documento recordado si sigue vivo; si no, se
  // olvida. Un pedido explícito de abrir otra nota, o una que el usuario ya abrió, gana sobre lo recordado.
  useEffect(() => {
    if (memoryReady || liveIds === null) return;
    const noteId = remembered.current?.noteId ?? null;
    const scroll = remembered.current?.scroll ?? 0;
    if (userId && noteId !== null && openId === null) {
      if (liveIds.has(noteId)) {
        setEditOnOpen(false);
        setOpenId(noteId);
        if (scroll > 0) setScrollTarget({ noteId, px: scroll });
      } else {
        forgetNote(userId, vault.id);
      }
    }
    setMemoryReady(true);
  }, [liveIds, memoryReady, openId, userId, vault.id]);

  // H-026: el scroll recordado solo vale para la primera apertura del documento restaurado.
  useEffect(() => {
    if (scrollTarget !== null && openId !== scrollTarget.noteId) setScrollTarget(null);
  }, [openId, scrollTarget]);

  // H-026: cada cambio del documento abierto se recuerda; cerrarlo a propósito lo olvida.
  useEffect(() => {
    if (!userId || !memoryReady) return;
    if (openId === null) forgetNote(userId, vault.id);
    else writeMemory(userId, vault.id, { noteId: openId });
  }, [openId, memoryReady, userId, vault.id]);

  /** El editor responde si se puede descartar su borrador (borrar la nota abierta, VF-2). */
  const editorRef = useRef<NoteEditorHandle>(null);
  /** Acciones de la sidebar que piden el editor y las migas (revelar carpeta, renombrar, borrar). */
  const sidebarRef = useRef<NoteSidebarHandle>(null);

  function open(id: string, options?: { edit: boolean }) {
    setOpenId(id);
    setEditOnOpen(options?.edit ?? false);
    setShowTrash(false);
    // C-6: elegir una nota cierra la barra flotante (móvil) para no tapar el editor.
    if (isMobile) setSidebarOpen(false);
  }

  /**
   * Clic en un wikilink en Lectura (H-012 C-1/C-3; H-021 C-7). Resuelto: abre esa nota con el MISMO `open`
   * del árbol y del historial (en Lectura, P-3). Roto: si el destino no trae extensión de archivo ajena
   * (P-1) crea una nota vacía con ese nombre y la abre en edición, como «Nueva carpeta»; con extensión
   * ajena (`.docx`, `.pdf`…) no hace nada.
   *
   * H-021 C-7 (cambio respecto a H-012, que creaba en la raíz): la nota se crea en la CARPETA DE LA NOTA DE
   * ORIGEN (la abierta ahora, `openPathRef`). Un destino con `/` (`[[Carpeta/Nota]]`) cuenta desde la raíz
   * de la bóveda, así que en ese caso no se antepone la carpeta de origen (carpeta `""`); `notes.create`
   * resuelve el `/` del título contra esa carpeta base (ver `createNote`/`joinPath`).
   */
  function openWikilink({ resolvedId, target }: { resolvedId: string | null; target: string }) {
    if (resolvedId !== null) {
      open(resolvedId);
      return;
    }
    if (hasUnmanagedExtension(target)) return;
    const folder = target.includes("/") ? "" : parentFolder(openPathRef.current);
    void notes
      .create(vault.id, target, folder)
      .then((note) => open(note.id, { edit: true }))
      .catch(() => undefined);
  }

  /** La nota se abrió de verdad: confirma el salto de historial pendiente o añade una entrada (RF-057). */
  function onOpened(id: string, path: string) {
    openPathRef.current = path;
    const pending = jump.current;
    jump.current = null;
    commitHistory(pending && pending.target === id ? pending.history : push(historyRef.current, id));
    settleJump.current?.();
  }

  /** El usuario decidió seguir editando: la nota y la posición no cambian y el foco vuelve al botón (RF-060). */
  function onCancelOpen(id: string) {
    const direction = jump.current?.direction;
    jump.current = null;
    settleJump.current?.();
    setOpenId(id);
    if (direction) setTimeout(() => document.querySelector<HTMLElement>(`.note-editor-header [aria-label="${direction < 0 ? "Atrás" : "Adelante"}"]`)?.focus(), 0);
  }

  /**
   * Atrás/Adelante: la primera nota viva en esa dirección. Se pide abrir con el mismo cambio de `openId` de 0008
   * (RF-060). Los saltos van **en cola**: dos Alt+← seguidos leerían el mismo historial y darían un solo paso dos
   * veces, así que el segundo espera a que el primero abra la nota (u otra cosa lo cancele).
   */
  function go(direction: -1 | 1): Promise<void> {
    navigation.current = navigation.current.then(async () => {
      const summaries = await notes.list(vault.id);
      const live = new Set(summaries.filter((s) => s.deleted_at === null).map((s) => s.id));
      const result = step(historyRef.current, direction, (id) => live.has(id));
      if (!result) return;
      jump.current = { target: result.target, history: result.history, direction };
      const opened = new Promise<void>((resolve) => {
        // Plazo de seguridad: si la nota no llega a abrirse, la cola no se queda colgada.
        const timer = setTimeout(resolve, 5000);
        settleJump.current = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      open(result.target);
      await opened;
      settleJump.current = null;
    });
    return navigation.current;
  }

  /** Alt+← / Alt+→ con el foco en el workspace y fuera de un editor de texto en edición (RF-059). */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    // Dentro de un campo o editor esas teclas tienen su uso (moverse por palabras).
    if ((event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"], .cm-editor')) return;
    event.preventDefault();
    void go(event.key === "ArrowLeft" ? -1 : 1);
  }

  // H-031: un INDICE se abre en su propia vista (cuerpo generado, sin editor).
  const openIsIndex = openId !== null && noteRefs.some((ref) => ref.id === openId && isIndexPath(ref.path));
  // H-030b: un documento de la BITACORA lo escribe el servidor; se abre en una vista de solo lectura, sin editor.
  // H-030b: una plantilla se edita con su formulario de cuatro secciones, no con el editor de documentos.
  const openIsTemplate = openId !== null && noteRefs.some((ref) => ref.id === openId && templateName(ref.path) !== null);
  const openIsBitacora = openId !== null && noteRefs.some((ref) => ref.id === openId && isInBitacora(ref.path) && !isIndexPath(ref.path));
  // H-042: un documento del buzón entre agentes (mensaje o cabecera) lo escriben solo los agentes; el usuario lo lee sin editor.
  const openIsMensaje = openId !== null && noteRefs.some((ref) => ref.id === openId && isInMensajes(ref.path) && !isIndexPath(ref.path));
  // H-041: un documento de sistema (la skill global, `plantilla-skill`) se abre de solo lectura; va antes que la plantilla.
  const openIsSystem = openId !== null && noteRefs.some((ref) => ref.id === openId && isSystemPath(ref.path));

  // La barra derecha acompaña al documento abierto en la pestaña Documentos (no en la papelera ni en Archivos, Tareas o Filtro por tags).
  const hasAside = tab === "documentos" && openId !== null && !showTrash;
  const openPath = openId === null ? null : (noteRefs.find((ref) => ref.id === openId)?.path ?? null);

  return (
    <div className="vault-workspace-shell" onKeyDown={onKeyDown}>
      {/* H-027 C4: franja superior con el nombre de la bóveda y el botón de alternar la barra. */}
      <div className="vault-workspace-titlebar">
        <SidebarToggle open={sidebarOpen} controls={sideId} onToggle={toggleSidebar} />
        <VaultChip id={vault.id} name={vault.name} icon={vault.icon} />
        <h1 className="vault-workspace-title" title={vault.name}>
          {vault.name}
        </h1>
        {hasAside && <AsideToggle open={asideOpen} controls={asideId} onToggle={toggleAside} />}
      </div>
      <div className="vault-workspace">
        <div
          className="vault-workspace-side"
          ref={sideRef}
          id={sideId}
          // `data-open`/`data-floating` gobiernan el árbol vía CSS: dockeado en > 640 px, overlay
          // `position: absolute` (anclado a `.vault-workspace`, no al viewport — ver nota en notes.css)
          // en móvil (C-2/C-5).
          data-open={sidebarOpen ? "" : undefined}
          data-floating={isMobile ? "" : undefined}
          data-moved={tabMotion.moved ? "" : undefined}
          data-direction={tabMotion.dir}
          style={{ "--vault-icon-color": colorVar(vaultColor), ...(isDesktop ? { "--side-width": `${sidebarWidth}px` } : {}) } as CSSProperties}
        >
          <VaultTabs tab={tab} onChange={changeTab} panelId={panelId} taskCount={taskCount} />
          {/* Documentos sigue montado (oculto) al cambiar de pestaña: conserva carpetas desplegadas y el estado que lee el editor. */}
          <div id={tab === "documentos" ? panelId : undefined} role="tabpanel" className="vault-tab-panel" hidden={tab !== "documentos"}>
            <NoteSidebar
              ref={sidebarRef}
              vaultId={vault.id}
              vaultColor={vaultColor}
              openId={openId}
              onOpen={open}
              onDeleted={(id) => setOpenId((current) => (current === id ? null : current))}
              onShowTrash={() => setShowTrash(true)}
              confirmDelete={() => editorRef.current?.confirmDiscard() ?? Promise.resolve(true)}
              onPrefetch={(id) => parsing?.scheduler.prioritize(id)}
              initialExpanded={remembered.current?.expanded}
              onExpandedChange={rememberExpanded}
            />
          </div>
          {tab === "tags" && (
            <div id={panelId} role="tabpanel" className="vault-tab-panel">
              <TagFilterPanel vaultId={vault.id} vaultColor={vaultColor} openId={openId} onOpen={open} />
            </div>
          )}
          {tab === "archivos" && <div id={panelId} role="tabpanel" className="vault-tab-panel files-workspace" ref={setFilesSlot} style={{ "--vault-icon-color": colorVar(vaultColor) } as CSSProperties} />}
          {tab === "tareas" && <div id={panelId} role="tabpanel" className="vault-tab-panel files-workspace" ref={setTasksSlot} style={{ "--vault-icon-color": colorVar(vaultColor) } as CSSProperties} />}
          {isDesktop && sidebarOpen && (
            <SidebarResizeHandle width={sidebarWidth} onChange={setSidebarWidth} onReset={resetSidebarWidth} />
          )}
        </div>
        <div className="vault-workspace-main">
          {showTrash && (
            <NoteTrash vaultId={vault.id} onRestored={() => undefined} onClose={() => setShowTrash(false)} />
          )}
          {tab === "archivos" && <VaultFiles vaultId={vault.id} sideSlot={filesSlot} accent={colorVar(vaultColor)} onCloseSide={() => setSidebarOpen(false)} />}
          {tab === "tareas" && (
            <Suspense fallback={<p className="tasks-empty">Cargando tareas…</p>}>
            <VaultTasks
              vaultId={vault.id}
              accent={colorVar(vaultColor)}
              sideSlot={tasksSlot}
              focusTaskId={focusTask}
              onOpenNote={(id) => { changeTab("documentos"); open(id); }}
              onOpenFolder={(path) => { changeTab("documentos"); requestAnimationFrame(() => sidebarRef.current?.revealFolder(path)); }}
              onCloseSide={() => setSidebarOpen(false)}
              onOpenCount={setTaskCount}
            />
            </Suspense>
          )}
          {/* Con la papelera abierta (o en las pestañas Archivos y Tareas) el editor sigue montado (oculto): no se pierde un borrador. */}
          <div ref={setContentEl} hidden={showTrash || tab === "archivos" || tab === "tareas"} className="vault-workspace-content">
            {openId === null ? (
              // Estado vacío (SPEC-0009 RF-008): texto centrado.
              <div className="vault-workspace-empty">
                <FileText size={32} aria-hidden="true" data-icon="file-text" />
                <p>Abre o crea una nota para empezar.</p>
              </div>
            ) : (
              <Suspense
                fallback={
                  <div className="vault-workspace-empty">
                    <p>Cargando el editor…</p>
                  </div>
                }
              >
                {openIsIndex ? (
                  <IndexView noteId={openId} vault={vault} notes={notes} notesVersion={notesVersion} userId={userId} vaultColor={vaultColor} noteRefs={noteRefs} onOpenWikilink={openWikilink} />
                ) : openIsSystem ? (
                  <SystemDocView noteId={openId} notes={notes} notesVersion={notesVersion} vaultColor={vaultColor} noteRefs={noteRefs} onOpenWikilink={openWikilink} />
                ) : openIsTemplate ? (
                  <TemplateView noteId={openId} vault={vault} notes={notes} notesVersion={notesVersion} estadoOptions={estadoOptions} />
                ) : openIsBitacora ? (
                  <BitacoraView noteId={openId} notes={notes} notesVersion={notesVersion} vaultColor={vaultColor} noteRefs={noteRefs} onOpenWikilink={openWikilink} />
                ) : openIsMensaje ? (
                  <MensajeView noteId={openId} notes={notes} notesVersion={notesVersion} vaultColor={vaultColor} noteRefs={noteRefs} onOpenWikilink={openWikilink} />
                ) : (
                  <NoteEditor ref={editorRef} noteId={openId} editOnOpen={editOnOpen} onCancelOpen={onCancelOpen} onOpened={onOpened} canBack={canStep(history, -1, isLive)} canForward={canStep(history, 1, isLive)} onBack={() => void go(-1)} onForward={() => void go(1)} onDirtyDraft={onDirtyDraft} parseCache={parsing?.cache ?? null} vaultNotes={noteRefs} vaultColor={vaultColor} estadoOptions={estadoOptions} onNewEstado={(estado) => void addEstadoToCatalog(estado)} attributes={vault.attributes} onOpenWikilink={openWikilink} onRevealFolder={(folder) => sidebarRef.current?.revealFolder(folder)} onRename={() => openId && sidebarRef.current?.startRename(openId)} onDelete={() => openId && void sidebarRef.current?.remove(openId)} initialScroll={scrollTarget?.noteId === openId ? scrollTarget.px : undefined} onScroll={rememberScroll} />
                )}
              </Suspense>
            )}
          </div>
        </div>
        {hasAside && openId !== null && (
          <DocAside
            ref={asideRef} id={asideId} open={asideOpen} floating={isMobile} accent={colorVar(vaultColor)} content={contentEl} vaultId={vault.id} noteId={openId} notePath={openPath}
            onOpenTask={(task) => { setFocusTask(task.id); changeTab("tareas"); }}
            onNavigated={() => setAsideOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
