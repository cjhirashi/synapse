import { useEffect, useId, useRef, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, type LucideIcon } from "lucide-react";

export type DialogTone = "neutral" | "accent" | "danger" | "warning";

interface Props {
  /** `alertdialog` para confirmaciones que piden una respuesta; `dialog` para formularios y avisos. */
  role?: "dialog" | "alertdialog";
  titleId: string;
  title: string;
  /** Línea bajo el título (dónde se aplica, qué se va a hacer). */
  subtitle?: ReactNode;
  glyph: LucideIcon;
  /** Color de la insignia: `neutral` (info), `accent` (el de `accent` o el de la interfaz), `danger` o `warning`. */
  tone?: DialogTone;
  /** Color CSS para `tone="accent"` (por ejemplo el de la bóveda). */
  accent?: string;
  size?: "sm" | "md" | "lg";
  /** Escape, la X y el clic fuera (si `backdropClosable`): la respuesta que no cambia nada. */
  onCancel: () => void;
  /** Muestra la X de cerrar en la cabecera (por defecto no: las confirmaciones cierran con sus botones). */
  showClose?: boolean;
  /** Un clic en el fondo cierra la ventana. Por defecto sí; un formulario con texto escrito lo desactiva. */
  backdropClosable?: boolean;
  /** Enter dentro de un campo de texto. */
  onEnter?: () => void;
  /** La ventana aparece en el tercio superior (formularios cortos) en vez de centrada. */
  top?: boolean;
  /** Texto a la izquierda del pie (atajos, ayuda). */
  footerStart?: ReactNode;
  /** Botones del pie, en orden de tabulación: la respuesta segura primero y la acción principal al final. */
  actions?: ReactNode;
  children?: ReactNode;
}

const FOCUSABLE = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])";

/**
 * Marco único de las ventanas emergentes de Synapse: capa fija con el fondo atenuado (por portal en `document.body`),
 * cabecera con insignia + título, cuerpo con scroll propio y pie con las acciones. Gestión de foco del patrón
 * WAI-ARIA: foco inicial en el elemento con `data-autofocus` o, si no hay, en el primer control del cuerpo o del pie;
 * Tab atrapado; Escape = `onCancel`; al cerrarse, el foco vuelve a donde estaba al abrirse.
 */
export default function DialogFrame({
  role = "dialog",
  titleId,
  title,
  subtitle,
  glyph: Icon,
  tone = "neutral",
  accent,
  size = "md",
  onCancel,
  showClose = false,
  backdropClosable = true,
  onEnter,
  top = false,
  footerStart,
  actions,
  children,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const bodyId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // `data-autofocus` manda aunque esté en el pie; sin él, el primer control del cuerpo o del pie.
    const first =
      root.current?.querySelector<HTMLElement>("[data-autofocus]") ??
      root.current?.querySelector<HTMLElement>(".dlg-body :is(button, input, select, textarea):not([disabled]), .dlg-footer button:not([disabled])");
    first?.focus();
    return () => {
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  function onBackdropMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && backdropClosable) onCancel();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key === "Enter" && onEnter && !event.nativeEvent.isComposing) {
      const target = event.target as HTMLInputElement;
      if (target.tagName === "INPUT" && target.type === "text") {
        event.preventDefault();
        onEnter();
        return;
      }
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

  return createPortal(
    <div className={`modal-backdrop${top ? " dlg-backdrop-top" : ""}`} onMouseDown={onBackdropMouseDown}>
      <div
        ref={root}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={children && role === "alertdialog" ? bodyId : undefined}
        className={`dlg dlg-${size} dlg-tone-${tone}`}
        style={accent ? ({ "--dlg-accent": accent } as CSSProperties) : undefined}
        onKeyDown={onKeyDown}
      >
        <header className="dlg-header">
          <span className="dlg-badge" aria-hidden="true">
            <Icon size={18} />
          </span>
          <div className="dlg-heading">
            <h2 id={titleId} className="dlg-title">
              {title}
            </h2>
            {subtitle && <div className="dlg-subtitle">{subtitle}</div>}
          </div>
          {showClose && (
            <button type="button" className="dlg-close" aria-label="Cerrar" title="Cerrar" onClick={onCancel}>
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </header>
        {children && (
          <div id={bodyId} className="dlg-body">
            {children}
          </div>
        )}
        {(actions || footerStart) && (
          <footer className="dlg-footer">
            {footerStart && <div className="dlg-footer-start">{footerStart}</div>}
            {actions && <div className="dlg-actions">{actions}</div>}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
