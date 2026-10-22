/**
 * Conflicto de una nota (SPEC-0008 RF-009; ADR-001): las dos versiones en texto plano (ruta,
 * contenido y estado) y un botón "Quedarme con esta" en cada una. Nunca se elige por fecha ni
 * se mezcla el texto: la UI fina (diff, combinación) queda para después (decisión de Carlos).
 *
 * El contenido va en `<pre>` como texto, nunca como markdown ni HTML. Elegir una versión
 * llama a `resolveConflict` con sus datos: `conflicts.ts` los valida, los escribe como hija de
 * la ganadora y cierra la rama perdedora; el push vuelve a validarlos.
 */
import { useState } from "react";
import type { ConflictsStore, NoteConflict } from "../sync/conflicts";
import { VaultChangedError } from "../sync/vaultStore";
import { noteErrorMessage } from "./messages";
import { NoteValidationError } from "./errors";
import type { NoteBody } from "./mergeNote";

interface NoteConflictCardProps {
  conflict: NoteConflict;
  /** `resolveConflict` de la sincronización. */
  resolve: ConflictsStore["resolve"];
  /** Se guardó la resolución de la nota (con la ruta elegida). */
  onResolved: (path: string) => void;
  /** El conflicto cambió mientras se resolvía (otra pestaña, otra versión llegada). */
  onChanged: () => void;
}

const SAVE_FAILED = "No se pudo guardar la resolución. Inténtalo de nuevo.";

export default function NoteConflictCard({ conflict, resolve, onResolved, onChanged }: NoteConflictCardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function keep(doc: NoteBody) {
    setBusy(true);
    setError(null);
    try {
      await resolve(conflict.id, conflict.loser.rev, {
        path: doc.path,
        content: doc.content,
        frontmatter: doc.frontmatter,
        deleted_at: doc.deleted_at,
      });
      onResolved(doc.path);
    } catch (err) {
      if (err instanceof VaultChangedError) {
        // La lista de conflictos ya refleja el estado nuevo.
        onChanged();
      } else {
        // Datos que no cumplen las reglas, o un fallo del almacén que sólo se puede reintentar.
        setError(err instanceof NoteValidationError ? noteErrorMessage(err) : SAVE_FAILED);
      }
    } finally {
      setBusy(false);
    }
  }

  function version(label: string, doc: NoteBody) {
    return (
      <section aria-label={label} className="note-conflict-version">
        <h3>{label}</h3>
        <p>Ruta</p>
        <pre>{doc.path}</pre>
        <p>Estado: {doc.deleted_at ? "En la papelera" : "Activa"}</p>
        <p>Contenido</p>
        <pre>{doc.content}</pre>
        <button type="button" onClick={() => void keep(doc)} disabled={busy}>
          Quedarme con esta
        </button>
      </section>
    );
  }

  return (
    <article aria-label={`Conflicto en «${conflict.winner.doc.path}»`} className="note-conflict">
      <h2>«{conflict.winner.doc.path}»</h2>
      <p>Esta nota se cambió en dos sitios a la vez. Elige la versión que quieres conservar.</p>
      <div className="note-conflict-versions">
        {version("Versión A", conflict.winner.doc)}
        {version("Versión B", conflict.loser.doc)}
      </div>
      {error && <p role="alert">{error}</p>}
    </article>
  );
}
