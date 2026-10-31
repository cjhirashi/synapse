import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { clampSidebarWidth, SIDEBAR_MAX, SIDEBAR_MIN, SIDEBAR_STEP } from "./useSidebarWidth";

interface SidebarResizeHandleProps {
  width: number;
  onChange: (width: number) => void;
  onReset: () => void;
}

// El arrastre escucha en `window`: el mouse puede salir del asa (6 px) sin que el ancho deje de seguirlo.
export default function SidebarResizeHandle({ width, onChange, onReset }: SidebarResizeHandleProps) {
  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    // Sin esto el arrastre selecciona el texto del árbol y el navegador envía clics a las filas debajo.
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;

    function onPointerMove(move: PointerEvent) {
      onChange(clampSidebarWidth(startWidth + move.clientX - startX));
    }

    // `pointercancel` también termina el arrastre: sin él, un gesto cancelado dejaría `is-resizing` (sin
    // selección de texto, cursor fijo) pegado al cuerpo.
    function onPointerUp() {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      document.body.classList.remove("is-resizing");
    }

    document.body.classList.add("is-resizing");
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Home") {
      onReset();
    } else if (event.key === "ArrowLeft") {
      onChange(clampSidebarWidth(width - SIDEBAR_STEP));
    } else if (event.key === "ArrowRight") {
      onChange(clampSidebarWidth(width + SIDEBAR_STEP));
    } else {
      return;
    }
    event.preventDefault();
  }

  return (
    <div
      role="separator"
      aria-label="Ancho de la barra lateral"
      aria-orientation="vertical"
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      tabIndex={0}
      className="sidebar-resize-handle"
      onPointerDown={onPointerDown}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    />
  );
}
