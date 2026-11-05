/**
 * Vista de un documento de la BITACORA (H-030b): el servidor genera cada documento diario desde su registro de
 * cambios y nadie lo edita, ni el usuario ni los agentes. Se muestra de solo lectura, sin editor ni menús de
 * edición; el texto se actualiza solo cuando la réplica trae una revisión nueva del día.
 */
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { noteErrorMessage } from "./messages";
import type { Note, NoteStore } from "./noteStore";
import type { NoteRef } from "../editor/wikilink";
import type { PaletteKey } from "../vaults/vaultIcon";

const MilkdownView = lazy(() => import("../editor/MilkdownView").then((module) => ({ default: module.MilkdownView })));

export interface BitacoraViewProps {
  noteId: string;
  notes: NoteStore;
  notesVersion: number;
  vaultColor: PaletteKey;
  noteRefs: readonly NoteRef[];
  onOpenWikilink: (link: { resolvedId: string | null; target: string }) => void;
  sidebarToggle?: ReactNode;
}

export default function BitacoraView({ noteId, notes, notesVersion, vaultColor, noteRefs, onOpenWikilink, sidebarToggle }: BitacoraViewProps) {
  const [note, setNote] = useState<Note | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void notes
      .get(noteId)
      .then((current) => alive && setNote(current))
      .catch((err) => alive && setError(noteErrorMessage(err)));
    return () => {
      alive = false;
    };
  }, [notes, noteId, notesVersion]);

  const title = typeof note?.frontmatter.titulo === "string" && note.frontmatter.titulo ? note.frontmatter.titulo : "Bitácora";

  return (
    <section className="note-editor bitacora-view" aria-label={title}>
      <header className="note-editor-header bitacora-view-header">
        {sidebarToggle}
        <h2 className="bitacora-view-title">{title}</h2>
        <span className="bitacora-view-badge">Solo lectura · la escribe el servidor</span>
      </header>
      <div className="note-editor-body">
        <div className="note-editor-column">
          {error && (
            <p className="note-editor-notice" role="alert">
              {error}
            </p>
          )}
          <Suspense fallback={<p>Cargando la bitácora…</p>}>
            {note !== null && (
              <MilkdownView
                key={`${noteId}:${note.rev}`}
                value={note.content}
                onChange={() => undefined}
                readOnly
                label={title}
                notes={noteRefs}
                onWikilinkClick={onOpenWikilink}
                vaultColor={vaultColor}
              />
            )}
          </Suspense>
        </div>
      </div>
    </section>
  );
}
