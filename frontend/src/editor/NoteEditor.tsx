/**
 * Editor de la nota abierta (SPEC-0008 RF-007, RF-008, RF-016; PLAN-0008 §2.6, P-5).
 *
 * Es el dueño del estado de edición: el `draft` (markdown), la revisión que se cargó
 * (`baseRev`), el modo (`read` por defecto, `edit`) y la vista (`visual`/`code`). Las dos
 * vistas leen y escriben el mismo `draft`, así que alternar entre ellas no escribe ni relee
 * nada: sólo cambia qué componente pinta el texto.
 *
 * Guardado explícito (P-5, la réplica no compacta): botón "Guardar", Ctrl/Cmd+S y "Leer" con
 * cambios guarda antes. Hay aviso de cambios sin guardar al cerrar la pestaña (`beforeunload`)
 * y al pedir otra nota (confirmación interna: el padre cambia `noteId` y este componente
 * decide si abre ya o pregunta; si el usuario sigue editando avisa con `onCancelOpen`).
 * Salir de la ruta por navegación interna (riel, "Bóvedas"…) con cambios sin guardar lo
 * bloquea `useBlocker` (sólo existe en data routers: `main.tsx` usa `createBrowserRouter`) y
 * pregunta con el mismo patrón de diálogo (VF-1). El borrado de la nota abierta, que pide el
 * árbol (un componente hermano), pasa por `confirmDiscard` del manejador del editor: con el
 * borrador sucio pregunta antes de descartarlo (VF-2).
 */
import { ComponentType, KeyboardEvent, forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Code as CodeIcon, Eye, Pencil, Save, Table } from "lucide-react";
import { Link, useBlocker } from "react-router-dom";
import { checkContent } from "../notes/noteRules";
import { canonical } from "../sync/canonical";
import type * as Frontmatter from "./frontmatter";
import { NoteNotFoundError, NoteValidationError } from "../notes/errors";
import { noteErrorMessage } from "../notes/messages";
import type { Note } from "../notes/noteStore";
import type { ParseCache } from "./markdown/parseCache";
import { useSync } from "../sync/useSync";
import { CodeView } from "./CodeView";
import { ConfirmDialog } from "./ConfirmDialog";
import { MilkdownView } from "./MilkdownView";
import { NoteBreadcrumb } from "./NoteBreadcrumb";
import { NoteMenu } from "./NoteMenu";
import { PropertiesForm } from "./PropertiesForm";
import { PropertiesPanel } from "./PropertiesPanel";
import "./editor.css";
import "./syntax.css";

/** Contrato común de las dos vistas del markdown (reales o falsas en las pruebas). */
export interface ViewProps {
  value: string;
  onChange: (value: string) => void;
  /** Nombre accesible del área de texto. */
  label: string;
  readOnly: boolean;
  /**
   * Una vista con escritura diferida (Milkdown) entrega aquí su vaciado síncrono: el editor lo llama
   * antes de alternar vista o modo y antes de guardar, para no perder lo escrito en el último instante (E-6).
   */
  registerFlush?: (flush: (() => void) | null) => void;
  /** Estado «sucio» síncrono de una vista con escritura diferida (E-7); las de emisión inmediata no lo necesitan. */
  onDirty?: (dirty: boolean) => void;
  /** Foco en el editor al montarse (U-6): sólo cuando el usuario acaba de pasar a edición. */
  autoFocus?: boolean;
  /** mdast precalculado de este `value` (RNF-001, §10.3); sólo lo usa la vista Visual. */
  preparsedMdast?: string | null;
}

export interface NoteEditorViews {
  Visual: ComponentType<ViewProps>;
  Code: ComponentType<ViewProps>;
}

const REAL_VIEWS: NoteEditorViews = { Visual: MilkdownView, Code: CodeView };

interface NoteEditorProps {
  /** Nota que el padre quiere mostrar. Cambiarla con cambios sin guardar abre la confirmación. */
  noteId: string;
  /** Abrir la nota en edición (la recién creada) en vez de en lectura. Sólo cuenta al cargarla. */
  editOnOpen?: boolean;
  /** El usuario decidió seguir editando: el padre debe volver a seleccionar `openId`. */
  onCancelOpen?: (openId: string) => void;
  /** Vistas inyectables (las pruebas del envoltorio usan editores falsos). */
  views?: NoteEditorViews;
  /**
   * Avisa del borrador sin guardar (`null` cuando no hay cambios). El padre lo conserva por si la
   * bóveda desaparece (papelera por sync) y este editor se desmonta (E-2).
   */
  onDirtyDraft?: (draft: string | null) => void;
  /** Historial de notas abiertas (SPEC-0010 RF-056): las flechas de la barra se habilitan según estos datos. */
  canBack?: boolean;
  canForward?: boolean;
  onBack?: () => void;
  onForward?: () => void;
  /** Una carpeta de las migas: el árbol debe mostrarla (RF-055). */
  onRevealFolder?: (folderPath: string) => void;
  /**
   * Caché de parseo del workspace (RNF-001, §10.3/§10.6): al abrir en lectura (o en Visual el `content`
   * guardado) se consulta por `{id, rev}`; un acierto o una petición en vuelo evitan reparsear con
   * micromark en el hilo principal. Sin caché, el editor parsea en frío como siempre.
   */
  parseCache?: Pick<ParseCache, "get" | "pending"> | null;
}

/** Lo que el padre puede pedirle al editor por `ref`. */
export interface NoteEditorHandle {
  /** ¿Se puede descartar el borrador? Sin cambios, sí al instante; con cambios, pregunta al usuario. */
  confirmDiscard(): Promise<boolean>;
}

type Mode = "read" | "edit";
type View = "visual" | "code";

const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(function NoteEditor(
  { noteId, editOnOpen = false, onCancelOpen, views = REAL_VIEWS, onDirtyDraft, canBack = false, canForward = false, onBack, onForward, onRevealFolder, parseCache = null },
  ref,
) {
  const { notes, notesVersion, conflicts, unsavedDrafts } = useSync();
  const { Visual, Code } = views;

  /** Nota cargada (`null` mientras carga o si desapareció). */
  const [note, setNote] = useState<Note | null>(null);
  const [missing, setMissing] = useState(false);
  const [openId, setOpenId] = useState(noteId);
  /** Nota pedida por el padre a la espera de la respuesta del usuario (cambios sin guardar). */
  const [pendingId, setPendingId] = useState<string | null>(null);
  /** Pregunta de descarte abierta por `confirmDiscard`: quien espera la respuesta. */
  const [discardAsk, setDiscardAsk] = useState<{ answer: (ok: boolean) => void } | null>(null);
  const [draft, setDraft] = useState("");
  /**
   * Propiedades de la sesión de edición (D1, RF-012): objeto `frontmatter` que se edita en Visual con
   * el formulario. En Código la verdad es `codeText` (el texto compuesto `---\nYAML\n---\nbody`).
   */
  const [props, setProps] = useState<Record<string, unknown>>({});
  const [codeText, setCodeText] = useState<string | null>(null);
  /** mdast precalculado del `content` cargado (RNF-001), o `null` si no estaba en la caché. */
  const [preparsed, setPreparsed] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("read");
  const [view, setView] = useState<View>("visual");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Edición en curso que la vista Visual aún no emitió (E-7): informada en la misma transacción, sin
   * esperar el debounce de 200 ms. «Sucio» = eso o un borrador distinto de la nota cargada.
   */
  const [pending, setPending] = useState(false);
  /**
   * El usuario acaba de pasar a edición («Nueva nota» o «Editar»): el editor que se monte ahora toma el
   * foco (U-6). Se consume tras ese montaje: abrir en lectura, recargar, restaurar o alternar de vista no lo mueven.
   */
  const [focusEditor, setFocusEditor] = useState(false);
  useEffect(() => {
    if (focusEditor) setFocusEditor(false);
  }, [focusEditor]);
  // Lo que los efectos y los manejadores de eventos necesitan sin volver a crearse.
  const noteRef = useRef(note);
  noteRef.current = note;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const propsRef = useRef(props);
  propsRef.current = props;
  const codeTextRef = useRef(codeText);
  codeTextRef.current = codeText;
  const viewRef = useRef(view);
  viewRef.current = view;
  /** Módulo `frontmatter` cargado con `import()` al pasar a edición (lectura no lo descarga, RNF-002). */
  const fmRef = useRef<typeof Frontmatter | null>(null);
  const fmPromise = useRef<Promise<typeof Frontmatter> | null>(null);
  const loadFm = useCallback(async () => {
    fmPromise.current ??= import("./frontmatter");
    return (fmRef.current = await fmPromise.current);
  }, []);
  const onDirtyDraftRef = useRef(onDirtyDraft);
  onDirtyDraftRef.current = onDirtyDraft;
  const editOnOpenRef = useRef(editOnOpen);
  editOnOpenRef.current = editOnOpen;
  const parseCacheRef = useRef(parseCache);
  parseCacheRef.current = parseCache;
  /** Vaciado síncrono de la vista Visual (la registra `MilkdownView`): lo escrito en los últimos 200 ms (E-6). */
  const flushVisual = useRef<(() => void) | null>(null);
  const registerFlush = useCallback((flush: (() => void) | null) => {
    flushVisual.current = flush;
  }, []);
  const onViewDirty = useCallback((value: boolean) => setPending(value), []);

  // «Sucio» (RF-021): en Código, el texto compuesto difiere del de la nota; en Visual, el body o las
  // propiedades (comparadas en forma canónica, sync/canonical.ts) difieren de la nota guardada.
  const dirty =
    note !== null &&
    (pending ||
      (view === "code"
        ? codeText !== (fmRef.current ? fmRef.current.composeCode(note.frontmatter, note.content) : codeText)
        : draft !== note.content || canonical(props) !== canonical(note.frontmatter)));
  /** El mdast precalculado sólo vale si el texto mostrado ES el `content` guardado (§10.4). */
  const savedPreparsed = note !== null && draft === note.content ? preparsed : null;

  /**
   * Texto y propiedades vigentes de la sesión (síncrono, por refs). En Código parte del texto compuesto
   * (`split`+`parse`); si el YAML es inválido devuelve `valid: false` y conserva lo último válido. En
   * Visual vacía el debounce y devuelve `{body: draft, props}`.
   */
  function currentEdit(): { body: string; props: Record<string, unknown>; valid: boolean } {
    if (viewRef.current === "code") {
      const fm = fmRef.current;
      const text = codeTextRef.current ?? "";
      if (!fm) return { body: draftRef.current, props: propsRef.current, valid: false };
      const { yaml, body } = fm.splitFrontmatter(text);
      if (yaml === null) return { body, props: {}, valid: true };
      const parsed = fm.parseFrontmatterYaml(yaml);
      if ("error" in parsed) return { body: draftRef.current, props: propsRef.current, valid: false };
      return { body, props: parsed.value, valid: true };
    }
    flushVisual.current?.();
    return { body: draftRef.current, props: propsRef.current, valid: true };
  }

  /** ¿Hay cambios sin guardar AHORA? (síncrono; body o propiedades distintos de la nota guardada). */
  function hasUnsaved(): boolean {
    const current = noteRef.current;
    if (current === null) return false;
    if (viewRef.current === "code") {
      const fm = fmRef.current;
      const text = codeTextRef.current ?? "";
      return fm ? text !== fm.composeCode(current.frontmatter, current.content) : true;
    }
    flushVisual.current?.();
    return draftRef.current !== current.content || canonical(propsRef.current) !== canonical(current.frontmatter);
  }
  /**
   * Bloquea la navegación interna mientras haya cambios sin guardar (VF-1), pero sólo si
   * cambia de pantalla (`pathname`; no una URL con otro search/hash) y el destino no es
   * `/login`: ahí la sesión ya terminó (el aviso se dio en el cierre de sesión, N-1, o la
   * sesión caducó en el servidor) y bloquear sólo dejaría la app a medias (N-2).
   */
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    return hasUnsaved() && currentLocation.pathname !== nextLocation.pathname && nextLocation.pathname !== "/login";
  });

  // El padre conoce siempre el borrador sin guardar (no se emite `null` al desmontar: ahí es justo
  // cuando hace falta conservarlo). En Código el cuerpo vigente se deriva del texto compuesto.
  useEffect(() => {
    if (!dirty) {
      onDirtyDraft?.(null);
      return;
    }
    const body = view === "code" && fmRef.current ? fmRef.current.splitFrontmatter(codeText ?? "").body : draft;
    onDirtyDraft?.(body);
  }, [dirty, draft, codeText, view, onDirtyDraft]);

  // Mientras hay borrador sucio, el cierre de sesión lo sabe y avisa antes de cerrar nada (N-1).
  useEffect(() => (dirty ? unsavedDrafts.register() : undefined), [dirty, unsavedDrafts]);


  useImperativeHandle(
    ref,
    () => ({
      confirmDiscard: () =>
        hasUnsaved() ? new Promise<boolean>((answer) => setDiscardAsk({ answer })) : Promise.resolve(true),
    }),
    [],
  );

  // Carga la nota abierta; al terminar, lectura (o edición si el padre lo pidió).
  useEffect(() => {
    let alive = true;
    setNote(null);
    setMissing(false);
    setError(null);
    setSaved(false);
    setPending(false);
    setPreparsed(null);
    notes.get(openId).then(
      async (loaded) => {
        if (!alive) return;
        // RNF-001 (§10.3/§10.6): al abrir, un acierto de caché (o una petición en vuelo que empezó al
        // pasar el puntero) entrega el mdast precalculado; así el editor no reparsea con micromark en
        // el hilo principal. No se arranca un parseo nuevo aquí: si no hay nada, se parsea en frío.
        let preparsedJson: string | null = null;
        const cache = parseCacheRef.current;
        if (cache) {
          preparsedJson = cache.get(loaded.id, loaded.rev, loaded.content.length);
          if (!preparsedJson) preparsedJson = (await cache.pending(loaded.id, loaded.rev)) ?? null;
        }
        if (!alive) return;
        setPreparsed(preparsedJson);
        setNote(loaded);
        setDraft(loaded.content);
        setProps(loaded.frontmatter);
        setCodeText(null);
        setMode(editOnOpenRef.current ? "edit" : "read");
        setFocusEditor(editOnOpenRef.current);
        setView("visual");
        // Al abrir ya en edición, el módulo `frontmatter` se precarga (lo necesitará Código/guardar).
        if (editOnOpenRef.current) void loadFm();
      },
      (err) => {
        if (!alive) return;
        if (err instanceof NoteNotFoundError) setMissing(true);
        else setError(noteErrorMessage(err));
      },
    );
    return () => {
      alive = false;
    };
  }, [notes, openId]);

  // Otra revisión llegó (el pull, otra pestaña, un renombrado). Sin cambios locales se muestra
  // tal cual. Con cambios sin guardar el borrador se respeta: si la revisión nueva conserva el
  // contenido de la base (sólo cambió la ruta o la metadata, p. ej. un renombrado desde el
  // árbol), el editor se rebasa sobre ella (`baseRev` y ruta) y guardar no crea un conflicto
  // autoinfligido (VF-3); si el contenido cambió, guardar lo deja como rama en conflicto (P-8).
  useEffect(() => {
    const current = noteRef.current;
    if (current === null) return;
    let alive = true;
    notes.get(current.id).then(
      (latest) => {
        const base = noteRef.current;
        if (!alive || base === null || latest.rev === base.rev) return;
        if (!hasUnsaved()) {
          setNote(latest);
          setDraft(latest.content);
          setProps(latest.frontmatter);
          if (viewRef.current === "code" && fmRef.current) setCodeText(fmRef.current.composeCode(latest.frontmatter, latest.content));
          setMissing(false);
        } else if (latest.content === base.content && canonical(latest.frontmatter) === canonical(base.frontmatter)) {
          setNote(latest);
          setMissing(false);
        }
      },
      (err) => {
        if (alive && err instanceof NoteNotFoundError) setMissing(true);
      },
    );
    return () => {
      alive = false;
    };
    // Sólo cuando cambia la versión de las notas: el resto se lee por refs.
  }, [notes, notesVersion]);

  // El padre pide otra nota: abrirla ya, o preguntar si hay cambios sin guardar.
  useEffect(() => {
    if (noteId === openId) {
      setPendingId(null);
    } else if (hasUnsaved()) {
      setPendingId(noteId);
    } else {
      setOpenId(noteId);
    }
  }, [noteId, openId]);

  // Aviso del navegador al cerrar o recargar con cambios sin guardar. Queda registrado mientras haya una
  // nota en edición y decide con el estado síncrono: no espera a que `dirty` se vea en un render (E-7).
  const editing = note !== null && mode === "edit";
  useEffect(() => {
    if (!editing) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!hasUnsaved()) return;
      event.preventDefault();
      // Algunos navegadores sólo muestran el aviso si hay `returnValue`.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
    // `hasUnsaved` sólo usa refs.
  }, [editing]);

  // Fuera de la vista Visual en edición no puede haber una edición diferida pendiente.
  useEffect(() => {
    if (mode !== "edit" || view !== "visual") setPending(false);
  }, [mode, view]);

  const onDraft = useCallback((value: string) => {
    // La ref se adelanta al render: un vaciado seguido de un guardado en el mismo turno lee el texto nuevo.
    draftRef.current = value;
    setDraft(value);
    setSaved(false);
    // El padre guarda el texto vigente por si la bóveda desaparece y este editor se desmonta (E-2).
    if (noteRef.current !== null && value !== noteRef.current.content) onDirtyDraftRef.current?.(value);
  }, []);

  /** El formulario de propiedades (Visual) emitió un objeto válido nuevo. */
  const onProps = useCallback((next: Record<string, unknown>) => {
    propsRef.current = next;
    setProps(next);
    setSaved(false);
  }, []);

  /** La vista Código (verdad mientras se está en ella, RF-021) cambió su texto compuesto. */
  const onCodeChange = useCallback((value: string) => {
    codeTextRef.current = value;
    setCodeText(value);
    setSaved(false);
  }, []);

  // Al pasar a edición se precarga el módulo `frontmatter` (Código y guardar lo necesitan; lectura no).
  useEffect(() => {
    if (mode === "edit") void loadFm();
  }, [mode, loadFm]);

  /**
   * La nota está en la papelera (la mandó otro dispositivo) y aún hay borrador: lo restaura
   * (sujeto a RF-013: con la ruta ocupada falla y el borrador queda como está) y lo guarda
   * sobre la revisión restaurada (VF-4).
   */
  async function restoreAndSave() {
    const current = noteRef.current;
    if (current === null) return;
    setSaving(true);
    setError(null);
    try {
      const trashed = (await notes.list(current.vault_id, { deleted: true })).find((item) => item.id === current.id);
      if (!trashed) throw new NoteNotFoundError();
      const restored = await notes.restore(current.id, trashed.rev);
      const edit = currentEdit(); // lector único (E-8): body + propiedades vigentes
      setNote(await notes.save(current.id, edit.body, restored.rev, edit.valid ? edit.props : current.frontmatter));
      setMissing(false);
      setSaved(true);
    } catch (err) {
      setError(noteErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  /** Guardado en vuelo: serializa `save()` (E-1). */
  const inFlight = useRef<Promise<boolean> | null>(null);

  /**
   * Guarda el borrador; devuelve si quedó guardado. Un error se muestra y deja el borrador.
   * Los guardados se serializan (E-1): una llamada en vuelo absorbe a las demás (doble Ctrl+S,
   * auto-repeat) y, al terminar, se vuelve a decidir con lo que haya ahora: si el borrador cambió
   * mientras tanto, se guarda otra vez, ya sobre la revisión nueva (nunca con la misma `rev`, que
   * crearía una rama de conflicto con contenido idéntico).
   */
  async function save(): Promise<boolean> {
    flushVisual.current?.(); // lo escrito en los últimos 200 ms entra al guardado (E-6)
    if (inFlight.current) {
      const ok = await inFlight.current;
      return ok ? save() : false;
    }
    const run = writeDraft();
    inFlight.current = run;
    try {
      return await run;
    } finally {
      inFlight.current = null;
    }
  }

  /** Una escritura del borrador sobre la revisión que tiene el editor AHORA (por refs, no por cierre). */
  async function writeDraft(): Promise<boolean> {
    const current = noteRef.current;
    if (current === null) return false;
    const edit = currentEdit();
    if (!edit.valid) {
      // YAML inválido en Código (el aviso con línea y «Ir a la línea N» lo refina T-058/T-059).
      setError(noteErrorMessage(new NoteValidationError(["frontmatter"])));
      return false;
    }
    const { body, props: nextProps } = edit;
    if (body === current.content && canonical(nextProps) === canonical(current.frontmatter)) return true; // nada que guardar
    // Aviso inmediato: el almacén también valida, pero así no hay ida y vuelta.
    if (checkContent(body) !== null) {
      setError(noteErrorMessage(new NoteValidationError(["content"])));
      return false;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await notes.save(current.id, body, current.rev, nextProps);
      // La revisión nueva está disponible de inmediato para el guardado siguiente (antes del render).
      noteRef.current = saved;
      setNote(saved);
      // En Visual NO se tocan `draft`/`props`: son el estado vivo del usuario (si siguió escribiendo
      // durante el guardado en vuelo, debe conservarse para guardarlo luego, E-1). En Código se
      // renormaliza el texto compuesto a la forma guardada, para que «sucio» vuelva a ser falso.
      if (viewRef.current === "code" && fmRef.current) {
        const text = fmRef.current.composeCode(saved.frontmatter, saved.content);
        codeTextRef.current = text;
        setCodeText(text);
      }
      setSaved(true);
      return true;
    } catch (err) {
      setError(noteErrorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  }

  /**
   * Alterna Visual/Código (RF-021). A Código: vaciado de Visual y compón el texto `---\nYAML\n---\nbody`.
   * A Visual: el texto de Código es la verdad → `split`+`parse` a `{props, body}`; si el YAML es inválido
   * se queda en Código (el aviso lo da el guardado, T-058).
   */
  async function switchView(next: View) {
    if (next === viewRef.current) return;
    await loadFm();
    if (next === "code") {
      flushVisual.current?.();
      const text = fmRef.current!.composeCode(propsRef.current, draftRef.current);
      codeTextRef.current = text;
      viewRef.current = "code";
      setCodeText(text);
      setView("code");
      return;
    }
    const edit = currentEdit();
    if (!edit.valid) return;
    draftRef.current = edit.body;
    propsRef.current = edit.props;
    codeTextRef.current = null;
    viewRef.current = "visual";
    setDraft(edit.body);
    setProps(edit.props);
    setCodeText(null);
    setView("visual");
  }

  async function leave() {
    // "Leer" guarda antes: si no se pudo, se queda en edición con el borrador y el aviso.
    if (await save()) setMode("read");
  }

  async function saveAndOpen() {
    if (pendingId !== null && (await save())) {
      setOpenId(pendingId);
      setPendingId(null);
    }
  }

  function discardAndOpen() {
    if (pendingId === null) return;
    setOpenId(pendingId);
    setPendingId(null);
  }

  function keepEditing() {
    setPendingId(null);
    onCancelOpen?.(openId);
  }

  async function saveAndLeave() {
    // Si no se pudo guardar, la navegación sigue bloqueada y el borrador intacto.
    if (blocker.state === "blocked" && (await save())) blocker.proceed();
  }

  function answerDiscard(ok: boolean) {
    discardAsk?.answer(ok);
    setDiscardAsk(null);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (mode === "edit" && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      // Sin esto el navegador abriría su propio "Guardar página como".
      event.preventDefault();
      void save();
    }
  }

  // Sin borrador, una nota que ya no existe no tiene nada que ofrecer; con borrador se conserva
  // el editor y se ofrece restaurarla (VF-4).
  if (missing && !dirty) return <p role="status">{noteErrorMessage(new NoteNotFoundError())}</p>;
  if (note === null) return error ? <p role="alert">{error}</p> : <p>Cargando…</p>;

  const inConflict = conflicts.some((conflict) => conflict.kind === "note" && conflict.id === note.id);

  return (
    <section className="note-editor" aria-label="Editor de nota" onKeyDown={onKeyDown}>
      {/* Barra superior (SPEC-0009 R-12, SPEC-0010 P-17, como la captura de Obsidian): Atrás, Adelante, migas,
          controles de edición, estado, lápiz Editar/Leer y menú ⋮. El orden del DOM es el visual y el de tabulación. */}
      <header className="note-editor-header">
        <button
          type="button"
          className="note-nav-button"
          aria-label="Atrás"
          aria-keyshortcuts="Alt+ArrowLeft"
          title="Atrás · Alt+←"
          disabled={!canBack}
          onClick={onBack}
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="note-nav-button"
          aria-label="Adelante"
          aria-keyshortcuts="Alt+ArrowRight"
          title="Adelante · Alt+→"
          disabled={!canForward}
          onClick={onForward}
        >
          <ArrowRight size={16} aria-hidden="true" />
        </button>
        <NoteBreadcrumb path={note.path} onRevealFolder={(folder) => onRevealFolder?.(folder)} />
        <div className="note-editor-toolbar">
          {mode === "edit" && (
            <div role="group" aria-label="Vista del editor" className="note-editor-views">
              <button type="button" aria-pressed={view === "visual"} onClick={() => switchView("visual")}>
                <Eye size={14} aria-hidden="true" />
                <span className="note-btn-label">Visual</span>
              </button>
              <button type="button" aria-pressed={view === "code"} onClick={() => switchView("code")}>
                <CodeIcon size={14} aria-hidden="true" />
                <span className="note-btn-label">Código</span>
              </button>
            </div>
          )}
          {/* Insertar tabla (RF-025): sólo en Visual; la acción se cablea con la lógica del portapapeles y las tablas. */}
          {mode === "edit" && view === "visual" && (
            <button type="button" className="note-nav-button" aria-label="Insertar tabla" title="Insertar tabla">
              <Table size={16} aria-hidden="true" />
            </button>
          )}
          {mode === "edit" && (
            <button type="button" onClick={() => void save()} disabled={saving || !dirty}>
              <Save size={14} aria-hidden="true" />
              <span className="note-btn-label">Guardar</span>
            </button>
          )}
          <span className="note-editor-state" role="status">
            {dirty ? "Cambios sin guardar" : saved ? "Guardado" : ""}
          </span>
          {mode === "read" ? (
            <button
              type="button"
              className="note-nav-button"
              aria-label="Editar"
              title="Editar"
              onClick={() => {
                setFocusEditor(true);
                setMode("edit");
              }}
            >
              <Pencil size={16} aria-hidden="true" />
            </button>
          ) : (
            <button type="button" className="note-nav-button" aria-label="Leer" title="Leer" onClick={() => void leave()} disabled={saving}>
              <BookOpen size={16} aria-hidden="true" />
            </button>
          )}
          {/* Renombrar, copiar la ruta y borrar reutilizan los flujos del árbol y del portapapeles (RF-062): se cablean
              con la lógica de carpetas; «Ver en Código» ya funciona. */}
          <NoteMenu
            inCode={mode === "edit" && view === "code"}
            onRename={() => undefined}
            onCopyPath={() => undefined}
            onViewInCode={() => {
              setFocusEditor(true);
              setMode("edit");
              setView("code");
            }}
            onDelete={() => undefined}
          />
        </div>
      </header>

      {/* Área de scroll del contenido (SPEC-0009 RF-005): una columna centrada de 780 px con los avisos,
          las confirmaciones y la vista activa. La barra superior (`header`) queda fija arriba. */}
      <div className="note-editor-body">
        <div className="note-editor-column">
          {inConflict && (
            <p className="note-editor-notice" role="status">
              Esta nota tiene versiones en conflicto. <Link to="/conflicts">Resolver en Conflictos</Link>
            </p>
          )}
          {missing && (
            <div className="note-editor-notice" role="status">
              <p>Esta nota se envió a la papelera desde otro dispositivo; tu borrador sigue aquí.</p>
              <button type="button" onClick={() => void restoreAndSave()} disabled={saving}>
                Restaurar y guardar
              </button>
            </div>
          )}
          {error && <p role="alert">{error}</p>}
          {pendingId !== null && (
            <ConfirmDialog titleId="note-switch-title" title="Esta nota tiene cambios sin guardar." onCancel={keepEditing}>
              <button type="button" onClick={() => void saveAndOpen()} disabled={saving}>
                Guardar y abrir
              </button>
              <button type="button" onClick={discardAndOpen}>
                Descartar y abrir
              </button>
              <button type="button" onClick={keepEditing}>
                Seguir editando
              </button>
            </ConfirmDialog>
          )}

          {blocker.state === "blocked" && (
            <ConfirmDialog titleId="note-leave-title" title="Esta nota tiene cambios sin guardar." onCancel={() => blocker.reset()}>
              <button type="button" onClick={() => void saveAndLeave()} disabled={saving}>
                Guardar y salir
              </button>
              <button type="button" onClick={() => blocker.proceed()}>
                Descartar y salir
              </button>
              <button type="button" onClick={() => blocker.reset()}>
                Seguir editando
              </button>
            </ConfirmDialog>
          )}

          {discardAsk !== null && (
            <ConfirmDialog titleId="note-discard-title" title="Esta nota tiene cambios sin guardar." onCancel={() => answerDiscard(false)}>
              <button type="button" onClick={() => answerDiscard(true)}>
                Borrar y descartar cambios
              </button>
              <button type="button" data-autofocus onClick={() => answerDiscard(false)}>
                Seguir editando
              </button>
            </ConfirmDialog>
          )}

          {/* Propiedades de la nota (RF-009): panel de sólo lectura; en edición el formulario de la sesión (D1). */}
          {mode === "read" && <PropertiesPanel frontmatter={note.frontmatter} />}
          {/* En Visual, el formulario parte de las propiedades vigentes (`props`) y las emite con `onProps`.
              `key={note.rev}` lo reinicia tras guardar o cambiar de nota; al volver de Código se remonta
              con `props` ya actualizado por `switchView`, así alternar no pierde ediciones. */}
          {mode === "edit" && view === "visual" && <PropertiesForm key={note.rev} frontmatter={props} onChange={onProps} />}

          {mode === "read" ? (
            <Visual value={draft} onChange={onDraft} label="Contenido de la nota" readOnly registerFlush={registerFlush} onDirty={onViewDirty} preparsedMdast={savedPreparsed} />
          ) : view === "visual" ? (
            <Visual value={draft} onChange={onDraft} label="Editor visual" readOnly={false} registerFlush={registerFlush} onDirty={onViewDirty} autoFocus={focusEditor} preparsedMdast={savedPreparsed} />
          ) : (
            <Code value={codeText ?? ""} onChange={onCodeChange} label="Editor de código" readOnly={false} autoFocus={focusEditor} />
          )}
        </div>
      </div>
    </section>
  );
});

export default NoteEditor;
