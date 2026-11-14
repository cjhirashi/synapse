import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { useSidebarWidth } from "../notes/useSidebarWidth";
import { useMediaQuery } from "./useMediaQuery";

export interface CollapsibleSidebar {
  /** Móvil (≤ 640 px): la barra flota sobre el contenido. */
  isMobile: boolean;
  /** Escritorio (≥ 1024 px): la barra tiene ancho ajustable. */
  isDesktop: boolean;
  open: boolean;
  setOpen: (open: boolean | ((current: boolean) => boolean)) => void;
  toggle: () => void;
  /** `id` de la barra, para `aria-controls` del botón que la alterna. */
  id: string;
  ref: RefObject<HTMLDivElement>;
  width: number;
  setWidth: (width: number) => void;
  resetWidth: () => void;
}

/**
 * Comportamiento de la barra lateral colapsable de un espacio de trabajo (H-009, H-023): fija y visible en tableta y
 * escritorio, flotante y oculta por defecto en móvil. Al cruzar el breakpoint se recalcula la visibilidad; flotante y
 * abierta se cierra con un clic fuera (salvo en menús y diálogos) o con Escape. Lo comparten la bóveda y la ventana
 * global de tareas para que la barra se comporte igual en las dos.
 */
export function useCollapsibleSidebar(): CollapsibleSidebar {
  const isMobile = useMediaQuery("(max-width: 640px)");
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const { width, setWidth, reset } = useSidebarWidth();
  const [open, setOpen] = useState(() => !isMobile);
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(!isMobile);
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile || !open) return;
    const onDown = (e: globalThis.MouseEvent) => {
      const el = e.target as Element;
      // Ignora clics dentro de elementos portaled (menú, diálogos de confirmación).
      if (el?.closest?.(".note-menu") || el?.closest?.(".confirm-dialog") || el?.closest?.(".modal-backdrop")) return;
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [isMobile, open]);

  return { isMobile, isDesktop, open, setOpen, toggle: () => setOpen((value) => !value), id, ref, width, setWidth, resetWidth: reset };
}
