/**
 * Diálogo de confirmación (`alertdialog`) modal: capa fija centrada en la ventana, por portal en `document.body`
 * (nunca queda al final de una lista larga ni dentro de un panel con scroll). Clic fuera = la respuesta segura.
 *
 * Diseño: icono de tono (peligro / aviso / neutro), título, texto de apoyo (`body`) y, abajo a la derecha, los
 * botones en este orden: la respuesta segura (secundaria) primero y la acción principal al final; la destructiva
 * lleva `btn-danger` y la constructiva `btn-primary`.
 *
 * Gestión de foco del patrón WAI-ARIA (U-1, PLAN-0008 §17): foco inicial en su primer botón (o en el que lleve
 * `data-autofocus`, E-5: en el diálogo de borrado, la respuesta segura y no la acción destructiva), Tab atrapado
 * dentro, Escape = la respuesta segura (`onCancel`) y, al cerrarse, el foco vuelve a donde estaba al abrirse
 * (el disparador: un botón, un enlace del riel, la fila del árbol…).
 */
import { KeyboardEvent, MouseEvent, ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Info, TriangleAlert, type LucideIcon } from "lucide-react";

interface ConfirmDialogProps {
  /** `id` del texto que da nombre al diálogo (`aria-labelledby`). */
  titleId: string;
  title: string;
  /** Escape: la respuesta que no hace nada irreversible. */
  onCancel: () => void;
  /** Color del icono: `danger` (borrar, revocar), `warning` (cambios sin guardar) o `neutral`. */
  tone?: "danger" | "warning" | "neutral";
  /** Icono del encabezado (`glyph`); por defecto, uno propio del tono. */
  glyph?: LucideIcon;
  /** Texto de apoyo bajo el título (consecuencias, lista de afectados, un campo). */
  body?: ReactNode;
  /** Los botones, en orden de tabulación; recibe el foco el marcado con `data-autofocus` o, si no, el primero. */
  children: ReactNode;
}

const FOCUSABLE = "button:not([disabled]), input:not([disabled])";

export function ConfirmDialog({ titleId, title, onCancel, tone = "neutral", glyph, body, children }: ConfirmDialogProps) {
  const root = useRef<HTMLDivElement>(null);
  const bodyId = useId();
  const Icon = glyph ?? (tone === "neutral" ? Info : TriangleAlert);

  useEffect(() => {
    // El elemento enfocado ANTES de abrir: a él se vuelve al cerrar.
    const previous = document.activeElement as HTMLElement | null;
    (root.current?.querySelector<HTMLElement>("[data-autofocus]") ?? root.current?.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    return () => {
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  function onBackdropMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onCancel();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Modal: ninguna tecla sube a los atajos del panel que lo abrió (árbol, editor…).
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    // Foco atrapado: desde el último vuelve al primero y desde el primero al último.
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
    <div className="modal-backdrop" onMouseDown={onBackdropMouseDown}>
      <div
        ref={root}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={body ? bodyId : undefined}
        className={`confirm-dialog confirm-dialog-${tone}`}
        onKeyDown={onKeyDown}
      >
        <span className="confirm-dialog-icon" aria-hidden="true">
          <Icon size={20} />
        </span>
        <div className="confirm-dialog-content">
          <p id={titleId} className="confirm-dialog-title">
            {title}
          </p>
          {body && (
            <div id={bodyId} className="confirm-dialog-body">
              {body}
            </div>
          )}
        </div>
        <div className="confirm-dialog-actions">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
