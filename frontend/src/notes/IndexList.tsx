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

function Parts({ fm, extra, colorOf }: { fm: Record<string, unknown>; extra: readonly string[]; colorOf: IndexListProps["colorOf"] }) {
  const parts = metaParts(fm, extra);
  if (parts.length === 0) return null;
  const color = colorOf(fm);
  return (
    <>
      {" — "}
      {parts.map((part, index) => (
        <span key={`${part.label ?? "descripcion"}:${index}`}>
          {index > 0 && " · "}
          {part.label === null ? (
            part.value
          ) : part.label === "Estado" ? (
            <span className={`estado-pill${color ? ` estado-pill--${color}` : ""}`} title="Estado">
              {part.value}
            </span>
          ) : (
            `${part.label}: ${part.value}`
          )}
        </span>
      ))}
    </>
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
            <li key={sub.path}>
              {link(sub.path, sub.name)}
              <Parts fm={sub.fm} extra={extra} colorOf={colorOf} />
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
            <li key={doc.path}>
              {link(doc.path, doc.title)}
              <Parts fm={doc.fm} extra={extra} colorOf={colorOf} />
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
