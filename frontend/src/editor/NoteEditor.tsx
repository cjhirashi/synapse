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
import { checkContent, checkFrontmatter, checkPath } from "../notes/noteRules";
import { canonical } from "../sync/canonical";
import type * as Frontmatter from "./frontmatter";
import { NoteNotFoundError, NoteValidationError } from "../notes/errors";
import { frontmatterTooLargeMessage, frontmatterYamlMessage, noteErrorMessage } from "../notes/messages";
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
  /** Línea (1-based) a resaltar por un error de YAML; sólo la vista Código (RF-017/RF-029). */
  errorLine?: number | null;
  /** Registra «Ir a la línea N» (como `registerFlush`); sólo la vista Código. */
  registerReveal?: (reveal: ((line: number) => void) | null) => void;
  /** Bloque heredado protegido que no se entrega a la vista y se re-antepone al emitir (P-6); sólo Visual. */
  prefix?: string;
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
  /** Renombrar la nota abierta (RF-008): el editor lo pide cuando su ruta es inválida. */
  onRename?: () => void;
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
  { noteId, editOnOpen = false, onCancelOpen, views = REAL_VIEWS, onDirtyDraft, canBack = false, canForward = false, onBack, onForward, onRevealFolder, onRename, parseCache = null },
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
  /**
   * YAML heredado en `content` (NC-2, RF-044/RF-045): `prefix` es el bloque estricto protegido que no se
   * entrega a Visual (P-6); `legacyNotice` es el aviso de la sesión (`migrate` antes de guardar, `moved`
   * tras guardar, `looks-yaml` cuando el inicio parece YAML pero no se trata como propiedades).
   */
  const [prefix, setPrefix] = useState("");
  const [legacyNotice, setLegacyNotice] = useState<"migrate" | "moved" | "looks-yaml" | null>(null);
  /** Fuerza el remontaje del `PropertiesForm` cuando `beginEdit` reinicia las propiedades (migración async). */
  const [formKey, setFormKey] = useState(0);
  /** mdast precalculado del `content` cargado (RNF-001), o `null` si no estaba en la caché. */
  const [preparsed, setPreparsed] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("read");
  const [view, setView] = useState<View>("visual");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Línea (1-based, en el texto compuesto) del error de YAML para ofrecer «Ir a la línea N». */
  const [errorLine, setErrorLine] = useState<number | null>(null);

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
  const legacyNoticeRef = useRef(legacyNotice);
  legacyNoticeRef.current = legacyNotice;
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
  /** «Ir a la línea N» de la vista Código (la registra `CodeView`, como `registerFlush`). */
  const revealLine = useRef<((line: number) => void) | null>(null);
  const registerReveal = useCallback((reveal: ((line: number) => void) | null) => {
    revealLine.current = reveal;
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
  /** El mdast precalculado sólo vale si el texto mostrado ES el `content` guardado y no hay bloque protegido (§10.4, P-6). */
  const savedPreparsed = note !== null && prefix === "" && draft === note.content ? preparsed : null;
  /** Lo que ve la vista Visual: el cuerpo sin el bloque heredado protegido (P-6; el bloque se re-antepone al emitir). */
  const visualValue = prefix !== "" && draft.startsWith(prefix) ? draft.slice(prefix.length) : draft;

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
        setPrefix("");
        setLegacyNotice(null);
        setMode(editOnOpenRef.current ? "edit" : "read");
        setFocusEditor(editOnOpenRef.current);
        setView("visual");
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
    setErrorLine(null);
    setError(null);
  }, []);

  /**
   * Al entrar en edición (NC-2, RF-044/RF-045): carga `frontmatter` y clasifica la nota. `migrate` →
   * la sesión parte de `{props: bloque parseado, body sin el bloque}` (aviso previo, Guardar habilitado);
   * `looks-yaml` → el bloque estricto queda protegido (`prefix`) y se avisa; `none` → nada.
   */
  const beginEdit = useCallback(async () => {
    const note = noteRef.current;
    if (note === null) return;
    const fm = await loadFm();
    if (noteRef.current !== note) return; // la nota cambió mientras cargaba el módulo
    const kind = fm.classifyLegacy(note.frontmatter, note.content);
    setFormKey((k) => k + 1); // remonta el formulario con las propiedades que fije esta clasificación
    if (kind === "migrate") {
      const { yaml, body } = fm.splitFrontmatter(note.content);
      const parsed = fm.parseFrontmatterYaml(yaml ?? "");
      const nextProps = "value" in parsed ? parsed.value : {};
      propsRef.current = nextProps;
      draftRef.current = body;
      setProps(nextProps);
      setDraft(body);
      setPrefix("");
      setLegacyNotice("migrate");
    } else if (kind === "looks-yaml") {
      const { yaml, body } = fm.splitFrontmatter(note.content);
      setPrefix(yaml === null ? "" : note.content.slice(0, note.content.length - body.length));
      setLegacyNotice("looks-yaml");
    } else {
      setPrefix("");
      setLegacyNotice(null);
    }
  }, [loadFm]);

  useEffect(() => {
    if (mode === "edit") void beginEdit();
  }, [mode, beginEdit]);

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
    // Commit de la sesión: en Código la verdad es el texto compuesto → `split`+`parse`. Un YAML inválido
    // (RF-015/017) no guarda ni cambia de vista: avisa con el motivo y la línea (+1 por el `---` de apertura).
    let body: string;
    let nextProps: Record<string, unknown>;
    if (viewRef.current === "code") {
      const fm = await loadFm();
      const split = fm.splitFrontmatter(codeTextRef.current ?? "");
      body = split.body;
      if (split.yaml === null) {
        nextProps = {};
      } else {
        const parsed = fm.parseFrontmatterYaml(split.yaml);
        if ("error" in parsed) {
          const line = parsed.line === undefined ? undefined : parsed.line + 1;
          setError(frontmatterYamlMessage(parsed.error, line));
          setErrorLine(line ?? null);
          return false;
        }
        nextProps = parsed.value;
      }
    } else {
      flushVisual.current?.();
      body = draftRef.current;
      nextProps = propsRef.current;
    }
    // RF-019: el frontmatter no puede pasar de 64 KiB; aviso con el tamaño medido, antes del almacén.
    if (checkFrontmatter(nextProps) !== null) {
      setError(frontmatterTooLargeMessage(new TextEncoder().encode(JSON.stringify(nextProps)).length));
      return false;
    }
    if (body === current.content && canonical(nextProps) === canonical(current.frontmatter)) return true; // nada que guardar
    // Aviso inmediato: el almacén también valida, pero así no hay ida y vuelta.
    if (checkContent(body) !== null) {
      setError(noteErrorMessage(new NoteValidationError(["content"])));
      return false;
    }
    setSaving(true);
    setError(null);
    setErrorLine(null);
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
      // NC-2 (RF-044): al guardar una migración, el bloque ya está fuera del texto; avísalo.
      if (legacyNoticeRef.current === "migrate") setLegacyNotice("moved");
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
  // RF-008: una nota con ruta inválida (sembrada por una réplica vieja) se abre y se lee, pero no se
  // guarda ni se borra hasta renombrarla; el aviso ofrece «Renombrar» (lo atiende la sidebar).
  const pathInvalid = checkPath(note.path) !== null;

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
          {pathInvalid && (
            <div className="note-editor-notice" role="alert">
              <p>La ruta de esta nota no es válida. Renómbrala para poder guardarla o borrarla.</p>
              <button type="button" onClick={() => onRename?.()}>
                Renombrar
              </button>
            </div>
          )}
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
          {mode === "edit" && legacyNotice === "migrate" && (
            <p className="note-editor-notice" role="status">
              El inicio de la nota es YAML heredado: sus propiedades se moverán a los metadatos al guardar.
            </p>
          )}
          {mode === "edit" && legacyNotice === "moved" && (
            <p className="note-editor-notice" role="status">
              Las propiedades se movieron fuera del texto.
            </p>
          )}
          {mode === "edit" && legacyNotice === "looks-yaml" && (
            <div className="note-editor-notice" role="status">
              <p>El inicio de la nota parece YAML, pero no se trata como propiedades (ya hay metadatos o el bloque no es válido).</p>
              {prefix !== "" && <pre className="note-editor-legacy-block">{prefix}</pre>}
            </div>
          )}
          {error && (
            <p role="alert">
              {error}
              {errorLine !== null && (
                <>
                  {" "}
                  <button type="button" className="note-editor-reveal" onClick={() => revealLine.current?.(errorLine)}>
                    Ir a la línea {errorLine}
                  </button>
                </>
              )}
            </p>
          )}
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
          {mode === "edit" && view === "visual" && <PropertiesForm key={`${note.rev}-${formKey}`} frontmatter={props} onChange={onProps} />}

          {mode === "read" ? (
            <Visual value={draft} onChange={onDraft} label="Contenido de la nota" readOnly registerFlush={registerFlush} onDirty={onViewDirty} preparsedMdast={savedPreparsed} />
          ) : view === "visual" ? (
            <Visual value={visualValue} onChange={onDraft} label="Editor visual" readOnly={false} registerFlush={registerFlush} onDirty={onViewDirty} autoFocus={focusEditor} preparsedMdast={savedPreparsed} prefix={prefix} />
          ) : (
            <Code value={codeText ?? ""} onChange={onCodeChange} label="Editor de código" readOnly={false} autoFocus={focusEditor} errorLine={errorLine} registerReveal={registerReveal} />
          )}
        </div>
      </div>
    </section>
  );
});

export default NoteEditor;
