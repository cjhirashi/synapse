/**
 * Tabla de datos compartida, con el diseño de las listas de cjhirashi-career: cabecera fija con encabezados
 * ordenables (flechas), primera columna destacada, filas con hover, acciones a la derecha y estado vacío.
 * La usan las pantallas con listas largas (hoy Archivos); un solo componente evita rediseñar la tabla en cada pantalla.
 */
import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import "./data-table.css";

export interface DataColumn<Row> {
  key: string;
  label: string;
  /** Con `sortValue` el encabezado ordena; sin él es solo un título. */
  sortValue?: (row: Row) => string | number;
  /** Primera columna: se destaca (como la columna id de career). */
  key_column?: boolean;
  align?: "right";
  /** Ancho mínimo (clases en data-table.css, no `style`): sm 90, md 130, lg 160, xl 220, xxl 280 px. La tabla se desplaza antes que estrecharla. */
  size?: "sm" | "md" | "lg" | "xl" | "xxl";
  /** El texto que pase de 440 px se corta con «…»; ponle `title` al contenido si debe poder leerse completo. */
  clip?: boolean;
}

export interface DataTableProps<Row> {
  columns: DataColumn<Row>[];
  rows: Row[];
  getRowKey: (row: Row) => string;
  renderCell: (row: Row, column: DataColumn<Row>) => ReactNode;
  /** Columna final alineada a la derecha, sin título visible. */
  rowActions?: (row: Row) => ReactNode;
  actionsLabel?: string;
  emptyMessage: string;
  /** Nombre accesible de la tabla. */
  label: string;
  initialSort?: { key: string; dir: "asc" | "desc" };
  /** Si se pasa, cada fila se puede arrastrar y `onRowDragStart` rellena el `dataTransfer`. */
  onRowDragStart?: (event: DragEvent<HTMLTableRowElement>, row: Row) => void;
}

const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

export function DataTable<Row>({
  columns, rows, getRowKey, renderCell, rowActions, actionsLabel = "Acciones", emptyMessage, label, initialSort, onRowDragStart,
}: DataTableProps<Row>) {
  const [sort, setSort] = useState(initialSort ?? null);

  const sorted = useMemo(() => {
    const column = columns.find((c) => c.key === sort?.key);
    if (!sort || !column?.sortValue) return rows;
    const value = column.sortValue;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = value(a), y = value(b);
      const order = typeof x === "number" && typeof y === "number" ? x - y : collator.compare(String(x), String(y));
      return order * dir;
    });
  }, [rows, columns, sort]);

  function toggle(key: string) {
    setSort((current) => (current?.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  if (rows.length === 0) return <p className="data-table-empty">{emptyMessage}</p>;

  const colClass = (c: DataColumn<Row>) =>
    [c.key_column ? "data-table-key" : "", c.align === "right" ? "data-table-right" : "", c.size ? `data-table-${c.size}` : "", c.clip ? "data-table-clip" : ""]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className="data-table-scroll">
      <table className="data-table" aria-label={label}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={colClass(c)}
                aria-sort={sort?.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
              >
                {c.sortValue ? (
                  <button type="button" className="data-table-sort" onClick={() => toggle(c.key)}>
                    {c.label}
                    {sort?.key === c.key ? (
                      sort.dir === "asc" ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />
                    ) : (
                      <ArrowUpDown size={12} aria-hidden="true" className="data-table-sort-idle" />
                    )}
                  </button>
                ) : (
                  c.label
                )}
              </th>
            ))}
            {rowActions && <th scope="col" className="data-table-right data-table-actions"><span className="data-table-sr">{actionsLabel}</span></th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={getRowKey(row)}
              draggable={onRowDragStart ? true : undefined}
              onDragStart={onRowDragStart ? (event) => onRowDragStart(event, row) : undefined}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={colClass(c)}
                >
                  {renderCell(row, c)}
                </td>
              ))}
              {rowActions && <td className="data-table-actions">{rowActions(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
