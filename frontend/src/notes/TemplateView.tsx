/**
 * Vista de una plantilla (H-030b): `PLANTILLAS/plantilla-<nombre>.md`. Un formulario con las cuatro secciones de la
 * definición —dónde se usa, atributos opcionales, estilo y estructura base— en lugar del editor de documentos.
 * El estilo (publicar en la web y PDF) está reservado: lo definirán H-035 y H-036.
 *
 * Editar una plantilla no toca los documentos que ya nacieron de ella: conservan sus valores (P3).
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { isIndexPath } from "./indexRules";
import { isMetaFolderPath } from "./metaFolders";
import { checkDefinition, templateName, TIPOS } from "./metaRules";
import { noteErrorMessage, noteReasonText } from "./messages";
import type { Note, NoteStore } from "./noteStore";

type Tipo = (typeof TIPOS)[number];
interface AttrRow {
  nombre: string;
  tipo: Tipo;
  valor: string;
}

const TIPO_LABEL: Record<Tipo, string> = {
  texto: "Texto",
  numero: "Número",
  fecha: "Fecha",
  lista: "Lista (separada por comas)",
  booleano: "Sí / No",
};

function toRows(raw: unknown): AttrRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const { nombre, tipo, valor } = item as { nombre?: unknown; tipo?: unknown; valor?: unknown };
    if (typeof nombre !== "string" || !TIPOS.includes(tipo as Tipo)) return [];
    const text = valor === undefined || valor === null ? "" : Array.isArray(valor) ? valor.join(", ") : String(valor);
    return [{ nombre, tipo: tipo as Tipo, valor: text }];
  });
}

function toAttributes(rows: AttrRow[]): Array<{ nombre: string; tipo: Tipo; valor?: unknown }> {
  return rows.map(({ nombre, tipo, valor }) => {
    const base = { nombre: nombre.trim(), tipo };
    const text = valor.trim();
    if (text === "") return base;
    if (tipo === "numero") return Number.isNaN(Number(text)) ? { ...base, valor: text } : { ...base, valor: Number(text) };
    if (tipo === "lista") return { ...base, valor: text.split(",").map((item) => item.trim()).filter(Boolean) };
    if (tipo === "booleano") return { ...base, valor: text === "true" };
    return { ...base, valor: text };
  });
}

export interface TemplateViewProps {
  noteId: string;
  vault: { id: string; name: string };
  notes: NoteStore;
  notesVersion: number;
  sidebarToggle?: ReactNode;
}

export default function TemplateView({ noteId, vault, notes, notesVersion, sidebarToggle }: TemplateViewProps) {
  const [note, setNote] = useState<Note | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [all, setAll] = useState(true);
  const [alcance, setAlcance] = useState<string[]>([]);
  const [rows, setRows] = useState<AttrRow[]>([]);
  const [estructura, setEstructura] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const current = await notes.get(noteId);
      const active = (await notes.list(vault.id)).filter((item) => item.deleted_at === null);
      if (!alive) return;
      const found = new Set<string>();
      for (const item of active) {
        if (isIndexPath(item.path)) continue;
        const parts = item.path.split("/").slice(0, -1);
        for (let i = 1; i <= parts.length; i += 1) found.add(parts.slice(0, i).join("/"));
      }
      setFolders([...found].filter((path) => !isMetaFolderPath(path.split("/")[0])).sort());
      setNote(current);
    })().catch((err) => alive && setError(noteErrorMessage(err)));
    return () => {
      alive = false;
    };
  }, [notes, noteId, vault.id, notesVersion]);

  // Un cambio de la nota abierta (de fuera) sustituye el formulario solo si el usuario no tiene cambios sin guardar.
  useEffect(() => {
    if (note === null || dirty) return;
    const fm = note.frontmatter;
    const scope = Array.isArray(fm.alcance) ? fm.alcance.filter((item): item is string => typeof item === "string") : ["*"];
    setTitulo(typeof fm.titulo === "string" ? fm.titulo : "");
    setDescripcion(typeof fm.descripcion === "string" ? fm.descripcion : "");
    setAll(scope.includes("*"));
    setAlcance(scope.filter((item) => item !== "*"));
    setRows(toRows(fm.atributos));
    setEstructura(note.content);
  }, [note, dirty]);

  const name = note ? templateName(note.path) : null;
  const edit = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setDirty(true);
  };

  const options = useMemo(() => [...new Set([...folders, ...alcance])].sort(), [folders, alcance]);

  function toggleFolder(path: string) {
    edit(setAlcance)(alcance.includes(path) ? alcance.filter((item) => item !== path) : [...alcance, path]);
  }

  function updateRow(index: number, changes: Partial<AttrRow>) {
    edit(setRows)(rows.map((row, i) => (i === index ? { ...row, ...changes } : row)));
  }

  async function save() {
    if (!note) return;
    const frontmatter = {
      ...note.frontmatter,
      titulo,
      descripcion,
      alcance: all ? ["*"] : alcance,
      atributos: toAttributes(rows),
      estilo: { publicar: {}, pdf: {} },
    };
    const code = checkDefinition(frontmatter);
    if (code !== null) {
      setError(noteReasonText(code));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await notes.save(note.id, estructura, note.rev, frontmatter);
      setDirty(false);
      setNote(updated);
    } catch (err) {
      setError(noteErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const label = name ? `Plantilla ${name}` : "Plantilla";
  return (
    <section className="note-editor template-view" aria-label={label}>
      <header className="note-editor-header template-view-header">
        {sidebarToggle}
        <h2 className="template-view-title">{label}</h2>
        <button type="button" onClick={() => void save()} disabled={!dirty || saving}>
          {saving ? "Guardando…" : "Guardar plantilla"}
        </button>
      </header>
      <div className="note-editor-body">
        <div className="note-editor-column template-view-form">
          {error && (
            <p className="note-editor-notice" role="alert">
              {error}
            </p>
          )}
          <p className="template-view-hint">
            Editar la plantilla no cambia los documentos que ya nacieron de ella: conservan sus valores.
          </p>
          <div className="template-view-general">
            <label>
              Título
              <input value={titulo} maxLength={200} onChange={(event) => edit(setTitulo)(event.target.value)} />
            </label>
            <label>
              Descripción
              <textarea value={descripcion} maxLength={1000} rows={2} onChange={(event) => edit(setDescripcion)(event.target.value)} />
            </label>
          </div>

          <fieldset className="template-view-section">
            <legend>1. Dónde se usa</legend>
            <label>
              <input type="radio" name="alcance" checked={all} onChange={() => edit(setAll)(true)} />
              En toda la bóveda
            </label>
            <label>
              <input type="radio" name="alcance" checked={!all} onChange={() => edit(setAll)(false)} />
              Solo en estas carpetas
            </label>
            {!all && (
              <div className="template-view-folders" role="group" aria-label="Carpetas donde se ofrece la plantilla">
                {options.length === 0 && <p>La bóveda aún no tiene carpetas.</p>}
                {options.map((path) => (
                  <label key={path}>
                    <input type="checkbox" checked={alcance.includes(path)} onChange={() => toggleFolder(path)} />
                    {path}
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <fieldset className="template-view-section">
            <legend>2. Atributos opcionales</legend>
            <p className="template-view-hint">
              Además de los atributos generales (título, descripción, etiquetas, estado y fechas) que todo documento ya tiene.
            </p>
            {rows.map((row, index) => (
              <div className="template-view-attr" key={index} role="group" aria-label={`Atributo ${index + 1}`}>
                <input
                  aria-label={`Nombre del atributo ${index + 1}`}
                  placeholder="nombre_en_minusculas"
                  value={row.nombre}
                  onChange={(event) => updateRow(index, { nombre: event.target.value })}
                />
                <select
                  aria-label={`Tipo del atributo ${index + 1}`}
                  value={row.tipo}
                  onChange={(event) => updateRow(index, { tipo: event.target.value as Tipo, valor: "" })}
                >
                  {TIPOS.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {TIPO_LABEL[tipo]}
                    </option>
                  ))}
                </select>
                {row.tipo === "booleano" ? (
                  <select
                    aria-label={`Valor inicial del atributo ${index + 1}`}
                    value={row.valor}
                    onChange={(event) => updateRow(index, { valor: event.target.value })}
                  >
                    <option value="">Sin valor inicial</option>
                    <option value="true">Sí</option>
                    <option value="false">No</option>
                  </select>
                ) : (
                  <input
                    aria-label={`Valor inicial del atributo ${index + 1}`}
                    type={row.tipo === "numero" ? "number" : row.tipo === "fecha" ? "date" : "text"}
                    placeholder="Valor inicial (opcional)"
                    value={row.valor}
                    onChange={(event) => updateRow(index, { valor: event.target.value })}
                  />
                )}
                <button type="button" onClick={() => edit(setRows)(rows.filter((_, i) => i !== index))}>
                  Quitar
                </button>
              </div>
            ))}
            <button type="button" onClick={() => edit(setRows)([...rows, { nombre: "", tipo: "texto", valor: "" }])}>
              Añadir atributo
            </button>
          </fieldset>

          <fieldset className="template-view-section" disabled>
            <legend>3. Estilo</legend>
            <p className="template-view-hint">
              Reservado: cuando existan la publicación en la web y la descarga en PDF, aquí se definirá cómo se ven.
            </p>
            <label>
              Publicar en la web
              <input value="Próximamente" readOnly />
            </label>
            <label>
              Descargar como PDF
              <input value="Próximamente" readOnly />
            </label>
          </fieldset>

          <fieldset className="template-view-section">
            <legend>4. Estructura base</legend>
            <label>
              Markdown con el que nace cada documento nuevo (encabezados y contenido de partida)
              <textarea
                className="template-view-structure"
                value={estructura}
                rows={14}
                spellCheck={false}
                onChange={(event) => edit(setEstructura)(event.target.value)}
              />
            </label>
          </fieldset>
        </div>
      </div>
    </section>
  );
}

