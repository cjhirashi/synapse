import { useEffect, useId, useRef, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CircleAlert, Folder, X, type LucideIcon } from "lucide-react";

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
 * Ventana emergente que pide el nombre de lo que se va a crear (documento, plantilla, carpeta). Modal: foco inicial
 * en el campo, Tab atrapado, Enter crea, Esc cancela y el foco vuelve al botón que la abrió. Un clic fuera solo la
 * cierra si no hay nada escrito (no se pierde un nombre a medias).
 */
export default function NameDialog({ title, glyph: Icon, label, value, onChange, confirmLabel, onSubmit, onCancel, location, placeholder, helper, error = null, busy = false, accent, children }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const ids = useId();
  const titleId = `${ids}-title`;
  const fieldId = `${ids}-field`;
  const helperId = `${ids}-helper`;
  const errorId = `${ids}-error`;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key === "Enter" && (event.target as HTMLElement).tagName === "INPUT" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!busy) onSubmit();
      return;
    }
    if (event.key !== "Tab") return;
    const items = [...(root.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onBackdropMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && value.trim() === "") onCancel();
  }

  const describedBy = [helper ? helperId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return createPortal(
    <div className="modal-backdrop name-dialog-backdrop" onMouseDown={onBackdropMouseDown}>
      <div
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="name-dialog"
        style={accent ? ({ "--name-accent": accent } as CSSProperties) : undefined}
        onKeyDown={onKeyDown}
      >
        <header className="name-dialog-header">
          <span className="name-dialog-badge" aria-hidden="true">
            <Icon size={18} />
          </span>
          <div className="name-dialog-heading">
            <h2 id={titleId} className="name-dialog-title">
              {title}
            </h2>
            <p className="name-dialog-location">
              <span className="name-dialog-location-label">Se creará en</span>
              <span className="name-dialog-path" title={location || "Raíz"}>
                <Folder size={12} aria-hidden="true" />
                <span className="name-dialog-path-text">{location || "Raíz"}</span>
              </span>
            </p>
          </div>
          <button type="button" className="name-dialog-close" aria-label="Cerrar" title="Cerrar" onClick={onCancel}>
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="name-dialog-body">
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
        <footer className="name-dialog-footer">
          <span className="name-dialog-keys" aria-hidden="true">
            <kbd>Enter</kbd> crear · <kbd>Esc</kbd> cancelar
          </span>
          <div className="name-dialog-actions">
            <button type="button" onClick={onCancel}>
              Cancelar
            </button>
            <button type="button" className="name-dialog-confirm" disabled={busy} onClick={onSubmit}>
              <Icon size={15} aria-hidden="true" />
              {confirmLabel}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
