import { useId, type KeyboardEvent, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ConfirmDialog } from "../editor/ConfirmDialog";

interface Props {
  title: string;
  glyph: LucideIcon;
  /** Texto del campo (también su nombre accesible). */
  label: string;
  value: string;
  onChange: (value: string) => void;
  confirmLabel: string;
  onSubmit: () => void;
  onCancel: () => void;
  /** Dónde se creará lo nuevo, bajo el título. */
  hint?: string;
  /** Mensaje de error a mostrar bajo el campo (`null` = ninguno). */
  error?: string | null;
  busy?: boolean;
  /** Campos extra (plantilla, propietario…) tras el nombre. */
  children?: ReactNode;
}

/** Ventana emergente que pide el nombre de lo que se va a crear (documento, plantilla, carpeta). */
export default function NameDialog({ title, glyph, label, value, onChange, confirmLabel, onSubmit, onCancel, hint, error = null, busy = false, children }: Props) {
  const titleId = useId();
  const errorId = useId();

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!busy) onSubmit();
  }

  return (
    <ConfirmDialog
      titleId={titleId}
      title={title}
      glyph={glyph}
      onCancel={onCancel}
      body={
        <div className="name-dialog">
          {hint && <p className="name-dialog-hint">{hint}</p>}
          <label>
            {label}
            <input
              data-autofocus
              type="text"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={onKeyDown}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
          </label>
          {children}
          {error && (
            <p id={errorId} role="alert" className="name-dialog-error">
              {error}
            </p>
          )}
        </div>
      }
    >
      <button type="button" onClick={onCancel}>
        Cancelar
      </button>
      <button type="button" className="btn-primary" disabled={busy} onClick={onSubmit}>
        {confirmLabel}
      </button>
    </ConfirmDialog>
  );
}
