/**
 * Sección META de una nota (H-029): los siete atributos generales en orden fijo y, debajo, las demás
 * propiedades. Va arriba del documento y entra en su scroll.
 *
 * Lectura: texto plano de React (nunca HTML). Edición: no controlado, parte de `frontmatter` al montarse
 * (el padre lo remonta con otra `key`) y avisa con `onChange(objeto)` de cada cambio válido; no emite al
 * montarse. `ruta` la pone el sistema (la ubicación de la nota) y nunca se emite; las fechas las sella el
 * almacén al guardar: aquí solo se muestran.
 */
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import {
  DESCRIPCION_MAX, ESTADOS_ESTANDAR, ESTADO_MAX_LEN, TAGS_MAX, TAG_MAX_LEN, TITULO_MAX, normalizeEstado, normalizeTag,
} from "./attributeRules";
import { PropertiesForm } from "./PropertiesForm";
import { PropertiesPanel } from "./PropertiesPanel";
import type { AttributeCatalog, AttributeDef } from "../sync/vaultRules";

const GENERAL_KEYS = new Set(["titulo", "descripcion", "ruta", "fecha_creacion", "fecha_actualizacion", "tags", "estado"]);
/** Valor del `<select>` de estado para «sin estado» y para «crear uno nuevo» (un estado guardado nunca los usa: `_` pasa a espacio). */
const NO_ESTADO = "";
const OTHER_ESTADO = "__otro__";

interface NoteMetaProps {
  mode: "read" | "edit";
  frontmatter: Record<string, unknown> | null | undefined;
  /** Ruta de la nota: la muestra el sistema, no se guarda. */
  path: string;
  onChange?: (next: Record<string, unknown>) => void;
  /** Estados propios de la bóveda y los que ya usan sus notas, además de los estándar. */
  estadoOptions?: readonly string[];
  /** Se llama una vez cuando la persona crea un estado que no estaba en la lista (para añadirlo al catálogo de la bóveda). */
  onNewEstado?: (estado: string) => void;
  /** Catálogo de atributos tipados de la bóveda (H-029). Solo se usa en edición. */
  attributes?: AttributeCatalog | null;
}

interface Values {
  titulo: string;
  descripcion: string;
  tags: string[];
  estado: string;
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const points = (value: string): number => [...value].length;

/** Valida que un valor sea una fecha en formato AAAA-MM-DD. */
function isValidDate(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

const TYPED = new Set<string>(["date", "select", "multiselect"]);

/** El valor tiene la forma que exige el tipo del atributo (si no, se queda en las propiedades libres). */
function matchesType(def: AttributeDef, value: unknown): boolean {
  if (def.type === "date") return isValidDate(value);
  if (def.type === "select") return typeof value === "string";
  if (def.type === "multiselect") return Array.isArray(value) && value.every((v) => typeof v === "string");
  return false;
}

/** Propiedades libres: todo lo que no es general ni un atributo tipado del catálogo con valor válido. */
function freeProperties(frontmatter: Record<string, unknown>, attributes?: AttributeCatalog | null): Record<string, unknown> {
  const typed = (key: string): boolean => {
    const def = attributes?.[key];
    return def !== undefined && TYPED.has(def.type) && matchesType(def, frontmatter[key]);
  };
  return Object.fromEntries(Object.entries(frontmatter).filter(([key]) => !GENERAL_KEYS.has(key) && !typed(key)));
}

/** Nombre de archivo sin carpeta ni `.md`: el título que se usa mientras no haya uno propio. */
function fileTitle(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

export function NoteMeta({ mode, frontmatter, path, onChange, estadoOptions, onNewEstado, attributes }: NoteMetaProps) {
  const fm = frontmatter ?? {};
  if (mode === "read") return <ReadMeta fm={fm} path={path} />;
  return <EditMeta fm={fm} path={path} onChange={onChange} estadoOptions={estadoOptions} onNewEstado={onNewEstado} attributes={attributes} />;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="note-property">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ReadMeta({ fm, path }: { fm: Record<string, unknown>; path: string }) {
  const dash = <span className="note-prop-empty">—</span>;
  const tags = Array.isArray(fm.tags) ? fm.tags.filter((t): t is string => typeof t === "string") : [];
  const free = freeProperties(fm, null);
  return (
    <div className="note-meta">
      <div role="group" aria-label="Atributos generales" className="note-properties">
        <dl>
          <Row label="Título">{text(fm.titulo) || dash}</Row>
          <Row label="Descripción">{text(fm.descripcion) || dash}</Row>
          <Row label="Ruta">{path}</Row>
          <Row label="Fecha de creación">{text(fm.fecha_creacion) || dash}</Row>
          <Row label="Fecha de actualización">{text(fm.fecha_actualizacion) || dash}</Row>
          <Row label="Etiquetas">
            {tags.length === 0 ? (
              dash
            ) : (
              <ul className="note-chips">
                {tags.map((tag) => (
                  <li key={tag} className="note-chip">
                    {tag}
                  </li>
                ))}
              </ul>
            )}
          </Row>
          <Row label="Estado">{text(fm.estado) || dash}</Row>
        </dl>
      </div>
      <PropertiesPanel frontmatter={free} />
    </div>
  );
}

function EditMeta({ fm, path, onChange, estadoOptions, onNewEstado, attributes }: Omit<NoteMetaProps, "mode" | "frontmatter"> & { fm: Record<string, unknown> }) {
  const uid = useId();
  const initial = useRef({
    free: freeProperties(fm, attributes),
    fechaCreacion: text(fm.fecha_creacion),
    fechaActualizacion: text(fm.fecha_actualizacion),
  }).current;
  const [values, setValues] = useState<Values>(() => ({
    titulo: text(fm.titulo),
    descripcion: text(fm.descripcion),
    tags: Array.isArray(fm.tags) ? fm.tags.filter((t): t is string => typeof t === "string") : [],
    estado: text(fm.estado),
  }));
  const free = useRef(initial.free);
  const [tagText, setTagText] = useState("");
  const [tagError, setTagError] = useState("");
  const [creatingEstado, setCreatingEstado] = useState(false);
  const [estadoText, setEstadoText] = useState("");
  const [estadoError, setEstadoError] = useState("");

  // H-029: valores de atributos tipados (date, select, multiselect).
  const initTypedValues = (): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(attributes ?? {}).filter(([key, def]) => TYPED.has(def.type) && matchesType(def, fm[key])).map(([key]) => [key, fm[key]]),
    );
  const [typedValuesState, setTypedValuesState] = useState(initTypedValues);

  const estados = [...new Set<string>([...ESTADOS_ESTANDAR, ...(estadoOptions ?? []), ...(values.estado ? [values.estado] : [])])];

  const tituloError = points(values.titulo) > TITULO_MAX ? `Máximo ${TITULO_MAX} caracteres` : "";
  const descripcionError = points(values.descripcion) > DESCRIPCION_MAX ? `Máximo ${DESCRIPCION_MAX} caracteres` : "";

  /** Aplica un cambio y avisa al padre con el objeto completo si todo es válido. */
  function commit(patch: Partial<Values> = {}, nextFree: Record<string, unknown> = free.current, nextTyped: Record<string, unknown> = typedValuesState) {
    const next = { ...values, ...patch };
    setValues(next);
    free.current = nextFree;
    if (points(next.titulo) > TITULO_MAX || points(next.descripcion) > DESCRIPCION_MAX) return;
    const out: Record<string, unknown> = {};
    if (next.titulo) out.titulo = next.titulo;
    if (next.descripcion) out.descripcion = next.descripcion;
    if (initial.fechaCreacion) out.fecha_creacion = initial.fechaCreacion;
    if (initial.fechaActualizacion) out.fecha_actualizacion = initial.fechaActualizacion;
    if (next.tags.length > 0) out.tags = next.tags;
    if (next.estado) out.estado = next.estado;
    onChange?.({ ...out, ...nextFree, ...nextTyped });
  }

  function addTag() {
    const tag = normalizeTag(tagText);
    if (tag === null) return setTagError(`Escribe una etiqueta de letras, números, - o _ (hasta ${TAG_MAX_LEN} caracteres)`);
    if (values.tags.includes(tag)) return setTagError(`La etiqueta «${tag}» ya está`);
    if (values.tags.length >= TAGS_MAX) return setTagError(`Máximo ${TAGS_MAX} etiquetas`);
    setTagError("");
    setTagText("");
    commit({ tags: [...values.tags, tag] });
  }

  function onTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      if (tagText.trim() !== "") addTag();
    }
  }

  function chooseEstado(value: string) {
    setEstadoError("");
    if (value === OTHER_ESTADO) {
      setCreatingEstado(true);
      return;
    }
    setCreatingEstado(false);
    commit({ estado: value });
  }

  function applyNewEstado() {
    const estado = normalizeEstado(estadoText);
    if (estado === null) return setEstadoError(`Escribe un estado de 1 a ${ESTADO_MAX_LEN} caracteres`);
    setEstadoError("");
    setEstadoText("");
    setCreatingEstado(false);
    commit({ estado });
    if (!estados.includes(estado)) onNewEstado?.(estado);
  }

  /** Renderiza los campos de atributos tipados (date, select, multiselect). */
  const typedAttributesContent = (() => {
    if (!attributes) return null;
    const fields: React.ReactNode[] = [];
    for (const [key, def] of Object.entries(attributes)) {
      if (!TYPED.has(def.type)) continue;
      // Un valor presente con la forma equivocada se queda en las propiedades libres.
      if (fm[key] !== undefined && !matchesType(def, fm[key])) continue;
      const currentValue = typedValuesState[key];
      const isDateType = def.type === "date";
      const isSelectType = def.type === "select";
      const isMultiselectType = def.type === "multiselect";

      if (isDateType) {
        fields.push(
          <div key={key} className="note-meta-field">
            <label htmlFor={`${uid}-${key}`}>{key}</label>
            <input
              id={`${uid}-${key}`}
              type="date"
              value={typeof currentValue === "string" ? currentValue : ""}
              onChange={(event) => {
                const next = { ...typedValuesState };
                if (event.target.value) {
                  next[key] = event.target.value;
                } else {
                  delete next[key];
                }
                setTypedValuesState(next);
                commit({}, free.current, next);
              }}
            />
          </div>,
        );
      } else if (isSelectType) {
        const options = def.options ?? [];
        const hasCurrentValue = typeof currentValue === "string" && currentValue !== "";
        const currentValueInOptions = hasCurrentValue && options.includes(currentValue as string);
        const selectOptions = currentValueInOptions ? options : (hasCurrentValue ? [...options, currentValue as string] : options);

        fields.push(
          <div key={key} className="note-meta-field">
            <label htmlFor={`${uid}-${key}`}>{key}</label>
            <select
              id={`${uid}-${key}`}
              value={typeof currentValue === "string" ? currentValue : ""}
              onChange={(event) => {
                const next = { ...typedValuesState };
                if (event.target.value) {
                  next[key] = event.target.value;
                } else {
                  delete next[key];
                }
                setTypedValuesState(next);
                commit({}, free.current, next);
              }}
            >
              <option value="">—</option>
              {selectOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>,
        );
      } else if (isMultiselectType) {
        const options = def.options ?? [];
        const currentArray = Array.isArray(currentValue) ? currentValue : [];
        const extraValues = currentArray.filter((v) => !options.includes(v));
        const allOptions = [...options, ...extraValues];

        fields.push(
          <fieldset key={key} className="note-meta-field">
            <legend>{key}</legend>
            <div className="note-meta-checkboxes">
              {allOptions.map((opt) => (
                <label key={opt} className="note-meta-checkbox">
                  <input
                    type="checkbox"
                    checked={currentArray.includes(opt)}
                    onChange={(event) => {
                      let next: string[];
                      if (event.target.checked) {
                        next = [...currentArray, opt];
                      } else {
                        next = currentArray.filter((v) => v !== opt);
                      }
                      const typedNext = { ...typedValuesState };
                      if (next.length > 0) {
                        typedNext[key] = next;
                      } else {
                        delete typedNext[key];
                      }
                      setTypedValuesState(typedNext);
                      commit({}, free.current, typedNext);
                    }}
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
          </fieldset>,
        );
      }
    }
    return fields.length > 0 ? fields : null;
  })();

  return (
    <div className="note-meta">
      <div role="group" aria-label="Atributos generales" className="note-properties props-form note-meta-form">
        <div className="note-meta-field">
          <label htmlFor={`${uid}-titulo`}>Título</label>
          <input
            id={`${uid}-titulo`}
            value={values.titulo}
            placeholder={fileTitle(path)}
            aria-invalid={tituloError ? true : undefined}
            aria-describedby={tituloError ? `${uid}-titulo-err` : undefined}
            onChange={(event) => commit({ titulo: event.target.value })}
          />
          {tituloError && <p id={`${uid}-titulo-err`} role="alert" className="note-meta-error">{tituloError}</p>}
        </div>
        <div className="note-meta-field">
          <label htmlFor={`${uid}-descripcion`}>Descripción</label>
          <textarea
            id={`${uid}-descripcion`}
            rows={2}
            value={values.descripcion}
            aria-invalid={descripcionError ? true : undefined}
            aria-describedby={descripcionError ? `${uid}-descripcion-err` : undefined}
            onChange={(event) => commit({ descripcion: event.target.value })}
          />
          {descripcionError && <p id={`${uid}-descripcion-err`} role="alert" className="note-meta-error">{descripcionError}</p>}
        </div>
        <div className="note-meta-field">
          <label htmlFor={`${uid}-ruta`}>Ruta</label>
          <input id={`${uid}-ruta`} value={path} readOnly />
        </div>
        <div className="note-meta-pair">
          <div className="note-meta-field">
            <label htmlFor={`${uid}-creacion`}>Fecha de creación</label>
            <input id={`${uid}-creacion`} value={initial.fechaCreacion} readOnly placeholder="—" />
          </div>
          <div className="note-meta-field">
            <label htmlFor={`${uid}-actualizacion`}>Fecha de actualización</label>
            <input id={`${uid}-actualizacion`} value={initial.fechaActualizacion} readOnly placeholder="—" />
          </div>
        </div>
        <div className="note-meta-field">
          <label htmlFor={`${uid}-etiqueta`}>Etiquetas</label>
          {values.tags.length > 0 && (
            <ul className="note-chips">
              {values.tags.map((tag) => (
                <li key={tag} className="note-chip">
                  {tag}
                  <button type="button" className="note-chip-remove" aria-label={`Quitar etiqueta ${tag}`} onClick={() => commit({ tags: values.tags.filter((t) => t !== tag) })}>
                    <X size={12} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            id={`${uid}-etiqueta`}
            value={tagText}
            placeholder="Añadir etiqueta (Enter)"
            aria-invalid={tagError ? true : undefined}
            aria-describedby={tagError ? `${uid}-etiqueta-err` : undefined}
            onChange={(event) => {
              setTagText(event.target.value);
              if (tagError) setTagError("");
            }}
            onKeyDown={onTagKeyDown}
          />
          {tagError && <p id={`${uid}-etiqueta-err`} role="alert" className="note-meta-error">{tagError}</p>}
        </div>
        <div className="note-meta-field">
          <label htmlFor={`${uid}-estado`}>Estado</label>
          <select id={`${uid}-estado`} value={creatingEstado ? OTHER_ESTADO : values.estado} onChange={(event) => chooseEstado(event.target.value)}>
            <option value={NO_ESTADO}>Sin estado</option>
            {estados.map((estado) => (
              <option key={estado} value={estado}>
                {estado}
              </option>
            ))}
            <option value={OTHER_ESTADO}>Otro estado…</option>
          </select>
          {creatingEstado && (
            <input
              aria-label="Nuevo estado"
              value={estadoText}
              placeholder="Nuevo estado (Enter)"
              maxLength={ESTADO_MAX_LEN}
              aria-invalid={estadoError ? true : undefined}
              aria-describedby={estadoError ? `${uid}-estado-err` : undefined}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              onChange={(event) => {
                setEstadoText(event.target.value);
                if (estadoError) setEstadoError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyNewEstado();
                }
              }}
            />
          )}
          {estadoError && <p id={`${uid}-estado-err`} role="alert" className="note-meta-error">{estadoError}</p>}
        </div>
      </div>
      {typedAttributesContent && (
        <div role="group" aria-label="Atributos de la bóveda" className="note-properties props-form note-meta-form">
          {typedAttributesContent}
        </div>
      )}
      <PropertiesForm frontmatter={initial.free} onChange={(next) => commit({}, next, typedValuesState)} />
    </div>
  );
}
