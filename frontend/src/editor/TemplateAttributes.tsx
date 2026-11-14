/**
 * Atributos que define la plantilla del documento (H-054). Siempre existen y no se quitan: pueden ir vacíos.
 * No es controlado: lee `values` y avisa con `onChange(nombre, valor)`; un número o fecha vacíos se avisan como `undefined`
 * (el atributo existe, solo que sin valor). Los inválidos no se avisan (se corrigen en el campo).
 */
import { useId, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { parseNumberInput } from "./properties";
import type { TemplateAttr } from "./templateAttrs";

interface Props {
  attrs: ReadonlyArray<TemplateAttr>;
  values: Record<string, unknown>;
  onChange: (nombre: string, value: unknown) => void;
}

export function TemplateAttributes({ attrs, values, onChange }: Props) {
  const uid = useId();
  return (
    <>
      {attrs.map((attr, index) => (
        <Field key={attr.nombre} id={`${uid}-${index}`} attr={attr} value={values[attr.nombre]} onChange={(value) => onChange(attr.nombre, value)} />
      ))}
    </>
  );
}

function Field({ id, attr, value, onChange }: { id: string; attr: TemplateAttr; value: unknown; onChange: (value: unknown) => void }) {
  const [draft, setDraft] = useState(() => (typeof value === "number" ? String(value) : ""));
  const [error, setError] = useState("");
  const [item, setItem] = useState("");

  if (attr.tipo === "booleano") {
    return (
      <div className="note-meta-field">
        <label className="props-form-bool">
          <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
          <span>{attr.nombre}</span>
        </label>
      </div>
    );
  }
  if (attr.tipo === "lista") {
    const items = Array.isArray(value) ? (value as string[]) : [];
    const add = (text: string) => {
      const added = text.split(",").map((part) => part.trim()).filter(Boolean);
      if (added.length > 0) onChange([...items, ...added]);
      setItem("");
    };
    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        add(item);
      }
    };
    return (
      <div className="note-meta-field">
        <label htmlFor={id}>{attr.nombre}</label>
        {items.length > 0 && (
          <ul className="note-chips">
            {items.map((entry, i) => (
              <li key={`${i}:${entry}`} className="note-chip">
                {entry}
                <button type="button" className="note-chip-remove" aria-label={`Quitar ${entry}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>
                  <X size={12} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <input id={id} value={item} placeholder="Añadir elemento (Enter)" onChange={(event) => (event.target.value.endsWith(",") ? add(event.target.value) : setItem(event.target.value))} onKeyDown={onKeyDown} onBlur={() => add(item)} />
      </div>
    );
  }
  if (attr.tipo === "numero") {
    return (
      <div className="note-meta-field">
        <label htmlFor={id}>{attr.nombre}</label>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={draft}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(event) => {
            const text = event.target.value;
            setDraft(text);
            if (text.trim() === "") {
              setError("");
              onChange(undefined);
              return;
            }
            const parsed = parseNumberInput(text);
            if (parsed === null) return setError("Escribe un número válido, como 3 o 2.5");
            setError("");
            onChange(parsed);
          }}
        />
        {error && <p id={`${id}-err`} role="alert" className="note-meta-error">{error}</p>}
      </div>
    );
  }
  const isDate = attr.tipo === "fecha";
  return (
    <div className="note-meta-field">
      <label htmlFor={id}>{attr.nombre}</label>
      <input
        id={id}
        type={isDate ? "date" : "text"}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(isDate && event.target.value === "" ? undefined : event.target.value)}
      />
    </div>
  );
}
