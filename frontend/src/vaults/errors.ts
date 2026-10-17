/**
 * Errores de `vaultStore` que las páginas de bóvedas tratan igual (SPEC-0005 RF-009; R-11).
 */
import { StorageFullError, VaultChangedError, VaultNotFoundError } from "../sync/vaultStore";

/** Aviso de cuota agotada (R-11): lo escrito no se guardó en este dispositivo. */
export const STORAGE_FULL = "No queda espacio en este dispositivo para guardar cambios. Libera espacio e inténtalo de nuevo.";

/**
 * La vista está desfasada: otra pestaña o el pull cambió la bóveda (otra revisión) o ya no
 * está en esta lista. La pantalla avisa y recarga para mostrar el estado real.
 */
export function isStale(err: unknown): boolean {
  return err instanceof VaultChangedError || err instanceof VaultNotFoundError;
}

export function isStorageFull(err: unknown): boolean {
  return err instanceof StorageFullError;
}
