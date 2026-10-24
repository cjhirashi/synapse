/**
 * Aviso del editor (SPEC-0010 RF-008, RF-017, RF-019, RF-044, RF-045; PLAN-0010 §2.3-d): borde izquierdo
 * de 3 px + icono + texto en `--text-primary` (el color nunca es el único portador del significado).
 * Tres variantes sobre `.note-editor-notice`: informativa y advertencia (`role="status"`, no
 * interrumpen) y error (`role="alert"`). Acción opcional y «Cerrar aviso» opcional.
 */
import type { ReactNode } from "react";
import { CircleAlert, Info, TriangleAlert, X } from "lucide-react";

export type NoticeVariant = "info" | "warning" | "error";

interface NoticeProps {
  variant: NoticeVariant;
  children: ReactNode;
  /** Botón de acción (p. ej. «Renombrar», «Ir a la línea 3»). */
  action?: { label: string; onClick: () => void };
  /** Con función, se ofrece «Cerrar aviso». */
  onClose?: () => void;
}

const ICONS = { info: Info, warning: TriangleAlert, error: CircleAlert } as const;

/** Textos exactos de PLAN-0010 §2.3-d (microcopy en un solo lugar). */
export const noticeText = {
  /** Previo de YAML heredado (P-5, RF-044). */
  legacyBefore: "Esta nota tiene propiedades escritas dentro del texto. Se moverán al panel de propiedades cuando guardes.",
  /** Tras guardar (RF-044). */
  legacyAfter: "Las propiedades se movieron fuera del texto. Ahora están en el panel de propiedades.",
  /** Parece YAML, sólo en Visual (RF-045). */
  looksYaml: "El inicio de la nota parece YAML, pero no se trata como propiedades. Edítalo en Código si quieres convertirlo.",
  /** Título del aviso de YAML inválido (RF-017); el motivo y la línea van aparte. */
  yamlInvalid: "El bloque de propiedades no es YAML válido",
  yamlNotSaved: "No se guardó nada y tu texto sigue igual. Corrígelo y vuelve a guardar.",
  /** Propiedades > 64 KiB (RF-019). */
  frontmatterTooBig: (kib: number) => `Las propiedades ocupan ${kib} KiB y el límite es 64 KiB. Acorta o quita valores y vuelve a guardar.`,
  /** Ruta inválida heredada (RF-008). */
  invalidPath: "Esta nota tiene un nombre no válido (termina en «/» o es «.md»). Renómbrala para guardar tus cambios; tu borrador se conserva.",
} as const;

export function Notice({ variant, children, action, onClose }: NoticeProps) {
  const Icon = ICONS[variant];
  return (
    <div className={`note-editor-notice note-notice-${variant}`} role={variant === "error" ? "alert" : "status"}>
      <Icon size={16} aria-hidden="true" className="note-notice-icon" />
      <div className="note-notice-body">{children}</div>
      {action && (
        <button type="button" onClick={action.onClick}>
          {action.label}
        </button>
      )}
      {onClose && (
        <button type="button" className="note-notice-close" aria-label="Cerrar aviso" onClick={onClose}>
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
