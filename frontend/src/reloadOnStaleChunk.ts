/**
 * Tras un despliegue, una pestaña abierta con el build anterior pide chunks que ya no existen y la pantalla falla.
 * Vite avisa con `vite:preloadError`: se recarga una vez (la marca en sessionStorage evita un bucle si el fallo es otro).
 */
const KEY = "synapse.stale-chunk-reload";

export function installStaleChunkReload(target: Window = window, reload: () => void = () => window.location.reload()): void {
  target.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    try {
      if (target.sessionStorage.getItem(KEY)) return;
      target.sessionStorage.setItem(KEY, "1");
    } catch {
      return;
    }
    reload();
  });
  // Una carga correcta posterior rearma la protección para el próximo despliegue.
  target.addEventListener("load", () => {
    try {
      target.sessionStorage.removeItem(KEY);
    } catch {
      // sin sessionStorage no hay marca que limpiar
    }
  });
}
