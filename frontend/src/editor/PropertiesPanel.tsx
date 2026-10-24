/**
 * Panel de propiedades de la nota en lectura (SPEC-0010 RF-009, RF-010, RF-013; PLAN-0010 §2.3-b).
 *
 * Caja del mockup (`.frontmatter` de 1.1.4.4) con un par clave/valor legible por propiedad, en el
 * orden de las claves; nunca YAML crudo. Todo valor se pinta como **texto** (nodos de texto de React):
 * un `<script>` o una URL en una propiedad no crean elementos ni enlaces (RNF-003). Sin propiedades
 * no se pinta nada. Con 10 o más se muestran 6 y «Mostrar n más» (P-16): es lo único enfocable.
 */
import { useState } from "react";
import { Lock, Square, SquareCheck } from "lucide-react";
import { toRows, type PropRow } from "./properties";

/** A partir de este número de propiedades el panel se pliega a `COLLAPSED` filas. */
const COLLAPSE_AT = 10;
const COLLAPSED = 6;

interface PropertiesPanelProps {
  frontmatter: Record<string, unknown> | null | undefined;
}

function Value({ row }: { row: PropRow }) {
  switch (row.type) {
    case "boolean":
      return (
        <span className="note-prop-bool">
          {row.value ? <SquareCheck size={14} aria-hidden="true" className="note-prop-bool-on" /> : <Square size={14} aria-hidden="true" />}
          {row.value ? "Sí" : "No"}
        </span>
      );
    case "list":
      return (
        <ul className="note-chips">
          {(row.value as string[]).map((item, index) => (
            <li key={index} className="note-chip">
              {item}
            </li>
          ))}
        </ul>
      );
    case "complex":
      return (
        <>
          <code className="note-prop-complex">{JSON.stringify(row.value)}</code>
          <span className="note-prop-readonly">
            <Lock size={12} aria-hidden="true" />
            Sólo lectura: edítalo en Código
          </span>
        </>
      );
    case "number":
      return <span className="note-prop-number">{String(row.value)}</span>;
    default:
      return row.value === "" ? <span className="note-prop-empty">(vacío)</span> : <>{String(row.value)}</>;
  }
}

export function PropertiesPanel({ frontmatter }: PropertiesPanelProps) {
  const rows = toRows(frontmatter);
  const [expanded, setExpanded] = useState(false);
  if (rows.length === 0) return null;

  const collapsible = rows.length >= COLLAPSE_AT;
  const visible = collapsible && !expanded ? rows.slice(0, COLLAPSED) : rows;

  return (
    <div role="group" aria-label="Propiedades" className="note-properties">
      <dl>
        {visible.map((row) => (
          <div key={row.key} className="note-property">
            <dt>{row.key}</dt>
            <dd>
              <Value row={row} />
            </dd>
          </div>
        ))}
      </dl>
      {collapsible && (
        <button type="button" className="note-ghost-button" aria-expanded={expanded} onClick={() => setExpanded((open) => !open)}>
          {expanded ? "Mostrar menos" : `Mostrar ${rows.length - COLLAPSED} más`}
        </button>
      )}
    </div>
  );
}
