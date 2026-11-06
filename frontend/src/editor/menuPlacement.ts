/**
 * Posición de un menú flotante (`position: fixed`) anclado a su botón: debajo si cabe; si no, arriba; y si
 * tampoco, pegado al borde de la ventana. Horizontalmente alineado a la derecha del botón sin salirse por
 * la izquierda. Misma regla que la tarjeta de vista previa de wikilinks.
 */
import { RefObject, useLayoutEffect, useState } from "react";

const GAP = 4;
const EDGE = 8;

export interface MenuPosition {
  top: number;
  right: number;
}

export function placeMenu(
  trigger: { top: number; bottom: number; right: number },
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
): MenuPosition {
  const below = trigger.bottom + GAP;
  const above = trigger.top - GAP - menu.height;
  let top = below;
  if (below + menu.height > viewport.height - EDGE) {
    top = above >= EDGE ? above : Math.max(EDGE, viewport.height - EDGE - menu.height);
  }
  const right = Math.max(0, Math.min(viewport.width - trigger.right, viewport.width - menu.width - EDGE));
  return { top, right };
}

/**
 * Calcula la posición del menú abierto antes de pintarlo (con su tamaño real) y lo cierra si la ventana
 * cambia de tamaño o algo se desplaza, porque el botón se movería y el menú quedaría suelto.
 */
export function useMenuPosition(
  open: boolean,
  trigger: RefObject<HTMLElement | null>,
  menu: RefObject<HTMLElement | null>,
  dismiss: () => void,
): MenuPosition {
  const [position, setPosition] = useState<MenuPosition>({ top: 0, right: 0 });

  useLayoutEffect(() => {
    if (!open) return;
    const box = trigger.current?.getBoundingClientRect();
    const size = menu.current?.getBoundingClientRect();
    if (!box || !size) return;
    setPosition(placeMenu(box, size, { width: window.innerWidth, height: window.innerHeight }));
  }, [open, trigger, menu]);

  useLayoutEffect(() => {
    if (!open) return;
    // Sólo un scroll que mueve el botón (su contenedor o la página) lo suelta del menú; los demás se ignoran.
    const onScroll = (event: Event) => {
      const origin = event.target;
      if (origin === document || (origin instanceof Node && origin.contains(trigger.current))) dismiss();
    };
    window.addEventListener("resize", dismiss);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", dismiss);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [open, trigger, dismiss]);

  return position;
}
