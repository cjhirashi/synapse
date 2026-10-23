/**
 * Papelera de notas **de esta bóveda** (SPEC-0008 RF-010, RF-017; PLAN-0008 §2.6): las notas
 * con `deleted_at`, con "Restaurar". Restaurar vuelve a competir por la ruta con las notas
 * activas (RF-013): si está ocupada se avisa y la nota sigue en la papelera. No se mezcla con
 * la papelera de bóvedas (`/vaults/trash`).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useSync } from "../sync/useSync";
import { noteErrorMessage } from "./messages";
import type { NoteSummary } from "./noteStore";

interface NoteTrashProps {
  vaultId: string;
  /** La nota volvió al árbol (el padre puede abrirla o refrescar). */
  onRestored: (id: string) => void;
  onClose: () => void;
}

/** Destino de foco: el botón «Volver a las notas». */
const BACK = "back";

export default function NoteTrash({ vaultId, onRestored, onClose }: NoteTrashProps) {
  const { notes, notesVersion } = useSync();
  const [items, setItems] = useState<NoteSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Anuncio de lo restaurado (U-8): región `status` siempre presente para que se lea al cambiar su texto. */
  const [announcement, setAnnouncement] = useState("");
  /** A dónde va el foco tras restaurar: el id de una fila vecina o `BACK` («Volver a las notas»). */
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const backButton = useRef<HTMLButtonElement>(null);

  const reload = useCallback(async () => {
    setItems(await notes.list(vaultId, { deleted: true }));
  }, [notes, vaultId]);

  useEffect(() => {
    let alive = true;
    void notes.list(vaultId, { deleted: true }).then((list) => {
      if (alive) setItems(list);
    });
    return () => {
      alive = false;
    };
  }, [notes, vaultId, notesVersion]);

  // La fila restaurada desaparece y con ella el foco: va al siguiente «Restaurar», si no al anterior y,
  // si no queda ninguno, a «Volver a las notas» (U-8). Se espera a que termine la operación: los botones
  // están deshabilitados mientras `busy` y un botón deshabilitado no admite foco.
  useEffect(() => {
    if (focusTarget === null || busy) return;
    (focusTarget === BACK ? backButton.current : buttons.current.get(focusTarget))?.focus();
    setFocusTarget(null);
  }, [focusTarget, busy, items]);

  async function restore(note: NoteSummary) {
    setBusy(true);
    setError(null);
    try {
      const index = items?.findIndex((item) => item.id === note.id) ?? -1;
      const neighbour = items?.[index + 1] ?? items?.[index - 1];
      await notes.restore(note.id, note.rev);
      await reload();
      setAnnouncement(`Restaurada «${note.path}»`);
      setFocusTarget(neighbour?.id ?? BACK);
      onRestored(note.id);
    } catch (err) {
      setError(noteErrorMessage(err));
      // Revisión desfasada o nota ya restaurada en otra pestaña: se muestra el estado real.
      void reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="note-trash">
      <div className="page-header">
        <h2>Papelera de la bóveda</h2>
        <button ref={backButton} type="button" onClick={onClose}>
          Volver a las notas
        </button>
      </div>
      <p role="status">
        {announcement}
      </p>
      {error && <p role="alert">{error}</p>}
      {items === null ? (
        <p>Cargando…</p>
      ) : items.length === 0 ? (
        <p>La papelera de esta bóveda está vacía.</p>
      ) : (
        <ul className="card-list" aria-label="Notas borradas">
          {items.map((note) => (
            <li key={note.id}>
              <span>{note.path}</span>{" "}
              <button
                type="button"
                ref={(el) => {
                  if (el) buttons.current.set(note.id, el);
                  else buttons.current.delete(note.id);
                }}
                aria-label={`Restaurar «${note.path}»`}
                onClick={() => void restore(note)}
                disabled={busy}
              >
                Restaurar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
