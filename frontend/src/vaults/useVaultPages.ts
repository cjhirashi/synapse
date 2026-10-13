import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listVaults, Vault } from "../api/vaults";
import { isSessionClosed } from "./errors";

type Status = "loading" | "ready" | "error";

/**
 * Lista paginada de bóvedas activas o de la papelera (RF-018, RF-028): primera página al
 * montar y páginas siguientes con `next_cursor` ("Cargar más").
 *
 * Cada recarga abre una generación nueva: una respuesta de una generación anterior (una
 * recarga o un "Cargar más" que seguía en vuelo) se descarta en vez de mezclarse con la
 * lista recargada (PLAN-0003 §15, VA-9).
 */
export function useVaultPages(deleted: boolean) {
  const navigate = useNavigate();
  const [items, setItems] = useState<Vault[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const generation = useRef(0);

  /** Una sesión cerrada lleva a /login; cualquier otro fallo lo trata quien llama. */
  const sessionClosed = useCallback(
    (err: unknown) => {
      if (!isSessionClosed(err)) return false;
      navigate("/login", { replace: true });
      return true;
    },
    [navigate],
  );

  const reload = useCallback(async () => {
    const current = ++generation.current;
    setStatus("loading");
    setLoadingMore(false);
    setMoreFailed(false);
    try {
      const page = await listVaults({ deleted });
      if (current !== generation.current) return;
      setItems(page.items);
      setNextCursor(page.next_cursor);
      setStatus("ready");
    } catch (err) {
      if (current !== generation.current || sessionClosed(err)) return;
      setStatus("error");
    }
  }, [deleted, sessionClosed]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function loadMore() {
    if (!nextCursor) return;
    const current = generation.current;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const page = await listVaults({ deleted, cursor: nextCursor });
      if (current !== generation.current) return;
      setItems((loaded) => [...loaded, ...page.items]);
      setNextCursor(page.next_cursor);
    } catch (err) {
      // La lista ya cargada se conserva: el fallo se avisa aparte y se puede reintentar.
      if (current !== generation.current || sessionClosed(err)) return;
      setMoreFailed(true);
    } finally {
      if (current === generation.current) setLoadingMore(false);
    }
  }

  /** Quita de la vista una bóveda que salió de esta lista (borrada o restaurada). */
  function remove(id: string) {
    setItems((current) => current.filter((vault) => vault.id !== id));
  }

  return { items, nextCursor, status, loadingMore, moreFailed, loadMore, reload, remove };
}
