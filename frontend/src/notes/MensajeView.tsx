/**
 * Vista de un documento del buzón entre agentes (H-042): una conversación es una carpeta `de → para - asunto - fecha` y sus
 * documentos (mensajes y cabecera) los escriben solo los agentes. El usuario los lee: sin editor ni menús de edición.
 * Muestra de dónde viene el documento (conversación, quién lo escribió, estado) junto a su texto.
 */
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { parseMensajePath } from "./conversation";
import { noteErrorMessage, noteReasonText } from "./messages";
import type { Note, NoteStore } from "./noteStore";
import type { NoteRef } from "../editor/wikilink";
import type { PaletteKey } from "../vaults/vaultIcon";

const MilkdownView = lazy(() => import("../editor/MilkdownView").then((module) => ({ default: module.MilkdownView })));

export interface MensajeViewProps {
  noteId: string;
  notes: NoteStore;
  notesVersion: number;
  vaultColor: PaletteKey;
  noteRefs: readonly NoteRef[];
  onOpenWikilink: (link: { resolvedId: string | null; target: string }) => void;
  sidebarToggle?: ReactNode;
}

export default function MensajeView({ noteId, notes, notesVersion, vaultColor, noteRefs, onOpenWikilink, sidebarToggle }: MensajeViewProps) {
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

  const info = note ? parseMensajePath(note.path) : null;
  const fileName = note ? (note.path.split("/").pop() ?? note.path) : "";
  const title =
    typeof note?.frontmatter.titulo === "string" && note.frontmatter.titulo
      ? note.frontmatter.titulo
      : info?.kind === "cabecera"
        ? "Cabecera de la conversación"
        : fileName.replace(/\.md$/, "") || "Mensaje";
  const estado = info?.kind === "cabecera" && typeof note?.frontmatter.estado === "string" ? note.frontmatter.estado : null;

  return (
    <section className="note-editor bitacora-view mensaje-view" aria-label={title}>
      <header className="note-editor-header bitacora-view-header">
        {sidebarToggle}
        <h2 className="bitacora-view-title">{title}</h2>
        <span className="bitacora-view-badge" title={noteReasonText("ag-mensajes:agents-only")}>
          Buzón entre agentes · solo lectura
        </span>
      </header>
      <div className="note-editor-body">
        <div className="note-editor-column">
          {error && (
            <p className="note-editor-notice" role="alert">
              {error}
            </p>
          )}
          {info && info.de && (
            <dl className="system-doc-view-definition mensaje-view-facts">
              <dt>Conversación</dt>
              <dd>
                {info.de} → {info.para} · {info.asunto} · {info.inicio}
              </dd>
              {info.sender && (
                <>
                  <dt>Lo escribió</dt>
                  <dd>
                    {info.sender} (mensaje {info.number})
                  </dd>
                </>
              )}
              {estado && (
                <>
                  <dt>Estado</dt>
                  <dd>{estado}</dd>
                </>
              )}
            </dl>
          )}
          <Suspense fallback={<p>Cargando el documento…</p>}>
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
