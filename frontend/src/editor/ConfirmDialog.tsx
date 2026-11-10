/**
 * Diálogo de confirmación (`alertdialog`) modal sobre el marco común `DialogFrame`: capa fija centrada en la ventana,
 * por portal en `document.body` (nunca queda al final de una lista larga ni dentro de un panel con scroll). Clic fuera =
 * la respuesta segura.
 *
 * Diseño: insignia de tono (peligro / aviso / neutro) y título en la cabecera, texto de apoyo (`body`) y, en el pie, los
 * botones en este orden: la respuesta segura (secundaria) primero y la acción principal al final; la destructiva
 * lleva `btn-danger` y la constructiva `btn-primary`.
 *
 * Gestión de foco del patrón WAI-ARIA (U-1, PLAN-0008 §17): foco inicial en el elemento con `data-autofocus` o, si
 * no, en el primer control del cuerpo o del pie (E-5: en el diálogo de borrado, la respuesta segura y no la acción
 * destructiva), Tab atrapado dentro, Escape = la respuesta segura (`onCancel`) y, al cerrarse, el foco vuelve a donde
 * estaba al abrirse (el disparador: un botón, un enlace del riel, la fila del árbol…).
 */
import { ReactNode } from "react";
import { Info, TriangleAlert, type LucideIcon } from "lucide-react";
import DialogFrame from "./DialogFrame";

interface ConfirmDialogProps {
  /** `id` del texto que da nombre al diálogo (`aria-labelledby`). */
  titleId: string;
  title: string;
  /** Escape: la respuesta que no hace nada irreversible. */
  onCancel: () => void;
  /** Color de la insignia: `danger` (borrar, revocar), `warning` (cambios sin guardar) o `neutral`. */
  tone?: "danger" | "warning" | "neutral";
  /** Icono del encabezado (`glyph`); por defecto, uno propio del tono. */
  glyph?: LucideIcon;
  /** Texto de apoyo bajo el título (consecuencias, lista de afectados, un campo). */
  body?: ReactNode;
  /** Los botones, en orden de tabulación; recibe el foco el marcado con `data-autofocus` o, si no, el primero. */
  children: ReactNode;
}

export function ConfirmDialog({ titleId, title, onCancel, tone = "neutral", glyph, body, children }: ConfirmDialogProps) {
  return (
    <DialogFrame role="alertdialog" titleId={titleId} title={title} glyph={glyph ?? (tone === "neutral" ? Info : TriangleAlert)} tone={tone} onCancel={onCancel} actions={children}>
      {body}
    </DialogFrame>
  );
}
