/**
 * Papelera de notas **de esta bóveda** (SPEC-0008 RF-010, RF-017; PLAN-0008 §2.6): las notas
 * con `deleted_at`, con "Restaurar". Restaurar vuelve a competir por la ruta con las notas
 * activas (RF-013): si está ocupada se avisa y la nota sigue en la papelera. No se mezcla con
 * la papelera de bóvedas (`/vaults/trash`).
 */
import { useCallback, useEffect, useState } from "react";
import { useSync } from "../sync/useSync";
import { noteErrorMessage } from "./messages";
import type { NoteSummary } from "./noteStore";

interface NoteTrashProps {
  vaultId: string;
  /** La nota volvió al árbol (el padre puede abrirla o refrescar). */
  onRestored: (id: string) => void;
  onClose: () => void;
}

export default function NoteTrash({ vaultId, onRestored, onClose }: NoteTrashProps) {
  const { notes, notesVersion } = useSync();
  const [items, setItems] = useState<NoteSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  async function restore(note: NoteSummary) {
    setBusy(true);
    setError(null);
    try {
      await notes.restore(note.id, note.rev);
      await reload();
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
        <button type="button" onClick={onClose}>
          Volver a las notas
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {items === null ? (
        <p>Cargando…</p>
      ) : items.length === 0 ? (
        <p>La papelera de esta bóveda está vacía.</p>
      ) : (
        <ul aria-label="Notas borradas">
          {items.map((note) => (
            <li key={note.id}>
              <span>{note.path}</span>{" "}
              <button type="button" aria-label={`Restaurar «${note.path}»`} onClick={() => void restore(note)} disabled={busy}>
                Restaurar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
