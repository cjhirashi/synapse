/**
 * Vista de un INDICE (H-031): el cuerpo se genera desde las notas de la bóveda y no se edita; lo único que se
 * guarda es la `descripcion` de sus atributos. Las columnas generales siempre se ven; las demás se muestran u
 * ocultan y la preferencia se recuerda por dispositivo, usuario y bóveda.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { renderIndexBody } from "./indexBody";
import { folderOf } from "./indexRules";
import { noteErrorMessage } from "./messages";
import type { Note, NoteStore } from "./noteStore";
import type { NoteRef } from "../editor/wikilink";
import type { PaletteKey } from "../vaults/vaultIcon";

const MilkdownView = lazy(() => import("../editor/MilkdownView").then((module) => ({ default: module.MilkdownView })));

const GENERAL = new Set(["titulo", "descripcion", "estado", "tags", "fecha_creacion", "fecha_actualizacion"]);
const DESCRIPCION_MAX = 1000;

const columnsKey = (userId: string | null, vaultId: string) => `synapse.indexcols.${userId ?? "anon"}.${vaultId}`;

function readColumns(userId: string | null, vaultId: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(columnsKey(userId, vaultId)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === "string").slice(0, 100) : [];
  } catch {
    return [];
  }
}

export interface IndexViewProps {
  noteId: string;
  vault: { id: string; name: string };
  notes: NoteStore;
  notesVersion: number;
  userId: string | null;
  vaultColor: PaletteKey;
  noteRefs: readonly NoteRef[];
  onOpenWikilink: (link: { resolvedId: string | null; target: string }) => void;
  sidebarToggle?: ReactNode;
}

export default function IndexView({ noteId, vault, notes, notesVersion, userId, vaultColor, noteRefs, onOpenWikilink, sidebarToggle }: IndexViewProps) {
  const [note, setNote] = useState<Note | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [available, setAvailable] = useState<string[]>([]);
  const [shown, setShown] = useState<string[]>(() => readColumns(userId, vault.id));
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const current = await notes.get(noteId);
      const active = (await notes.list(vault.id)).filter((item) => item.deleted_at === null);
      if (!alive) return;
      const keys = new Set<string>();
      for (const item of active) for (const key of Object.keys(item.frontmatter ?? {})) if (!GENERAL.has(key)) keys.add(key);
      setNote(current);
      setAvailable([...keys].sort());
      setBody(renderIndexBody(vault.name, folderOf(current.path), active, shown.filter((key) => keys.has(key))));
    })().catch((err) => alive && setError(noteErrorMessage(err)));
    return () => {
      alive = false;
    };
  }, [notes, noteId, vault.id, vault.name, notesVersion, shown]);

  const toggleColumn = useCallback(
    (key: string) => {
      setShown((previous) => {
        const next = previous.includes(key) ? previous.filter((item) => item !== key) : [...previous, key];
        try {
          localStorage.setItem(columnsKey(userId, vault.id), JSON.stringify(next));
        } catch {
          // Sin almacenamiento local la preferencia dura lo que dure la vista.
        }
        return next;
      });
    },
    [userId, vault.id],
  );

  const saved = typeof note?.frontmatter.descripcion === "string" ? note.frontmatter.descripcion : "";
  const text = draft ?? saved;
  const dirty = draft !== null && draft !== saved;

  async function save() {
    if (!note || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await notes.save(note.id, "", note.rev, { ...note.frontmatter, descripcion: text });
      setNote(updated);
      setDraft(null);
    } catch (err) {
      setError(noteErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const label = useMemo(() => (note ? `Índice de ${folderOf(note.path).split("/").at(-1) || vault.name}` : "Índice"), [note, vault.name]);

  return (
    <section className="note-editor index-view" aria-label={label}>
      <header className="note-editor-header index-view-header">
        {sidebarToggle}
        <h2 className="index-view-title">{label}</h2>
      </header>
      <div className="note-editor-body">
        <div className="note-editor-column">
          {error && (
            <p className="note-editor-notice" role="alert">
              {error}
            </p>
          )}
          <div className="index-view-description">
            <label htmlFor="index-description">Descripción</label>
            <textarea
              id="index-description"
              value={text}
              maxLength={DESCRIPCION_MAX}
              rows={2}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button type="button" onClick={() => void save()} disabled={!dirty || saving}>
              {saving ? "Guardando…" : "Guardar descripción"}
            </button>
          </div>
          {available.length > 0 && (
            <details className="index-view-columns">
              <summary>Columnas adicionales ({shown.filter((key) => available.includes(key)).length} de {available.length})</summary>
              <div className="index-view-columns-list" role="group" aria-label="Columnas adicionales">
                {available.map((key) => (
                  <label key={key}>
                    <input type="checkbox" checked={shown.includes(key)} onChange={() => toggleColumn(key)} />
                    {key}
                  </label>
                ))}
              </div>
            </details>
          )}
          <Suspense fallback={<p>Cargando el índice…</p>}>
            {body !== null && (
              <MilkdownView
                key={noteId}
                value={body}
                onChange={() => undefined}
                readOnly
                label={label}
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
