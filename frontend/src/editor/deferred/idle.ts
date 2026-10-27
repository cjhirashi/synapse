/**
 * Utilidades para sacar trabajo decorativo del camino crítico (SPEC-0010 RNF-001; PLAN-0010 §11.2).
 *
 * El resaltado y los diagramas no deben competir con «clic → legible»: se hacen cuando el navegador está
 * ocioso (`whenIdle`) y, los diagramas, sólo cerca del viewport (`observeVisibility`).
 */

/** Ejecuta `run` cuando el navegador esté ocioso (como mucho tras `timeout` ms); devuelve cómo cancelarlo. */
export function whenIdle(run: () => void, timeout = 300): () => void {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(() => run(), { timeout });
    return () => cancelIdleCallback(handle);
  }
  // Sin `requestIdleCallback` (Safari, jsdom): un turno de evento después.
  const handle = setTimeout(run, 0);
  return () => clearTimeout(handle);
}

/**
 * Avisa cuando `element` entra en (o se acerca a, 300 px) el viewport y cuando sale. Sin `IntersectionObserver`
 * se considera visible desde el principio. Devuelve cómo dejar de observar.
 */
export function observeVisibility(element: Element, onChange: (visible: boolean) => void, rootMargin = "300px 0px"): () => void {
  if (typeof IntersectionObserver === "undefined") {
    onChange(true);
    return () => {};
  }
  const observer = new IntersectionObserver((entries) => {
    // Sólo importa el último estado de este elemento.
    const last = entries[entries.length - 1];
    if (last) onChange(last.isIntersecting);
  }, { rootMargin });
  observer.observe(element);
  return () => observer.disconnect();
}
