import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import SidebarResizeHandle from "../notes/SidebarResizeHandle";
import type { CollapsibleSidebar } from "./useCollapsibleSidebar";
import SidebarToggle from "./SidebarToggle";

interface WorkspaceShellProps {
  sidebar: CollapsibleSidebar;
  /** Qué barra es, para el nombre accesible del botón («la barra de notas», «los filtros»). */
  noun?: string;
  /** Sustituye al alternar por defecto (la bóveda cierra antes su barra derecha en móvil). */
  onToggle?: () => void;
  /** Lo que va en la franja superior, antes del título (el chip de la bóveda, un ícono). */
  titleStart: ReactNode;
  title: string;
  /** Lo que va al final de la franja superior (el botón de la barra derecha). */
  titleEnd?: ReactNode;
  /** Color del espacio de trabajo (`--vault-icon-color`). */
  accent: string;
  /** El contenido de la barra lateral. */
  side: ReactNode;
  /** Atributos extra de la barra (la bóveda anima el cambio de pestaña con `data-moved`). */
  sideProps?: HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string | undefined>;
  shellProps?: HTMLAttributes<HTMLDivElement>;
  /** Lo que va junto a la barra: la zona principal y, si la hay, la barra derecha. */
  children: ReactNode;
}

/**
 * Marco de un espacio de trabajo con barra lateral colapsable (H-009, H-023, H-056): franja superior con el botón de la barra
 * y el título, barra fija a la izquierda (ancho ajustable en escritorio) o flotante en móvil, y la zona principal. Lo
 * usan la bóveda y la ventana global de tareas: misma estructura, mismos estilos y mismo comportamiento.
 */
export default function WorkspaceShell({ sidebar, noun, onToggle, titleStart, title, titleEnd, accent, side, sideProps, shellProps, children }: WorkspaceShellProps) {
  return (
    <div className="vault-workspace-shell" {...shellProps}>
      <div className="vault-workspace-titlebar">
        <SidebarToggle open={sidebar.open} controls={sidebar.id} onToggle={onToggle ?? sidebar.toggle} noun={noun} />
        {titleStart}
        <h1 className="vault-workspace-title" title={title}>
          {title}
        </h1>
        {titleEnd}
      </div>
      <div className="vault-workspace">
        <div
          className="vault-workspace-side"
          ref={sidebar.ref}
          id={sidebar.id}
          // `data-open`/`data-floating` gobiernan la barra vía CSS: dockeada en > 640 px, overlay en móvil (C-2/C-5).
          data-open={sidebar.open ? "" : undefined}
          data-floating={sidebar.isMobile ? "" : undefined}
          style={{ "--vault-icon-color": accent, ...(sidebar.isDesktop ? { "--side-width": `${sidebar.width}px` } : {}) } as CSSProperties}
          {...sideProps}
        >
          {side}
          {sidebar.isDesktop && sidebar.open && <SidebarResizeHandle width={sidebar.width} onChange={sidebar.setWidth} onReset={sidebar.resetWidth} />}
        </div>
        {children}
      </div>
    </div>
  );
}
