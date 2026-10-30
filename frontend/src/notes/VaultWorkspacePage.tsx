/**
 * Ruta `/vaults/:id`: la bóveda abierta, con su sidebar de notas y el editor (SPEC-0008
 * RF-001, RF-002, RF-014, RF-015, RF-019; PLAN-0008 §2.6).
 *
 * - La bóveda se lee de la réplica y se relee con `dataVersion`: una que llega después por el
 *   pull sustituye al 404, y una que se borra mientras está abierta pasa a 404 (RF-002, RF-014).
 *   Un id que no es un UUID canónico no se consulta siquiera.
 * - La nota abierta vive sólo en el estado del componente (RF-015): ni URL ni almacenamiento,
 *   así que al entrar (o volver a montar) el editor está vacío.
 * - El editor (Milkdown + CodeMirror) se carga bajo demanda con `React.lazy`: `/vaults` no lo
 *   descarga (P-3).
 */
import { KeyboardEvent, lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { FileText, FolderOpen, PanelLeft, PanelLeftClose } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { whenIdle } from "../editor/deferred/idle";
import type { NoteEditorHandle } from "../editor/NoteEditor";
import { useSync } from "../sync/useSync";
import type { Vault } from "../sync/vaultStore";
import { canStep, type History, load as loadHistory, push, save as saveHistory, step } from "./noteHistory";
import { NOTE_ID_PREFIX } from "./noteRules";
import NoteSidebar, { type NoteSidebarHandle } from "./NoteSidebar";
import { useMediaQuery } from "../layout/useMediaQuery";
import { derivedColor, parseIcon } from "../vaults/vaultIcon";
import NoteTrash from "./NoteTrash";
import { createParseWorkspace, type ParseWorkspace } from "./parseWorkspace";
import "./notes.css";

/** El chunk del editor: `React.lazy` lo pide al abrir una nota y `Workspace` lo precarga en idle (M-1). */
const loadEditor = () => import("../editor/NoteEditor");
const NoteEditor = lazy(loadEditor);

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
  const { notes, notesVersion } = useSync();
  // H-006: color de los iconos de contenido de la sidebar, resuelto igual que `VaultChip`
  // (color elegido en `Vault.icon`, o el derivado del id si no hay uno).
  const vaultColor = parseIcon(vault.icon).color ?? derivedColor(vault.id);

  // H-009: la barra de notas es fija/dockeada en tableta y escritorio (> 640 px) y flotante en móvil
  // (≤ 640 px). `isMobile` decide el MODO; `sidebarOpen` la visibilidad. Mismo media query que usa
  // `NoteSidebar` para su bloque de creación compacto (640 px), vía el mismo `useMediaQuery`.
  const isMobile = useMediaQuery("(max-width: 640px)");
  // Default por ancho (C-3/C-4): oculta en móvil, visible en tableta/escritorio. Sin persistencia
  // entre sesiones (Descartes): cada apertura de bóveda usa el default del ancho actual.
  const [sidebarOpen, setSidebarOpen] = useState(() => !isMobile);
  const sideId = useId();
  /** El contenedor de la barra, para el cierre por click-afuera de la flotante (C-6). */
  const sideRef = useRef<HTMLDivElement>(null);
  const toggleSidebar = () => setSidebarOpen((v) => !v);

  // C-7: al cruzar el breakpoint (resize/rotación) se recalcula la visibilidad según el default del
  // nuevo ancho — a escritorio queda visible y fija; a móvil, oculta. La nota abierta (`openId`) vive
  // en otro estado y no se toca, así que no se pierde. Sin persistir la preferencia (Descartes).
  useEffect(() => {
    setSidebarOpen(!isMobile);
  }, [isMobile]);

  // C-6/C-8: sólo cuando la barra es flotante y está abierta (móvil), un click fuera de ella o
  // `Escape` la cierran — mismo patrón que `AccountMenu` (mousedown + keydown en `document`). Fija
  // (tableta/escritorio) no se cierra así: sólo el botón la oculta.
  useEffect(() => {
    if (!isMobile || !sidebarOpen) return;
    const onDown = (e: globalThis.MouseEvent) => {
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

  // RNF-001 (Converge 1, M-1): el chunk del editor (~1 MB: Milkdown, CodeMirror…) se descarga, analiza y compila en idle,
  // ya dentro de una bóveda, y no en el «clic → legible» de la primera nota. Sigue siendo un chunk aparte: `/vaults` no
  // lo descarga (P-3) y mermaid, svg-pan-zoom, yaml y las gramáticas siguen pidiéndose sólo cuando una nota los usa.
  useEffect(() => whenIdle(() => void loadEditor(), 2000), []);

  /** Nota abierta (RF-015: nunca persiste fuera de este estado). */
  const [openId, setOpenId] = useState<string | null>(() => requestedNote(location.state, vault.id));

  // El estado de navegación vive en el historial del navegador y sobreviviría a recargar:
  // una vez usado se limpia, para que entrar de nuevo a la bóveda siga abriendo vacía (RF-015).
  useEffect(() => {
    if (location.state !== null) navigate(location.pathname, { replace: true, state: null });
    // Sólo al montar: es lo que el estado inicial de `openId` ya consumió.
  }, []);
  /** La nota recién creada abre en edición; una elegida del árbol, en lectura. */
  const [editOnOpen, setEditOnOpen] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
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

  /** La nota se abrió de verdad: confirma el salto de historial pendiente o añade una entrada (RF-057). */
  function onOpened(id: string) {
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

  return (
    <div className="vault-workspace" onKeyDown={onKeyDown}>
      <div
        className="vault-workspace-side"
        ref={sideRef}
        id={sideId}
        // La cabecera (con el botón) queda siempre visible; `data-open`/`data-floating` gobiernan el
        // árbol vía CSS: dockeado en > 640 px, overlay `position: absolute` (anclado a
        // `.vault-workspace`, no al viewport — ver nota en notes.css) en móvil (C-2/C-5).
        data-open={sidebarOpen ? "" : undefined}
        data-floating={isMobile ? "" : undefined}
      >
        {/* Cabecera de la barra (SPEC-0009 RF-003): carpeta abierta + nombre; sigue siendo el `h1`. El
            botón de alternar ya no vive aquí (H-009 corregido): se movió a la fila de título del editor
            y al estado vacío, para no reservar una columna que le reste ancho al documento. */}
        <header className="vault-workspace-header">
          <FolderOpen size={14} aria-hidden="true" data-icon="folder-open" />
          <h1 title={vault.name}>{vault.name}</h1>
        </header>
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
        />
      </div>
      <div className="vault-workspace-main">
        {showTrash && (
          <NoteTrash vaultId={vault.id} onRestored={() => undefined} onClose={() => setShowTrash(false)} />
        )}
        {/* Con la papelera abierta el editor sigue montado (oculto): no se pierde un borrador. */}
        <div hidden={showTrash} className="vault-workspace-content">
          {openId === null ? (
            // Estado vacío (SPEC-0009 RF-008): texto centrado; el botón de la barra flota en la esquina
            // superior izquierda, sin reservar columna ni padding (H-009 C-1 corregido).
            <>
              <SidebarToggle open={sidebarOpen} controls={sideId} onToggle={toggleSidebar} floating />
              <div className="vault-workspace-empty">
                <FileText size={32} aria-hidden="true" data-icon="file-text" />
                <p>Abre o crea una nota para empezar.</p>
              </div>
            </>
          ) : (
            <Suspense
              fallback={
                <div className="vault-workspace-empty">
                  <p>Cargando el editor…</p>
                </div>
              }
            >
              <NoteEditor ref={editorRef} noteId={openId} editOnOpen={editOnOpen} onCancelOpen={onCancelOpen} onOpened={onOpened} canBack={canStep(history, -1, isLive)} canForward={canStep(history, 1, isLive)} onBack={() => void go(-1)} onForward={() => void go(1)} onDirtyDraft={onDirtyDraft} parseCache={parsing?.cache ?? null} vaultNotes={noteRefs} onRevealFolder={(folder) => sidebarRef.current?.revealFolder(folder)} onRename={() => openId && sidebarRef.current?.startRename(openId)} onDelete={() => openId && void sidebarRef.current?.remove(openId)} sidebarToggle={<SidebarToggle open={sidebarOpen} controls={sideId} onToggle={toggleSidebar} />} />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}
