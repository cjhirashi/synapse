// Visor de imagen a pantalla completa para las imágenes de los documentos (fijas o animadas), con zoom.
import { icon } from "./icons";
import { BUTTON_STEP, DOUBLE_TAP_SCALE, IDENTITY, MAX_SCALE, MIN_SCALE, clampView, percent, pinch, zoomAt, type Bounds, type View } from "./imageZoom";

let current: { close: () => void } | null = null;

const TAP_MOVE = 8; // px: más que esto ya es arrastre, no toque
const TAP_TIME = 300; // ms: un toque más largo no cuenta ni para cerrar ni para el doble toque

function controlButton(label: string, className: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `image-viewer-btn ${className}`;
  button.setAttribute("aria-label", label);
  button.title = label;
  return button;
}

/**
 * Abre la imagen en un visor que cubre la pantalla. Intenta la Fullscreen API y, donde no existe para elementos (iPhone), el propio
 * visor `fixed` ocupa toda la ventana. Zoom: botones «−», «+» y el porcentaje (restablece), pellizco con dos dedos, rueda del ratón,
 * doble toque o doble clic, y teclas `+`, `-` y `0`; ampliada, se arrastra. Se cierra con Esc, el botón o tocando el fondo.
 */
export function openImageViewer(src: string, alt: string): void {
  current?.close();

  const overlay = document.createElement("div");
  overlay.className = "image-viewer";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", alt || "Imagen a pantalla completa");

  const stage = document.createElement("div");
  stage.className = "image-viewer-stage";
  const img = document.createElement("img");
  img.className = "image-viewer-img";
  img.src = src;
  img.alt = alt;
  img.draggable = false;
  stage.appendChild(img);

  const closeBtn = controlButton("Cerrar pantalla completa", "image-viewer-close");
  closeBtn.textContent = "×";

  const controls = document.createElement("div");
  controls.className = "image-viewer-controls";
  controls.setAttribute("role", "toolbar");
  controls.setAttribute("aria-label", "Zoom de la imagen");
  const zoomOut = controlButton("Alejar", "image-viewer-zoom-out");
  zoomOut.appendChild(icon("zoom-out", 20));
  const reset = controlButton("Restablecer zoom", "image-viewer-zoom-reset");
  const zoomIn = controlButton("Acercar", "image-viewer-zoom-in");
  zoomIn.appendChild(icon("zoom-in", 20));
  controls.append(zoomOut, reset, zoomIn);

  overlay.append(stage, closeBtn, controls);

  let view: View = IDENTITY;
  const bounds = (): Bounds => ({ w: img.offsetWidth, h: img.offsetHeight, vw: stage.clientWidth, vh: stage.clientHeight });
  const center = (): { x: number; y: number } => {
    const box = stage.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  };
  /** Punto del evento relativo al centro del visor. */
  const local = (clientX: number, clientY: number): { x: number; y: number } => {
    const c = center();
    return { x: clientX - c.x, y: clientY - c.y };
  };

  function apply(next: View, animate = false): void {
    view = next;
    img.style.transition = animate ? "transform 0.18s ease-out" : "none";
    img.style.transform = view.scale === MIN_SCALE && view.x === 0 && view.y === 0 ? "" : `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    reset.textContent = percent(view.scale);
    zoomOut.disabled = view.scale <= MIN_SCALE;
    zoomIn.disabled = view.scale >= MAX_SCALE;
    stage.classList.toggle("is-zoomed", view.scale > MIN_SCALE);
  }
  const zoomBy = (factor: number, at = { x: 0, y: 0 }, animate = true): void => apply(zoomAt(view, view.scale * factor, at.x, at.y, bounds()), animate);

  zoomIn.addEventListener("click", () => zoomBy(BUTTON_STEP));
  zoomOut.addEventListener("click", () => zoomBy(1 / BUTTON_STEP));
  reset.addEventListener("click", () => apply(IDENTITY, true));
  controls.addEventListener("click", (event) => event.stopPropagation());
  controls.addEventListener("pointerdown", (event) => event.stopPropagation());

  // Gestos: los punteros activos (uno arrastra, dos pellizcan) y el último toque (para el doble toque y para cerrar).
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStart: { view: View; mid: { x: number; y: number }; dist: number } | null = null;
  let drag: { x: number; y: number; view: View } | null = null;
  let tap: { x: number; y: number; at: number; moved: boolean; onImage: boolean } | null = null;
  let lastTap: { x: number; y: number; at: number } | null = null;

  const pair = (): [{ x: number; y: number }, { x: number; y: number }] => {
    const [a, b] = [...pointers.values()];
    return [a, b];
  };
  const startPinch = (): void => {
    const [a, b] = pair();
    pinchStart = { view, mid: local((a.x + b.x) / 2, (a.y + b.y) / 2), dist: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
    drag = null;
  };

  stage.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    stage.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      tap = { x: event.clientX, y: event.clientY, at: event.timeStamp, moved: false, onImage: event.target === img };
      drag = { x: event.clientX, y: event.clientY, view };
    } else if (pointers.size === 2) {
      if (tap) tap.moved = true;
      startPinch();
    }
  });

  stage.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (tap && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > TAP_MOVE) tap.moved = true;
    if (pointers.size >= 2 && pinchStart) {
      const [a, b] = pair();
      const mid = local((a.x + b.x) / 2, (a.y + b.y) / 2);
      apply(pinch(pinchStart.view, pinchStart.mid, pinchStart.dist, mid, Math.hypot(a.x - b.x, a.y - b.y) || 1, bounds()));
    } else if (drag && view.scale > MIN_SCALE) {
      apply(clampView({ scale: view.scale, x: drag.view.x + event.clientX - drag.x, y: drag.view.y + event.clientY - drag.y }, bounds()));
    }
  });

  const release = (event: PointerEvent): void => {
    if (!pointers.delete(event.pointerId)) return;
    stage.releasePointerCapture?.(event.pointerId);
    if (pointers.size === 1) {
      // Quedó un dedo tras el pellizco: sigue como arrastre desde donde está, sin saltos.
      const [rest] = [...pointers.values()];
      drag = { x: rest.x, y: rest.y, view };
      pinchStart = null;
      return;
    }
    if (pointers.size > 0) return;
    pinchStart = null;
    drag = null;
    const finished = tap;
    tap = null;
    if (event.type !== "pointerup" || !finished || finished.moved || event.timeStamp - finished.at > TAP_TIME) return;
    if (!finished.onImage) {
      close(); // un toque limpio en el fondo cierra, como siempre
      return;
    }
    if (lastTap && event.timeStamp - lastTap.at < TAP_TIME && Math.hypot(finished.x - lastTap.x, finished.y - lastTap.y) < TAP_MOVE * 4) {
      lastTap = null;
      apply(view.scale > MIN_SCALE ? IDENTITY : zoomAt(view, DOUBLE_TAP_SCALE, local(finished.x, finished.y).x, local(finished.x, finished.y).y, bounds()), true);
    } else {
      lastTap = { x: finished.x, y: finished.y, at: event.timeStamp };
    }
  };
  stage.addEventListener("pointerup", release);
  stage.addEventListener("pointercancel", release);

  stage.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const point = local(event.clientX, event.clientY);
      // El pellizco del trackpad llega como rueda con Ctrl y deltas pequeños: se amplifica para que se sienta igual.
      zoomBy(Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015)), point, false);
    },
    { passive: false },
  );

  const onResize = (): void => apply(clampView(view, bounds()));
  const close = (): void => {
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("fullscreenchange", onFullscreenChange);
    window.removeEventListener("resize", onResize);
    if (document.fullscreenElement === overlay) void document.exitFullscreen().catch(() => {});
    overlay.remove();
    if (current?.close === close) current = null;
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    } else if (event.key === "+" || event.key === "=") {
      event.stopPropagation();
      zoomBy(BUTTON_STEP);
    } else if (event.key === "-" || event.key === "_") {
      event.stopPropagation();
      zoomBy(1 / BUTTON_STEP);
    } else if (event.key === "0") {
      event.stopPropagation();
      apply(IDENTITY, true);
    }
  };
  const onFullscreenChange = (): void => {
    if (!document.fullscreenElement) close();
  };

  closeBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    close();
  });
  closeBtn.addEventListener("pointerdown", (event) => event.stopPropagation());
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", onResize);
  document.body.appendChild(overlay);
  current = { close };
  apply(IDENTITY);

  if (typeof overlay.requestFullscreen === "function") {
    overlay
      .requestFullscreen()
      .then(() => document.addEventListener("fullscreenchange", onFullscreenChange))
      .catch(() => {});
  }
  closeBtn.focus();
}

/** Botón de ícono «pantalla completa» (esquina inferior derecha de la imagen). */
export function fullscreenButton(onOpen: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "md-img-fullscreen";
  button.setAttribute("aria-label", "Ver imagen en pantalla completa");
  button.title = "Pantalla completa";
  button.appendChild(icon("maximize", 16));
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onOpen();
  });
  return button;
}
