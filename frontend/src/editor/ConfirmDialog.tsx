/**
 * Diálogo de confirmación del editor (`alertdialog`) con la gestión de foco del patrón WAI-ARIA
 * (U-1, PLAN-0008 §17): foco inicial en su primer botón, Tab atrapado dentro, Escape = la
 * respuesta segura (`onCancel`, «Seguir editando») y, al cerrarse, el foco vuelve a donde estaba
 * al abrirse (el disparador: un botón, un enlace del riel, la fila del árbol…).
 */
import { KeyboardEvent, ReactNode, useEffect, useRef } from "react";

interface ConfirmDialogProps {
  /** `id` del texto que da nombre al diálogo (`aria-labelledby`). */
  titleId: string;
  title: string;
  /** Escape: la respuesta que no hace nada irreversible. */
  onCancel: () => void;
  /** Los botones, en orden de tabulación; el primero recibe el foco. */
  children: ReactNode;
}

const FOCUSABLE = "button:not([disabled])";

export function ConfirmDialog({ titleId, title, onCancel, children }: ConfirmDialogProps) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // El elemento enfocado ANTES de abrir: a él se vuelve al cerrar.
    const previous = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => {
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
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

  return (
    <div
      ref={root}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="note-editor-confirm"
      onKeyDown={onKeyDown}
    >
      <p id={titleId}>{title}</p>
      {children}
    </div>
  );
}
