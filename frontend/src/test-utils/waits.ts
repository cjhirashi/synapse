// Política única de plazos de espera de las pruebas del frontend (F-4, PLAN-0008 §24).
//
// `asyncUtilTimeout` de Testing Library sólo gobierna `findBy*`/`waitFor` de RTL; `vi.waitFor` de
// Vitest tiene su propio plazo (1 s) y no lo hereda. Con varias suites a la vez (CI, Converge) la
// CPU saturada alarga pasos legítimos por encima de 1 s sin que haya ningún defecto. Todas las
// esperas por CONDICIÓN usan este plazo; las esperas de AUSENCIA no se tocan (no se relajan).
import { vi } from "vitest";

/** Plazo (ms) de toda espera por condición: `findBy*`, `waitFor` de RTL y `waitForCondition`. */
export const ASYNC_TIMEOUT_MS = 4000;

type WaitOptions = number | { timeout?: number; interval?: number };

/**
 * `vi.waitFor` con el plazo común. Un plazo explícito mayor se respeta (una prueba que sabe que
 * necesita más); uno menor se sube: sólo se espera más cuando algo falla de verdad.
 */
export function waitForCondition<T>(callback: () => T | Promise<T>, options: WaitOptions = {}) {
  const { timeout = 0, interval } = typeof options === "number" ? { timeout: options } : options;
  return vi.waitFor(callback, { timeout: Math.max(timeout, ASYNC_TIMEOUT_MS), ...(interval === undefined ? {} : { interval }) });
}
