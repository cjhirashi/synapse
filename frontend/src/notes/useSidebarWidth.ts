import { useState } from "react";

export const SIDEBAR_MIN = 240;
export const SIDEBAR_MAX = 384;
export const SIDEBAR_STEP = 16;
const STORAGE_KEY = "synapse.sidebar-width";

export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, width));
}

// Un valor corrupto o fuera de rango se descarta por completo: forzarlo al límite más cercano daría un
// ancho que nadie eligió.
function readStored(): number {
  try {
    const width = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isInteger(width) && width >= SIDEBAR_MIN && width <= SIDEBAR_MAX ? width : SIDEBAR_MIN;
  } catch {
    return SIDEBAR_MIN;
  }
}

function writeStored(width: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(width));
  } catch {
    // Sin almacenamiento (modo privado, cuota llena) el ancho sigue vigente hasta recargar.
  }
}

export function useSidebarWidth() {
  const [width, setWidthState] = useState(readStored);

  function setWidth(next: number) {
    const clamped = clampSidebarWidth(next);
    writeStored(clamped);
    setWidthState(clamped);
  }

  return { width, setWidth, reset: () => setWidth(SIDEBAR_MIN) };
}
