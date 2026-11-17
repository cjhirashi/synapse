import { useCallback, useEffect, useRef, useState } from "react";
import { getPublication, type PublicationStatus } from "./publicationApi";

/**
 * Estado de publicación de un documento (H-035). Con `enabled` falso o sin `noteId` devuelve `status: null` y no consulta.
 * Consulta al abrir el documento y cada vez que cambia su `rev` (al guardarse puede pasar a «desactualizada»); mientras se
 * repite la consulta por un cambio de `rev` se conserva el estado anterior, para que los controles no parpadeen.
 */
export function usePublication(
  vaultId: string,
  noteId: string | null,
  enabled: boolean,
  rev: string | null | undefined,
): {
  status: PublicationStatus | null;
  setStatus: (status: PublicationStatus | null) => void;
  refresh: () => Promise<void>;
} {
  const [status, setStatus] = useState<PublicationStatus | null>(null);
  const identity = useRef("");

  useEffect(() => {
    let alive = true;
    const next = `${vaultId}|${noteId}|${enabled}`;
    if (identity.current !== next) {
      identity.current = next;
      setStatus(null); // otro documento: no se muestra el estado del anterior
    }
    if (!enabled || noteId === null) return;
    getPublication(vaultId, noteId).then((result) => alive && setStatus(result), () => undefined);
    return () => { alive = false; };
  }, [vaultId, noteId, enabled, rev]);

  const refresh = useCallback(async () => {
    if (!enabled || noteId === null) return;
    try {
      setStatus(await getPublication(vaultId, noteId));
    } catch {
      // Un fallo de red deja el estado como estaba.
    }
  }, [vaultId, noteId, enabled]);

  return { status, setStatus, refresh };
}
