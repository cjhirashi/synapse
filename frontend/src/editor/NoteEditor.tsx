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
import { Link, useBlocker } from "react-router-dom";
import { checkContent } from "../notes/noteRules";
import { NoteNotFoundError, NoteValidationError } from "../notes/errors";
import { noteErrorMessage } from "../notes/messages";
import type { Note } from "../notes/noteStore";
import { useSync } from "../sync/useSync";
import { CodeView } from "./CodeView";
import { MilkdownView } from "./MilkdownView";
import "./editor.css";

/** Contrato común de las dos vistas del markdown (reales o falsas en las pruebas). */
export interface ViewProps {
  value: string;
  onChange: (value: string) => void;
  /** Nombre accesible del área de texto. */
  label: string;
  readOnly: boolean;
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
}

/** Lo que el padre puede pedirle al editor por `ref`. */
export interface NoteEditorHandle {
  /** ¿Se puede descartar el borrador? Sin cambios, sí al instante; con cambios, pregunta al usuario. */
  confirmDiscard(): Promise<boolean>;
}

type Mode = "read" | "edit";
type View = "visual" | "code";

/** Nombre mostrado: la ruta sin la extensión `.md`, como en el árbol. */
function title(path: string): string {
  return path.replace(/\.md$/i, "");
}

const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(function NoteEditor(
  { noteId, editOnOpen = false, onCancelOpen, views = REAL_VIEWS },
  ref,
) {
  const { notes, notesVersion, conflicts } = useSync();
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
  const [mode, setMode] = useState<Mode>("read");
  const [view, setView] = useState<View>("visual");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = note !== null && draft !== note.content;
  /** Bloquea la navegación interna mientras haya cambios sin guardar (VF-1). */
  const blocker = useBlocker(dirty);

  // Lo que los efectos y los manejadores de eventos necesitan sin volver a crearse.
  const noteRef = useRef(note);
  noteRef.current = note;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const editOnOpenRef = useRef(editOnOpen);
  editOnOpenRef.current = editOnOpen;

  useImperativeHandle(
    ref,
    () => ({
      confirmDiscard: () =>
        dirtyRef.current ? new Promise<boolean>((answer) => setDiscardAsk({ answer })) : Promise.resolve(true),
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
    notes.get(openId).then(
      (loaded) => {
        if (!alive) return;
        setNote(loaded);
        setDraft(loaded.content);
        setMode(editOnOpenRef.current ? "edit" : "read");
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
        if (!dirtyRef.current) {
          setNote(latest);
          setDraft(latest.content);
          setMissing(false);
        } else if (latest.content === base.content) {
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
    } else if (dirtyRef.current) {
      setPendingId(noteId);
    } else {
      setOpenId(noteId);
    }
  }, [noteId, openId]);

  // Aviso del navegador al cerrar o recargar con cambios sin guardar.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Algunos navegadores sólo muestran el aviso si hay `returnValue`.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const onDraft = useCallback((value: string) => {
    setDraft(value);
    setSaved(false);
  }, []);

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
      setNote(await notes.save(current.id, draftRef.current, restored.rev));
      setMissing(false);
      setSaved(true);
    } catch (err) {
      setError(noteErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  /** Guarda el borrador; devuelve si quedó guardado. Un error se muestra y deja el borrador. */
  async function save(): Promise<boolean> {
    const current = noteRef.current;
    if (current === null) return false;
    if (!dirtyRef.current) return true;
    // Aviso inmediato: el almacén también lo valida, pero así no hay ida y vuelta.
    if (checkContent(draft) !== null) {
      setError(noteErrorMessage(new NoteValidationError(["content"])));
      return false;
    }
    setSaving(true);
    setError(null);
    try {
      setNote(await notes.save(current.id, draft, current.rev));
      setSaved(true);
      return true;
    } catch (err) {
      setError(noteErrorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
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
      <header className="note-editor-header">
        <h2>{title(note.path)}</h2>
        <div className="note-editor-toolbar">
          {mode === "edit" && (
            <div role="group" aria-label="Vista del editor" className="note-editor-views">
              <button type="button" aria-pressed={view === "visual"} onClick={() => setView("visual")}>
                Visual
              </button>
              <button type="button" aria-pressed={view === "code"} onClick={() => setView("code")}>
                Código
              </button>
            </div>
          )}
          {mode === "edit" && (
            <button type="button" onClick={() => void save()} disabled={saving || !dirty}>
              Guardar
            </button>
          )}
          {mode === "read" ? (
            <button type="button" onClick={() => setMode("edit")}>
              Editar
            </button>
          ) : (
            <button type="button" onClick={() => void leave()} disabled={saving}>
              Leer
            </button>
          )}
          <span className="note-editor-state" role="status">
            {dirty ? "Cambios sin guardar" : saved ? "Guardado" : ""}
          </span>
        </div>
      </header>

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
        <div role="alertdialog" aria-labelledby="note-switch-title" className="note-editor-confirm">
          <p id="note-switch-title">Esta nota tiene cambios sin guardar.</p>
          <button type="button" onClick={() => void saveAndOpen()} disabled={saving}>
            Guardar y abrir
          </button>
          <button type="button" onClick={discardAndOpen}>
            Descartar y abrir
          </button>
          <button type="button" onClick={keepEditing}>
            Seguir editando
          </button>
        </div>
      )}

      {blocker.state === "blocked" && (
        <div role="alertdialog" aria-labelledby="note-leave-title" className="note-editor-confirm">
          <p id="note-leave-title">Esta nota tiene cambios sin guardar.</p>
          <button type="button" onClick={() => void saveAndLeave()} disabled={saving}>
            Guardar y salir
          </button>
          <button type="button" onClick={() => blocker.proceed()}>
            Descartar y salir
          </button>
          <button type="button" onClick={() => blocker.reset()}>
            Seguir editando
          </button>
        </div>
      )}

      {discardAsk !== null && (
        <div role="alertdialog" aria-labelledby="note-discard-title" className="note-editor-confirm">
          <p id="note-discard-title">Esta nota tiene cambios sin guardar.</p>
          <button type="button" onClick={() => answerDiscard(true)}>
            Borrar y descartar cambios
          </button>
          <button type="button" onClick={() => answerDiscard(false)}>
            Seguir editando
          </button>
        </div>
      )}

      <div className="note-editor-body">
        {mode === "read" ? (
          <Visual value={draft} onChange={onDraft} label="Contenido de la nota" readOnly />
        ) : view === "visual" ? (
          <Visual value={draft} onChange={onDraft} label="Editor visual" readOnly={false} />
        ) : (
          <Code value={draft} onChange={onDraft} label="Editor de código" readOnly={false} />
        )}
      </div>
    </section>
  );
});

export default NoteEditor;
