/**
 * Aviso en el login de que la réplica no se pudo borrar al cerrar sesión (SPEC-0005 RF-017,
 * enmiendas 3 y 4; PLAN-0005 §12 VE-1, §13 VF-3 y VF-4).
 *
 * `SyncProvider` cierra la sesión en el servidor, marca la réplica como descartada y luego la
 * borra; si el borrado falla (IndexedDB con error) la sesión ya no existe, así que navega
 * igualmente a `/login` con `LocalCopyState` en el estado de navegación. `App.tsx` monta este
 * aviso junto a `LoginPage`. Si la marca quedó escrita, el próximo inicio de sesión termina
 * el borrado (`openLocalDb`) y el aviso lo anuncia.
 *
 * El estado se copia al montar y se quita de la entrada del historial: con `BrowserRouter`
 * viviría en `history.state` y «Atrás» volvería a mostrar el aviso cuando la copia ya se
 * borró (VF-3).
 */
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/** Estado de navegación hacia `/login` que deja `SyncProvider` cuando la copia se conserva. */
export interface LocalCopyState {
  localCopyKept: true;
  /** Si quedó la marca de borrado pendiente (`markDiscarded`). */
  discardPending: boolean;
}

export default function LocalCopyNotice() {
  const location = useLocation();
  const navigate = useNavigate();
  // El estado de navegación es `unknown`: puede venir de cualquier `navigate()`.
  const [notice] = useState(() => {
    const state = location.state as Partial<LocalCopyState> | null;
    return state?.localCopyKept === true ? { discardPending: state.discardPending === true } : null;
  });

  useEffect(() => {
    if (notice) navigate(location, { replace: true, state: null });
    // Sólo al montar: el aviso ya está copiado y la entrada no debe volver a mostrarlo.
  }, []);

  if (!notice) return null;
  return (
    <p role="alert">
      No se pudo borrar la copia local de este dispositivo.
      {notice.discardPending && " Se borrará la próxima vez que se inicie sesión en este dispositivo."}
    </p>
  );
}
