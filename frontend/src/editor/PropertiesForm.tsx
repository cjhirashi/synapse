/**
 * Formulario de propiedades de la vista Visual (SPEC-0010 RF-010, RF-011, RF-013; PLAN-0010 §2.3-c).
 *
 * No es controlado: parte de `frontmatter` al montarse (el padre lo vuelve a montar con otra `key` si
 * el documento cambia por fuera) y avisa de cada cambio válido con `onChange(objeto)`. Nunca guarda:
 * guardar es del editor. Sin propiedades sólo ofrece «Añadir propiedad»; con ellas, una caja como la
 * del panel de lectura con cabecera de columnas y una fila por propiedad (Clave · Tipo · Valor · Quitar).
 *
 * Accesibilidad: cada fila es un `group` con nombre, todo control lleva nombre accesible, los errores
 * se asocian por `aria-describedby`/`aria-invalid`, los cambios (quitar, vaciar por conversión) se
 * anuncian en una región `status` y el foco nunca se pierde al quitar o añadir una fila. `validate()`
 * lo llama el editor al guardar: con errores no guarda y el foco va a un resumen `role="alert"`.
 */
import { forwardRef, KeyboardEvent, useEffect, useId, useImperativeHandle, useRef, useState, ClipboardEvent } from "react";
import { CircleAlert, Plus, X } from "lucide-react";
import { convert, fromRows, toRows, validateRows, type PropRow, type PropType, type RowError } from "./properties";

interface PropertiesFormProps {
  /** Estado inicial (el del documento al montar). */
  frontmatter: Record<string, unknown> | null | undefined;
  /** Objeto resultante tras cada cambio, sólo si todas las filas son válidas. */
  onChange?: (next: Record<string, unknown>) => void;
}

/** Lo que el editor puede pedir al formulario por `ref`. */
export interface PropertiesFormHandle {
  /** Muestra todos los errores; con alguno, mueve el foco al resumen y devuelve `false`. */
  validate(): boolean;
}

interface Item {
  id: number;
  row: PropRow;
}

const TYPE_LABELS: Record<Exclude<PropType, "complex">, string> = { text: "Texto", number: "Número", boolean: "Sí/No", list: "Lista" };

const ERROR_TEXT: Record<RowError["code"], (key: string) => string> = {
  "empty-key": () => "Escribe un nombre para la propiedad",
  "duplicate-key": (key) => `Ya hay una propiedad llamada «${key}»`,
  "invalid-number": () => "Escribe un número válido, como 3 o 2.5",
};

/** Campo al que pertenece cada error (para enlazarlo y para el resumen). */
const fieldOf = (code: RowError["code"]) => (code === "invalid-number" ? "value" : "key");

type FocusTarget = { kind: "key"; id: number } | { kind: "add" } | { kind: "summary" } | { kind: "field"; id: number; field: "key" | "value" };

export const PropertiesForm = forwardRef<PropertiesFormHandle, PropertiesFormProps>(function PropertiesForm({ frontmatter, onChange }, ref) {
  const uid = useId();
  const nextId = useRef(0);
  const [items, setItems] = useState<Item[]>(() => toRows(frontmatter).map((row) => ({ id: nextId.current++, row })));
  /** Campos cuyo error ya se muestra (al salir del campo o al guardar): `{id}:{key|value}`. */
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set());
  const [summary, setSummary] = useState<RowError[] | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);

  const errors = validateRows(items.map((item) => item.row));

  // Atiende la petición de foco una vez pintado el DOM nuevo.
  useEffect(() => {
    if (!focusTarget) return;
    if (focusTarget.kind === "add") addRef.current?.focus();
    else if (focusTarget.kind === "summary") summaryRef.current?.focus();
    else {
      const field = focusTarget.kind === "key" ? "key" : focusTarget.field;
      root.current?.querySelector<HTMLElement>(`[data-field="${focusTarget.id}:${field}"]`)?.focus();
    }
    setFocusTarget(null);
  }, [focusTarget]);

  /** Aplica filas nuevas y avisa al padre si son válidas. */
  function commit(next: Item[]) {
    setItems(next);
    const rows = next.map((item) => item.row);
    if (validateRows(rows).length === 0) onChange?.(fromRows(rows));
  }

  function update(id: number, patch: Partial<PropRow>) {
    commit(items.map((item) => (item.id === id ? { ...item, row: { ...item.row, ...patch } } : item)));
  }

  function add() {
    const id = nextId.current++;
    commit([...items, { id, row: { key: "", type: "text", value: "" } }]);
    setFocusTarget({ kind: "key", id });
  }

  function remove(index: number) {
    const gone = items[index];
    const rest = items.filter((_, i) => i !== index);
    commit(rest);
    setAnnouncement(`Propiedad «${gone.row.key}» quitada`);
    const neighbour = rest[index] ?? rest[index - 1];
    setFocusTarget(neighbour ? { kind: "key", id: neighbour.id } : { kind: "add" });
  }

  function changeType(item: Item, type: PropType) {
    const { value, emptied } = convert(item.row.value, item.row.type, type);
    update(item.id, { type, value });
    setAnnouncement(emptied ? `El valor de «${item.row.key}» se vació al cambiar de tipo` : "");
  }

  function reveal(id: number, field: "key" | "value") {
    setShown((current) => new Set(current).add(`${id}:${field}`));
  }

  useImperativeHandle(ref, () => ({
    validate() {
      if (errors.length === 0) {
        setSummary(null);
        return true;
      }
      setShown(new Set(errors.map((e) => `${items[e.index].id}:${fieldOf(e.code)}`)));
      setSummary(errors);
      setFocusTarget({ kind: "summary" });
      return false;
    },
  }));

  /** Error visible de un campo (por su fila y campo). */
  const errorOf = (index: number, id: number, field: "key" | "value") =>
    shown.has(`${id}:${field}`) ? errors.find((e) => e.index === index && fieldOf(e.code) === field) : undefined;

  const addButton = (
    <button ref={addRef} type="button" className="note-ghost-button" onClick={add}>
      <Plus size={14} aria-hidden="true" />
      Añadir propiedad
    </button>
  );

  const live = (
    <span role="status" className="note-visually-hidden">
      {announcement}
    </span>
  );

  if (items.length === 0) {
    return (
      <div>
        {addButton}
        {live}
      </div>
    );
  }

  return (
    <div ref={root} role="group" aria-label="Propiedades" className="note-properties props-form">
      {summary && (
        <div ref={summaryRef} role="alert" tabIndex={-1} className="props-form-summary">
          <CircleAlert size={14} aria-hidden="true" />
          <span>No se pudo guardar: revisa {summary.length} propiedades</span>
          <ul>
            {summary.map((error) => (
              <li key={`${error.index}:${error.code}`}>
                <button
                  type="button"
                  className="note-ghost-button"
                  onClick={() => setFocusTarget({ kind: "field", id: items[error.index].id, field: fieldOf(error.code) })}
                >
                  {ERROR_TEXT[error.code](error.key)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="props-form-scroll">
        <div className="props-form-head" aria-hidden="true">
          <span>Clave</span>
          <span>Tipo</span>
          <span>Valor</span>
          <span />
        </div>
        {items.map((item, index) => {
          const { row, id } = item;
          const keyError = errorOf(index, id, "key");
          const valueError = errorOf(index, id, "value");
          const keyErrorId = `${uid}-${id}-key-err`;
          const valueErrorId = `${uid}-${id}-value-err`;
          return (
            <div key={id} role="group" aria-label={`Propiedad: ${row.key}`} className="props-form-row">
              <div className="props-form-cell" data-label="Clave">
                <input
                  className="props-form-key"
                  data-field={`${id}:key`}
                  aria-label={`Clave de la propiedad ${index + 1}`}
                  value={row.key}
                  aria-invalid={keyError ? true : undefined}
                  aria-describedby={keyError ? keyErrorId : undefined}
                  onChange={(event) => update(id, { key: event.target.value })}
                  onBlur={() => reveal(id, "key")}
                />
              </div>
              <div className="props-form-cell" data-label="Tipo">
                {row.type !== "complex" && (
                  <select
                    className="props-form-type"
                    aria-label={`Tipo de «${row.key}»`}
                    value={row.type}
                    onChange={(event) => changeType(item, event.target.value as PropType)}
                  >
                    {(Object.keys(TYPE_LABELS) as Array<keyof typeof TYPE_LABELS>).map((type) => (
                      <option key={type} value={type}>
                        {TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="props-form-cell props-form-value" data-label="Valor">
                <ValueControl
                  item={item}
                  invalid={Boolean(valueError)}
                  describedBy={valueError ? valueErrorId : undefined}
                  onValue={(value) => update(id, { value })}
                  onBlur={() => reveal(id, "value")}
                />
              </div>
              <button type="button" className="props-form-remove" aria-label={`Quitar propiedad ${row.key}`} onClick={() => remove(index)}>
                <X size={14} aria-hidden="true" />
              </button>
              {keyError && (
                <p id={keyErrorId} className="props-form-error">
                  <CircleAlert size={12} aria-hidden="true" />
                  {ERROR_TEXT[keyError.code](keyError.key)}
                </p>
              )}
              {valueError && (
                <p id={valueErrorId} className="props-form-error">
                  <CircleAlert size={12} aria-hidden="true" />
                  {ERROR_TEXT[valueError.code](valueError.key)}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {addButton}
      {live}
    </div>
  );
});

interface ValueControlProps {
  item: Item;
  invalid: boolean;
  describedBy: string | undefined;
  onValue: (value: unknown) => void;
  onBlur: () => void;
}

/** Control del valor según el tipo (§2.3-c). */
function ValueControl({ item, invalid, describedBy, onValue, onBlur }: ValueControlProps) {
  const { row } = item;
  const label = `Valor de «${row.key}»`;
  const common = { "aria-label": label, "aria-invalid": invalid ? true : undefined, "aria-describedby": describedBy, onBlur };

  switch (row.type) {
    case "number":
      return <input {...common} data-field={`${item.id}:value`} type="text" inputMode="decimal" className="props-form-number" value={String(row.value)} onChange={(event) => onValue(event.target.value)} />;
    case "boolean":
      return (
        <label className="props-form-bool">
          <input type="checkbox" data-field={`${item.id}:value`} checked={row.value === true} onChange={(event) => onValue(event.target.checked)} onBlur={onBlur} />
          <span>{row.value === true ? "Sí" : "No"}</span>
        </label>
      );
    case "list":
      return <ListControl item={item} onValue={onValue} onBlur={onBlur} />;
    case "complex":
      return (
        <div className="props-form-complex">
          <code className="note-prop-complex">{JSON.stringify(row.value)}</code>
          <span className="note-prop-readonly">Sólo se edita en Código</span>
        </div>
      );
    default: {
      const text = String(row.value);
      // Un valor con saltos de línea necesita un área de varias líneas (máx. 8).
      return text.includes("\n") ? (
        <textarea {...common} data-field={`${item.id}:value`} rows={Math.min(8, Math.max(3, text.split("\n").length))} value={text} onChange={(event) => onValue(event.target.value)} />
      ) : (
        <input {...common} data-field={`${item.id}:value`} type="text" value={text} onChange={(event) => onValue(event.target.value)} />
      );
    }
  }
}

/** Lista de strings: chips con «x» + campo para añadir (Enter o coma añade, pegar con comas divide). */
function ListControl({ item, onValue, onBlur }: { item: Item; onValue: (value: unknown) => void; onBlur: () => void }) {
  const items = item.row.value as string[];
  const [draft, setDraft] = useState("");

  /** Añade los elementos no vacíos de `text` (separados por comas). */
  function addFrom(text: string) {
    const added = text.split(",").map((part) => part.trim()).filter(Boolean);
    if (added.length > 0) onValue([...items, ...added]);
    setDraft("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Enter nunca envía el formulario del editor (RF-011): sólo añade el elemento.
    if (event.key === "Enter") {
      event.preventDefault();
      addFrom(draft);
    }
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData("text");
    if (!text.includes(",")) return;
    event.preventDefault();
    addFrom(draft + text);
  }

  return (
    <div className="props-form-list">
      {items.length > 0 && (
        <ul className="note-chips">
          {items.map((value, index) => (
            <li key={`${index}:${value}`} className="note-chip">
              {value}
              <button type="button" className="note-chip-remove" aria-label={`Quitar ${value}`} onClick={() => onValue(items.filter((_, i) => i !== index))}>
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        data-field={`${item.id}:value`}
        aria-label={`Añadir elemento a «${item.row.key}»`}
        value={draft}
        onChange={(event) => {
          const next = event.target.value;
          // Una coma escrita cierra el elemento.
          if (next.endsWith(",")) addFrom(next);
          else setDraft(next);
        }}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={() => {
          addFrom(draft);
          onBlur();
        }}
      />
    </div>
  );
}
