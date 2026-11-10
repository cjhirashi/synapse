import { useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { useSync } from "../sync/useSync";
import { countTags, filterByTags, taggedNotes, type TaggedNote } from "./tagFilter";

interface Props {
  vaultId: string;
  /** Nota abierta en el editor (se marca en la lista). */
  openId: string | null;
  onOpen: (id: string) => void;
}

/**
 * Pestaña «Filtro por tags» (H-052): todos los tags de la bóveda como chips; al elegir uno o varios muestra, en lista
 * plana, solo los documentos que llevan todos los elegidos. Sin árbol. La elección no se guarda.
 */
export default function TagFilterPanel({ vaultId, openId, onOpen }: Props) {
  const { notes, notesVersion } = useSync();
  const [all, setAll] = useState<TaggedNote[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    notes
      .list(vaultId)
      .then((summaries) => {
        if (alive) setAll(taggedNotes(summaries));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [notes, notesVersion, vaultId]);

  const tags = useMemo(() => countTags(all), [all]);
  // Un tag que ya no existe en la bóveda deja de contar como elegido.
  const active = useMemo(() => selected.filter((tag) => tags.some((t) => t.tag === tag)), [selected, tags]);
  const matches = useMemo(() => filterByTags(all, active), [all, active]);

  function toggle(tag: string) {
    setSelected((current) => (current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]));
  }

  if (tags.length === 0) {
    return (
      <aside className="note-sidebar tag-filter" aria-label="Filtro por tags">
        <p className="tag-filter-empty">Esta bóveda aún no tiene tags.</p>
      </aside>
    );
  }

  return (
    <aside className="note-sidebar tag-filter" aria-label="Filtro por tags">
      <div className="tag-filter-chips" role="group" aria-label="Tags de la bóveda">
        {tags.map(({ tag, count }) => (
          <button key={tag} type="button" className="tag-chip" aria-pressed={active.includes(tag)} onClick={() => toggle(tag)}>
            <span>{tag}</span>
            <span className="tag-chip-count">{count}</span>
          </button>
        ))}
      </div>
      {active.length > 0 && (
        <button type="button" className="note-sidebar-secondary tag-filter-clear" onClick={() => setSelected([])}>
          Quitar filtro
        </button>
      )}
      <div className="tag-filter-results" aria-live="polite">
        {active.length === 0 ? (
          <p className="tag-filter-hint">Elige uno o más tags para ver los documentos.</p>
        ) : matches.length === 0 ? (
          <p className="tag-filter-hint">Ningún documento tiene todos los tags elegidos.</p>
        ) : (
          <>
            <p className="tag-filter-count">
              {matches.length} {matches.length === 1 ? "documento" : "documentos"}
            </p>
            <ul>
              {matches.map((note) => (
                <li key={note.id}>
                  <button type="button" className="tag-result" aria-current={note.id === openId ? "true" : undefined} onClick={() => onOpen(note.id)}>
                    <FileText size={14} aria-hidden="true" />
                    <span className="tag-result-text">
                      <span className="tag-result-title">{note.title}</span>
                      <span className="tag-result-path">{note.path}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}
