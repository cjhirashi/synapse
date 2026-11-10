import { useId, type ReactNode } from "react";
import { CircleAlert, Folder, type LucideIcon } from "lucide-react";
import DialogFrame from "../editor/DialogFrame";

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
  /** Carpeta donde se creará lo nuevo (`""` = raíz), bajo el título. */
  location: string;
  placeholder?: string;
  /** Texto de ayuda bajo el campo. */
  helper?: string;
  /** Mensaje de error bajo el campo (`null` = ninguno). */
  error?: string | null;
  busy?: boolean;
  /** Color de acento de la ventana (el de la bóveda); por defecto el de la interfaz. */
  accent?: string;
  /** Campos extra (plantilla, propietario…) tras el nombre. */
  children?: ReactNode;
}

const FOCUSABLE = "button:not([disabled]), input:not([disabled]), select:not([disabled])";

/**
 * Ventana emergente que pide el nombre de lo que se va a crear (documento, plantilla, carpeta), sobre el marco común
 * `DialogFrame`. Enter crea, Esc cancela y un clic fuera solo la cierra si no hay nada escrito (no se pierde un nombre
 * a medias).
 */
export default function NameDialog({ title, glyph, label, value, onChange, confirmLabel, onSubmit, onCancel, location, placeholder, helper, error = null, busy = false, accent, children }: Props) {
  const ids = useId();
  const titleId = `${ids}-title`;
  const fieldId = `${ids}-field`;
  const helperId = `${ids}-helper`;
  const errorId = `${ids}-error`;
  const describedBy = [helper ? helperId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <DialogFrame
      titleId={titleId}
      title={title}
      glyph={glyph}
      tone="accent"
      accent={accent}
      size="sm"
      top
      showClose
      backdropClosable={value.trim() === ""}
      onCancel={onCancel}
      onEnter={() => {
        if (!busy) onSubmit();
      }}
      subtitle={
        <span className="name-dialog-location">
          <span className="name-dialog-location-label">Se creará en</span>
          <span className="name-dialog-path" title={location || "Raíz"}>
            <Folder size={12} aria-hidden="true" />
            <span className="name-dialog-path-text">{location || "Raíz"}</span>
          </span>
        </span>
      }
      footerStart={
        <span className="name-dialog-keys" aria-hidden="true">
          <kbd>Enter</kbd> crear · <kbd>Esc</kbd> cancelar
        </span>
      }
      actions={
        <>
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="btn-primary" disabled={busy} onClick={onSubmit}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="name-dialog-fields">
        <div className="name-dialog-field">
          <label htmlFor={fieldId}>{label}</label>
          <input
            id={fieldId}
            data-autofocus
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={value}
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
          />
          {helper && (
            <p id={helperId} className="name-dialog-helper">
              {helper}
            </p>
          )}
        </div>
        {children}
        {error && (
          <p id={errorId} role="alert" className="name-dialog-error">
            <CircleAlert size={14} aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}
      </div>
    </DialogFrame>
  );
}
