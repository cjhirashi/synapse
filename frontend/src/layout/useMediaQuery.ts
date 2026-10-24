/**
 * Suscripción a una media query (SPEC-0010 T-049: migas compactas ≤ 480 px y bloque de creación colapsado ≤ 640 px).
 * `useSyncExternalStore` evita un primer pintado con el valor equivocado.
 */
import { useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
