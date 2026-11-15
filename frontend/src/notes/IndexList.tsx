/**
 * Lista de un INDICE (H-031, H-055): carpeta, navegación, subcarpetas y documentos con su descripción, estado, tags,
 * fecha y columnas adicionales. El estado es una cápsula del color que le da la plantilla del documento (gris si no
 * tiene plantilla o su estado no figura en ella). El cuerpo que ven los agentes es el markdown de `indexBody.ts`.
 */
import type { EstadoColor } from "./metaRules";
import { metaParts, type IndexModel } from "./indexBody";
import "../editor/estado.css";

interface IndexListProps {
  model: IndexModel;
  extra: readonly string[];
  /** Color de la cápsula de estado de un documento, según su plantilla. */
  colorOf: (frontmatter: Record<string, unknown>) => EstadoColor | undefined;
  /** Abre la nota de esa ruta. */
  onOpen: (path: string) => void;
}

/** Datos del elemento en líneas propias: estado (cápsula) con la fecha de actualización al lado, descripción y tags (cápsulas); las columnas adicionales debajo. */
function Details({ fm, extra, colorOf }: { fm: Record<string, unknown>; extra: readonly string[]; colorOf: IndexListProps["colorOf"] }) {
  const parts = metaParts(fm, extra);
  if (parts.length === 0) return null;
  const color = colorOf(fm);
  const state = parts.find((part) => part.label === "Estado");
  const updated = parts.find((part) => part.label === "Actualizado");
  const description = parts.find((part) => part.label === null);
  const tags = Array.isArray(fm.tags) ? (fm.tags as unknown[]).filter((tag): tag is string => typeof tag === "string" && tag.trim() !== "") : [];
  const others = parts.filter((part) => part.label !== null && !["Estado", "Tags", "Actualizado"].includes(part.label));
  return (
    <div className="index-item-details">
      {(state || updated) && (
        <div className="index-item-state">
          {state && (
            <span className={`estado-pill${color ? ` estado-pill--${color}` : ""}`} title="Estado">
              {state.value}
            </span>
          )}
          {updated && <span className="index-item-updated">Actualizado: {updated.value}</span>}
        </div>
      )}
      {description && <div className="index-item-description">{description.value}</div>}
      {tags.length > 0 && (
        <ul className="index-item-tags" aria-label="Tags">
          {tags.map((tag) => (
            <li key={tag} className="tag-pill">
              {tag}
            </li>
          ))}
        </ul>
      )}
      {others.map((part) => (
        <div key={part.label} className="index-item-extra">
          {part.label}: {part.value}
        </div>
      ))}
    </div>
  );
}

export default function IndexList({ model, extra, colorOf, onOpen }: IndexListProps) {
  const link = (path: string, label: string) => (
    <button type="button" className="index-link" onClick={() => onOpen(path)}>
      {label}
    </button>
  );
  return (
    <div className="index-list">
      <h1>{model.title}</h1>
      {model.parent && (
        <>
          <h2>Navegación</h2>
          <ul>
            <li>{link(model.parent.path, model.parent.label)}</li>
          </ul>
        </>
      )}
      <h2>Subcarpetas</h2>
      {model.subfolders.length > 0 ? (
        <ul>
          {model.subfolders.map((sub) => (
            <li key={sub.path} className="index-item">
              <div className="index-item-title">{link(sub.path, sub.name)}</div>
              <Details fm={sub.fm} extra={extra} colorOf={colorOf} />
            </li>
          ))}
        </ul>
      ) : (
        <p>
          <em>Sin subcarpetas.</em>
        </p>
      )}
      <h2>Documentos</h2>
      {model.documents.length > 0 ? (
        <ul>
          {model.documents.map((doc) => (
            <li key={doc.path} className="index-item">
              <div className="index-item-title">{link(doc.path, doc.title)}</div>
              <Details fm={doc.fm} extra={extra} colorOf={colorOf} />
            </li>
          ))}
        </ul>
      ) : (
        <p>
          <em>Sin documentos.</em>
        </p>
      )}
    </div>
  );
}
