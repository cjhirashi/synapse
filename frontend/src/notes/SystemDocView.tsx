/**
 * Vista de un documento de sistema (H-041): la skill global y `plantilla-skill` los publica Synapse en todas las
 * bóvedas y nadie los modifica desde la app (`sistema:readonly`). Se abren de solo lectura, sin editor ni formulario;
 * el texto se actualiza solo cuando la réplica trae la versión nueva. Si es una plantilla, muestra su definición.
 */
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { noteErrorMessage, noteReasonText } from "./messages";
import { templateName } from "./metaRules";
import type { Note, NoteStore } from "./noteStore";
import type { NoteRef } from "../editor/wikilink";
import type { PaletteKey } from "../vaults/vaultIcon";

const MilkdownView = lazy(() => import("../editor/MilkdownView").then((module) => ({ default: module.MilkdownView })));

export interface SystemDocViewProps {
  noteId: string;
  notes: NoteStore;
  notesVersion: number;
  vaultColor: PaletteKey;
  noteRefs: readonly NoteRef[];
  onOpenWikilink: (link: { resolvedId: string | null; target: string }) => void;
  sidebarToggle?: ReactNode;
}

function definitionSummary(note: Note): { where: string; attributes: string } | null {
  if (templateName(note.path) === null) return null;
  const alcance = Array.isArray(note.frontmatter.alcance) ? note.frontmatter.alcance.filter((a): a is string => typeof a === "string") : [];
  const attrs = Array.isArray(note.frontmatter.atributos) ? note.frontmatter.atributos : [];
  const names = attrs.flatMap((item) => {
    const { nombre, tipo } = (item ?? {}) as { nombre?: unknown; tipo?: unknown };
    return typeof nombre === "string" ? [`${nombre} (${typeof tipo === "string" ? tipo : "texto"})`] : [];
  });
  return {
    where: alcance.includes("*") ? "toda la bóveda" : alcance.join(", "),
    attributes: names.length > 0 ? names.join(", ") : "ninguno",
  };
}

export default function SystemDocView({ noteId, notes, notesVersion, vaultColor, noteRefs, onOpenWikilink, sidebarToggle }: SystemDocViewProps) {
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

  const title = typeof note?.frontmatter.titulo === "string" && note.frontmatter.titulo ? note.frontmatter.titulo : "Documento de sistema";
  const version = typeof note?.frontmatter.version === "string" ? note.frontmatter.version : null;
  const summary = note ? definitionSummary(note) : null;

  return (
    <section className="note-editor system-doc-view" aria-label={title}>
      <header className="note-editor-header system-doc-view-header">
        {sidebarToggle}
        <h2 className="system-doc-view-title">{title}</h2>
        <span className="system-doc-view-badge" title={noteReasonText("sistema:readonly")}>
          Documento de sistema · solo lectura{version ? ` · v${version}` : ""}
        </span>
      </header>
      <div className="note-editor-body">
        <div className="note-editor-column">
          {error && (
            <p className="note-editor-notice" role="alert">
              {error}
            </p>
          )}
          {summary && (
            <dl className="system-doc-view-definition">
              <dt>Se ofrece en</dt>
              <dd>{summary.where}</dd>
              <dt>Atributos propios</dt>
              <dd>{summary.attributes}</dd>
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
