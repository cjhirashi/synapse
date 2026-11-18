// Cálculo puro del zoom del visor de imagen: escala, desplazamiento y sus límites. Las coordenadas son relativas al centro del visor.
export const MIN_SCALE = 1;
export const MAX_SCALE = 8;
export const BUTTON_STEP = 1.5;
export const DOUBLE_TAP_SCALE = 2.5;

export interface View { scale: number; x: number; y: number }
/** Tamaño de la imagen a escala 1 (`w`, `h`) y del área visible (`vw`, `vh`). */
export interface Bounds { w: number; h: number; vw: number; vh: number }

export const IDENTITY: View = { scale: MIN_SCALE, x: 0, y: 0 };

export const clampScale = (scale: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

/** Deja el desplazamiento dentro de lo que la imagen ampliada cubre: nunca se puede sacar de la pantalla. */
export function clampView(view: View, bounds: Bounds): View {
  const limitX = Math.max(0, (bounds.w * view.scale - bounds.vw) / 2);
  const limitY = Math.max(0, (bounds.h * view.scale - bounds.vh) / 2);
  // `+ 0` evita el -0 que sale de limitar contra un límite 0.
  return { scale: view.scale, x: Math.min(limitX, Math.max(-limitX, view.x)) + 0, y: Math.min(limitY, Math.max(-limitY, view.y)) + 0 };
}

/** Cambia la escala dejando fijo el punto (`px`, `py`) de la imagen que está bajo el dedo, el cursor o el centro. */
export function zoomAt(view: View, nextScale: number, px: number, py: number, bounds: Bounds): View {
  const scale = clampScale(nextScale);
  const k = scale / view.scale;
  return clampView({ scale, x: px - (px - view.x) * k, y: py - (py - view.y) * k }, bounds);
}

/** Pellizco: la escala sigue a la distancia entre los dedos y la imagen acompaña al punto medio (que también puede moverse). */
export function pinch(start: View, startMid: { x: number; y: number }, startDist: number, mid: { x: number; y: number }, dist: number, bounds: Bounds): View {
  const scale = clampScale(start.scale * (dist / startDist));
  const k = scale / start.scale;
  return clampView({ scale, x: mid.x - (startMid.x - start.x) * k, y: mid.y - (startMid.y - start.y) * k }, bounds);
}

export const percent = (scale: number): string => `${Math.round(scale * 100)} %`;
