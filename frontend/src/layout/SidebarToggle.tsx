import { PanelLeft, PanelLeftClose } from "lucide-react";

interface SidebarToggleProps {
  open: boolean;
  /** `id` de la barra que alterna (`aria-controls`). */
  controls: string;
  onToggle: () => void;
  /** Sin nota abierta flota sobre el panel vacío; si no, usa el estilo de los botones del editor. */
  floating?: boolean;
  /** Qué barra es, para el nombre accesible: «la barra de notas» (bóveda) o «los filtros» (ventana global de tareas). */
  noun?: string;
}

/** Botón que alterna la barra lateral colapsable (H-009 C-1/C-8). Un único origen de marcado para todos los espacios de trabajo. */
export default function SidebarToggle({ open, controls, onToggle, floating = false, noun = "la barra de notas" }: SidebarToggleProps) {
  const label = `${open ? "Ocultar" : "Mostrar"} ${noun}`;
  return (
    <button
      type="button"
      className={floating ? "vault-sidebar-toggle vault-sidebar-toggle--floating" : "note-nav-button vault-sidebar-toggle"}
      aria-expanded={open}
      aria-controls={controls}
      aria-label={label}
      title={label}
      onClick={onToggle}
    >
      {open ? <PanelLeftClose size={16} aria-hidden="true" /> : <PanelLeft size={16} aria-hidden="true" />}
    </button>
  );
}
