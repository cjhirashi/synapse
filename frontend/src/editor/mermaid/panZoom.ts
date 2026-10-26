/**
 * Zoom y desplazamiento de los diagramas anchos (SPEC-0010 RF-052; PLAN-0010 §2.3-f, P-10, C-6).
 *
 * `svg-pan-zoom` (≈10 KiB gzip) se pide con `import()` sólo cuando un diagrama excede la columna o el alto
 * máximo (RNF-002): `codeBlockView` llama a `attachPanZoom` únicamente en ese caso. Aquí vive todo lo que la
 * aplicación decide sobre la biblioteca: ajuste inicial al área, límites 0,2×…10×, botones (Acercar, Alejar,
 * Reajustar vista) que se deshabilitan en los límites, teclado en el área enfocada y rueda **sólo con
 * Ctrl/⌘** (C-6: sin ellas la rueda sigue desplazando la página, no atrapa el scroll). La biblioteca aplica el
 * `transform` sin interpolar, así que no hay animación propia que recortar con `prefers-reduced-motion`.
 */
import type SvgPanZoom from "svg-pan-zoom";

/** Botones de zoom que construye el bloque; esta capa los conecta y los habilita o deshabilita. */
export interface ZoomButtons {
  zoomIn: HTMLButtonElement;
  zoomOut: HTMLButtonElement;
  reset: HTMLButtonElement;
}

export interface PanZoomHandle {
  destroy(): void;
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 10;
/** Factor de los botones y del teclado por paso. */
const STEP = 1.25;
/** Desplazamiento por flecha en px (con Mayús, el cuádruple). */
const PAN_STEP = 40;
const PAN_STEP_FAST = 160;
/** Tolerancia para decir «ya está ajustado» (zoom y posición). */
const EPSILON = 1e-3;

/** Qué hace cada tecla del área enfocada. */
type KeyAction = (zoom: Zoom) => void;
interface Zoom {
  by(factor: number): void;
  pan(x: number, y: number): void;
  reset(): void;
}

export async function attachPanZoom(area: HTMLElement, svg: SVGSVGElement, buttons: ZoomButtons): Promise<PanZoomHandle> {
  const all = Object.values(buttons);
  let instance: SvgPanZoom.Instance;
  try {
    const { default: svgPanZoom } = await import("svg-pan-zoom");
    let sync = () => {};
    instance = svgPanZoom(svg, {
      fit: true,
      center: true,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      panEnabled: true,
      zoomEnabled: true,
      // La rueda y el doble clic de la biblioteca atrapan el scroll de la página: la rueda se atiende abajo, con Ctrl/⌘.
      mouseWheelZoomEnabled: false,
      dblClickZoomEnabled: false,
      controlIconsEnabled: false,
      onZoom: () => sync(),
      onPan: () => sync(),
    });
    // Posición «ajustada» (tras el ajuste y centrado iniciales): a ella vuelve «Reajustar vista».
    const home = instance.getPan();
    const isFit = () => {
      const pan = instance.getPan();
      return Math.abs(instance.getZoom() - 1) < EPSILON && Math.abs(pan.x - home.x) < 1 && Math.abs(pan.y - home.y) < 1;
    };
    sync = () => {
      const zoom = instance.getZoom();
      buttons.zoomIn.disabled = zoom >= MAX_ZOOM - EPSILON;
      buttons.zoomOut.disabled = zoom <= MIN_ZOOM + EPSILON;
      buttons.reset.disabled = isFit();
    };
    return wire(area, svg, buttons, instance, sync);
  } catch {
    // La biblioteca no cargó (red, chunk ausente) o no pudo medir el SVG: el diagrama se ve, sin controles.
    for (const button of all) button.disabled = true;
    return { destroy() {} };
  }
}

/** Conecta botones, teclado, rueda y cambios de tamaño; devuelve cómo soltarlo todo. */
function wire(area: HTMLElement, svg: SVGSVGElement, buttons: ZoomButtons, instance: SvgPanZoom.Instance, sync: () => void): PanZoomHandle {
  const zoom: Zoom = {
    by: (factor) => void instance.zoomBy(factor),
    pan: (x, y) => void instance.panBy({ x, y }),
    reset: () => {
      instance.fit();
      instance.center();
      sync();
    },
  };

  const onZoomIn = () => zoom.by(STEP);
  const onZoomOut = () => zoom.by(1 / STEP);
  buttons.zoomIn.addEventListener("click", onZoomIn);
  buttons.zoomOut.addEventListener("click", onZoomOut);
  buttons.reset.addEventListener("click", zoom.reset);

  // Teclado: sólo con el foco en el área (no en un botón) y sin Ctrl/⌘/Alt (atajos del navegador y del editor).
  const keys = (event: KeyboardEvent): KeyAction | null => {
    const step = event.shiftKey ? PAN_STEP_FAST : PAN_STEP;
    switch (event.key) {
      case "ArrowLeft": return (z) => z.pan(step, 0);
      case "ArrowRight": return (z) => z.pan(-step, 0);
      case "ArrowUp": return (z) => z.pan(0, step);
      case "ArrowDown": return (z) => z.pan(0, -step);
      case "+": case "=": return (z) => z.by(STEP);
      case "-": case "_": return (z) => z.by(1 / STEP);
      case "0": return (z) => z.reset();
      default: return null;
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target !== area || event.ctrlKey || event.metaKey || event.altKey) return;
    const action = keys(event);
    if (!action) return;
    event.preventDefault();
    action(zoom);
  };
  area.addEventListener("keydown", onKeyDown);

  // Rueda: sólo con Ctrl o ⌘ (también es como llega el pellizco del trackpad); sin ellas se desplaza la página.
  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const box = svg.getBoundingClientRect();
    instance.zoomAtPointBy(Math.exp(-event.deltaY * 0.002), { x: event.clientX - box.left, y: event.clientY - box.top });
  };
  area.addEventListener("wheel", onWheel, { passive: false });

  // Si el área cambia de tamaño (panel lateral, ventana) el diagrama se vuelve a ajustar. El primer aviso de
  // `ResizeObserver` es la medida inicial, no un cambio.
  let observer: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    let first = true;
    observer = new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      instance.resize();
      zoom.reset();
    });
    observer.observe(area);
  }

  sync();
  return {
    destroy() {
      buttons.zoomIn.removeEventListener("click", onZoomIn);
      buttons.zoomOut.removeEventListener("click", onZoomOut);
      buttons.reset.removeEventListener("click", zoom.reset);
      area.removeEventListener("keydown", onKeyDown);
      area.removeEventListener("wheel", onWheel);
      observer?.disconnect();
      instance.destroy();
    },
  };
}
