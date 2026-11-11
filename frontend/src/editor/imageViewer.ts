// Visor de imagen a pantalla completa para las imágenes de los documentos (fijas o animadas).
import { icon } from "./icons";

let current: { close: () => void } | null = null;

/**
 * Abre la imagen en un visor que cubre la pantalla. Intenta la Fullscreen API y, donde no existe para
 * elementos (iPhone), el propio visor `fixed` ocupa toda la ventana. Se cierra con Esc, un toque o el botón.
 */
export function openImageViewer(src: string, alt: string): void {
  current?.close();

  const overlay = document.createElement("div");
  overlay.className = "image-viewer";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", alt || "Imagen a pantalla completa");

  const img = document.createElement("img");
  img.className = "image-viewer-img";
  img.src = src;
  img.alt = alt;

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "image-viewer-close";
  closeBtn.setAttribute("aria-label", "Cerrar pantalla completa");
  closeBtn.textContent = "×";

  overlay.append(img, closeBtn);

  const close = (): void => {
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("fullscreenchange", onFullscreenChange);
    if (document.fullscreenElement === overlay) void document.exitFullscreen().catch(() => {});
    overlay.remove();
    if (current?.close === close) current = null;
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    close();
  };
  const onFullscreenChange = (): void => {
    if (!document.fullscreenElement) close();
  };

  overlay.addEventListener("click", close);
  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(overlay);
  current = { close };

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
