/**
 * Vista de un INDICE (H-031): el cuerpo se genera desde las notas de la bóveda y no se edita; lo único que se
 * guarda es la `descripcion` de sus atributos. Las columnas generales siempre se ven; las demás se muestran u
 * ocultan y la preferencia se recuerda por dispositivo, usuario y bóveda.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { indexModel, type IndexModel } from "./indexBody";
import { useVaultAccess } from "./useVaultAccess";
import IndexList from "./IndexList";
import { folderOf } from "./indexRules";
import { isInMensajes } from "./metaFolders";
import type { EstadoColor } from "./metaRules";
import { templateName } from "./metaRules";
import { noteErrorMessage } from "./messages";
import type { Note, NoteStore } from "./noteStore";
import { pathKey } from "./noteRules";
import { estadosOf } from "./useTemplateOptions";
import type { NoteRef } from "../editor/wikilink";

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
  noteRefs: readonly NoteRef[];
  onOpenWikilink: (link: { resolvedId: string | null; target: string }) => void;
  sidebarToggle?: ReactNode;
}

export default function IndexView({ noteId, vault, notes, notesVersion, userId, noteRefs, onOpenWikilink, sidebarToggle }: IndexViewProps) {
  const { canEdit } = useVaultAccess();
  const [note, setNote] = useState<Note | null>(null);
  const [model, setModel] = useState<IndexModel | null>(null);
  const [colors, setColors] = useState<ReadonlyMap<string, ReadonlyMap<string, EstadoColor>>>(new Map());
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
      setModel(indexModel(vault.name, folderOf(current.path), active));
      const byTemplate = new Map<string, ReadonlyMap<string, EstadoColor>>();
      for (const item of active) {
        const name = templateName(item.path);
        if (name !== null) byTemplate.set(name, new Map(estadosOf(item.frontmatter?.estados).map((e) => [e.nombre, e.color])));
      }
      setColors(byTemplate);
    })().catch((err) => alive && setError(noteErrorMessage(err)));
    return () => {
      alive = false;
    };
  }, [notes, noteId, vault.id, vault.name, notesVersion]);

  const colorOf = useCallback(
    (fm: Record<string, unknown>) => (typeof fm.plantilla === "string" && typeof fm.estado === "string" ? colors.get(fm.plantilla)?.get(fm.estado) : undefined),
    [colors],
  );
  const openPath = useCallback(
    (path: string) => {
      const key = pathKey(path);
      const found = noteRefs.find((ref) => pathKey(ref.path) === key);
      if (found) onOpenWikilink({ resolvedId: found.id, target: path });
    },
    [noteRefs, onOpenWikilink],
  );

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

  // H-042: el INDICE del buzón entre agentes lo mantiene el servidor; el usuario no edita ni su descripción. F7c-2: tampoco en bóvedas compartidas.
  const readOnly = note !== null && (isInMensajes(note.path) || !canEdit);
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
          {/* Quien solo lee no ve un cuadro vacío: la descripción aparece solo si existe. */}
          {(!readOnly || text !== "") && <div className="index-view-description">
            <label htmlFor="index-description">Descripción</label>
            <textarea
              id="index-description"
              value={text}
              maxLength={DESCRIPCION_MAX}
              rows={2}
              readOnly={readOnly}
              onChange={(event) => setDraft(event.target.value)}
            />
            {!readOnly && (
              <button type="button" onClick={() => void save()} disabled={!dirty || saving}>
                {saving ? "Guardando…" : "Guardar descripción"}
              </button>
            )}
          </div>}
          {available.length > 0 && !readOnly && (
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
          {model !== null && (
            <IndexList model={model} extra={shown.filter((key) => available.includes(key))} colorOf={colorOf} onOpen={openPath} />
          )}
        </div>
      </div>
    </section>
  );
}
