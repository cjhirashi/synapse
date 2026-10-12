import { ApiError } from "../api/problems";
import { VAULT_PROBLEM } from "../api/vaults";

/** `request()` ya intentó renovar la sesión: un 401 que llega aquí es una sesión cerrada. */
export function isSessionClosed(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

/**
 * La vista está desfasada: otra pestaña o dispositivo cambió la bóveda (412) o ya no está
 * en esta lista (404). La pantalla avisa y recarga para mostrar el estado real.
 */
export function isStale(err: unknown): boolean {
  return err instanceof ApiError && (err.type === VAULT_PROBLEM.preconditionFailed || err.type === VAULT_PROBLEM.notFound);
}
