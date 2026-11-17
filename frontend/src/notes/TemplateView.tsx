/**
 * Vista de una plantilla (H-030b): `PLANTILLAS/plantilla-<nombre>.md`. Un formulario con las cuatro secciones de la
 * definición —dónde se usa, atributos opcionales, diseño del PDF y estructura base— en lugar del editor de documentos.
 * El diseño del PDF (H-036) vive en `PdfStyleSection`; publicar en la web queda reservado para H-035.
 *
 * Editar una plantilla no toca los documentos que ya nacieron de ella: conservan sus valores (P3).
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Folder, Plus, Trash2 } from "lucide-react";
import { isIndexPath } from "./indexRules";
import { isMetaFolderPath } from "./metaFolders";
import { checkDefinition, ESTADOS_MAX, ESTADO_COLORES, INSTRUCCIONES_MAX, templateName, TIPOS, type EstadoColor } from "./metaRules";
import { ESTADO_MAX_LEN, normalizeEstado } from "../editor/attributeRules";
import { estadosOf, type TemplateEstado } from "./useTemplateOptions";
import "../editor/estado.css";
import { noteErrorMessage, noteReasonText } from "./messages";
import type { Note, NoteStore } from "./noteStore";
import "./template-view.css";
import PdfStyleSection from "./PdfStyleSection";
import TemplateSection from "./TemplateSection";
import { DEFAULT_PDF_DRAFT, pdfDraftFrom, pdfDraftTo, type PdfDraft } from "./pdfStyle";

type Tipo = (typeof TIPOS)[number];
interface AttrRow {
  nombre: string;
  tipo: Tipo;
  valor: string;
}

const COLOR_LABEL: Record<EstadoColor, string> = { gris: "Gris", azul: "Azul", verde: "Verde", rojo: "Rojo" };

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
  const [estados, setEstados] = useState<TemplateEstado[]>([]);
  const [instrucciones, setInstrucciones] = useState("");
  const [estructura, setEstructura] = useState("");
  const [pdf, setPdf] = useState<PdfDraft>(DEFAULT_PDF_DRAFT);
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
    setEstados(estadosOf(fm.estados));
    setInstrucciones(typeof fm.instrucciones === "string" ? fm.instrucciones : "");
    const style = fm.estilo && typeof fm.estilo === "object" ? (fm.estilo as Record<string, unknown>) : {};
    setPdf(pdfDraftFrom(style.pdf));
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

  function updateEstado(index: number, changes: Partial<TemplateEstado>) {
    edit(setEstados)(estados.map((estado, i) => (i === index ? { ...estado, ...changes } : estado)));
  }

  function updateRow(index: number, changes: Partial<AttrRow>) {
    edit(setRows)(rows.map((row, i) => (i === index ? { ...row, ...changes } : row)));
  }

  async function save() {
    if (!note) return;
    // Se conserva `estilo.publicar` (H-035) tal como está guardado: aquí todavía no se edita.
    const previous = note.frontmatter?.estilo;
    const publicar = previous && typeof previous === "object" && !Array.isArray(previous) ? (previous as Record<string, unknown>).publicar ?? {} : {};
    const frontmatter = {
      ...note.frontmatter,
      titulo,
      descripcion,
      alcance: all ? ["*"] : alcance,
      atributos: toAttributes(rows),
      estados: estados
        .filter((estado) => estado.nombre.trim() !== "")
        .map((estado) => ({ nombre: normalizeEstado(estado.nombre) ?? estado.nombre.trim(), color: estado.color })),
      instrucciones,
      estilo: { publicar, pdf: pdfDraftTo(pdf) },
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
        {dirty && <span className="tv-dirty" role="status">Cambios sin guardar</span>}
        <button type="button" className="tv-save" onClick={() => void save()} disabled={!dirty || saving}>
          {saving ? "Guardando…" : "Guardar plantilla"}
        </button>
      </header>
      <div className="note-editor-body">
        <div className="note-editor-column template-view-form tv-form">
          {error && (
            <p className="note-editor-notice" role="alert">
              {error}
            </p>
          )}
          <p className="tv-banner">Editar la plantilla no cambia los documentos que ya nacieron de ella: conservan sus valores.</p>

          <section className="tv-card tv-card--plain" aria-label="Datos de la plantilla">
            <div className="tv-general">
              <label className="tv-field">
                <span>Título</span>
                <input value={titulo} maxLength={200} onChange={(event) => edit(setTitulo)(event.target.value)} />
              </label>
              <label className="tv-field">
                <span>Descripción</span>
                <textarea value={descripcion} maxLength={1000} rows={2} onChange={(event) => edit(setDescripcion)(event.target.value)} />
              </label>
            </div>
          </section>

          <TemplateSection step={1} title="Dónde se usa" description="Las carpetas donde se ofrece esta plantilla al crear un documento.">
            <div className="tv-seg" role="radiogroup" aria-label="Alcance de la plantilla">
              <label>
                <input type="radio" name="alcance" checked={all} onChange={() => edit(setAll)(true)} />
                <span>En toda la bóveda</span>
              </label>
              <label>
                <input type="radio" name="alcance" checked={!all} onChange={() => edit(setAll)(false)} />
                <span>Solo en estas carpetas</span>
              </label>
            </div>
            {!all && (
              <div className="tv-folders" role="group" aria-label="Carpetas donde se ofrece la plantilla">
                {options.length === 0 && <p className="tv-empty">La bóveda aún no tiene carpetas.</p>}
                {options.map((path) => (
                  <label key={path} className="tv-folder">
                    <input type="checkbox" checked={alcance.includes(path)} onChange={() => toggleFolder(path)} />
                    <Folder size={14} aria-hidden="true" />
                    <span>{path}</span>
                  </label>
                ))}
              </div>
            )}
          </TemplateSection>

          <TemplateSection
            step={2}
            title="Atributos opcionales"
            description="Además de los generales que todo documento ya tiene: título, descripción, etiquetas, estado y fechas."
          >
            {rows.length === 0 ? (
              <p className="tv-empty tv-empty--box">Esta plantilla no añade atributos propios.</p>
            ) : (
              <div className="tv-attrs">
                <div className="tv-attr tv-attr--head" aria-hidden="true">
                  <span>Nombre</span><span>Tipo</span><span>Valor inicial</span><span />
                </div>
                {rows.map((row, index) => (
                  <div className="tv-attr" key={index} role="group" aria-label={`Atributo ${index + 1}`}>
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
                    <button type="button" className="tv-icon-btn" aria-label={`Quitar el atributo ${index + 1}`} title="Quitar" onClick={() => edit(setRows)(rows.filter((_, i) => i !== index))}>
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button type="button" className="tv-add" onClick={() => edit(setRows)([...rows, { nombre: "", tipo: "texto", valor: "" }])}>
              <Plus size={15} aria-hidden="true" /> Añadir atributo
            </button>
            <div className="tv-estados" role="group" aria-label="Estados del documento">
              <h4>Estados del documento</h4>
              <p className="tv-empty">
                Los estados que podrá tener un documento con esta plantilla, cada uno con su color. La plantilla no trae estados de serie: sin
                estados, sus documentos quedan sin estado. Si un documento cambia a una plantilla que no tiene su estado, el estado se vacía.
              </p>
              {estados.length === 0 ? (
                <p className="tv-empty tv-empty--box">Esta plantilla aún no tiene estados.</p>
              ) : (
                <div className="tv-estado-rows">
                  {estados.map((estado, index) => (
                    <div className="tv-estado-row" key={index} role="group" aria-label={`Estado ${index + 1}`}>
                      <span className={`estado-dot estado-dot--${estado.color}`} aria-hidden="true" />
                      <input
                        aria-label={`Nombre del estado ${index + 1}`}
                        placeholder="nombre del estado"
                        maxLength={ESTADO_MAX_LEN}
                        value={estado.nombre}
                        onChange={(event) => updateEstado(index, { nombre: event.target.value })}
                      />
                      <select
                        aria-label={`Color del estado ${index + 1}`}
                        value={estado.color}
                        onChange={(event) => updateEstado(index, { color: event.target.value as EstadoColor })}
                      >
                        {ESTADO_COLORES.map((color) => (
                          <option key={color} value={color}>
                            {COLOR_LABEL[color]}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="tv-icon-btn" aria-label={`Quitar el estado ${index + 1}`} title="Quitar" onClick={() => edit(setEstados)(estados.filter((_, i) => i !== index))}>
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="tv-add"
                disabled={estados.length >= ESTADOS_MAX}
                onClick={() => edit(setEstados)([...estados, { nombre: "", color: "gris" }])}
              >
                <Plus size={15} aria-hidden="true" /> Añadir estado
              </button>
            </div>
          </TemplateSection>

          <TemplateSection step={3} title="Diseño del PDF" description="Cómo se ve el documento al descargarlo como PDF: página, tipografías, encabezado y pie.">
            <PdfStyleSection vaultId={vault.id} draft={pdf} attributeNames={rows.map((row) => row.nombre.trim())} onChange={edit(setPdf)} />
          </TemplateSection>

          <TemplateSection step={4} title="Estructura base" description="Las instrucciones de uso de la plantilla y, aparte, el Markdown con el que nace cada documento nuevo.">
            <label className="tv-field">
              <span>Instrucciones</span>
              <textarea
                className="tv-instructions"
                aria-label="Instrucciones de uso de la plantilla (no se copian al documento)"
                value={instrucciones}
                maxLength={INSTRUCCIONES_MAX}
                rows={6}
                placeholder="Cuándo usar la plantilla y cómo llenarla. Estas instrucciones no se copian al documento: aquí van solo para quien use la plantilla, persona o agente."
                onChange={(event) => edit(setInstrucciones)(event.target.value)}
              />
            </label>
            <label className="tv-field">
              <span className="tv-sr">Markdown con el que nace cada documento nuevo (encabezados y contenido de partida)</span>
              <textarea
                className="tv-structure"
                value={estructura}
                rows={14}
                spellCheck={false}
                onChange={(event) => edit(setEstructura)(event.target.value)}
              />
            </label>
          </TemplateSection>
        </div>
      </div>
    </section>
  );
}
