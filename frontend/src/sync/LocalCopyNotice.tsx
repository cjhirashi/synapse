/**
 * Aviso en el login de que la réplica no se pudo borrar al cerrar sesión (SPEC-0005 RF-017,
 * enmienda 3; PLAN-0005 §12 VE-1).
 *
 * `SyncProvider` cierra la sesión en el servidor y luego borra la réplica; si el borrado
 * falla (IndexedDB con error) la sesión ya no existe, así que navega igualmente a `/login`
 * con `{ localCopyKept: true }` en el estado de navegación. `App.tsx` monta este aviso junto
 * a `LoginPage`. La copia la resuelve el próximo inicio de sesión (RF-018).
 */
import { useLocation } from "react-router-dom";

/** Estado de navegación hacia `/login` que deja `SyncProvider` cuando la copia se conserva. */
export interface LocalCopyState {
  localCopyKept: true;
}

export default function LocalCopyNotice() {
  // El estado de navegación es `unknown`: puede venir de cualquier `navigate()`.
  const state = useLocation().state as Partial<LocalCopyState> | null;
  if (state?.localCopyKept !== true) return null;
  return <p role="alert">No se pudo borrar la copia local de este dispositivo.</p>;
}
