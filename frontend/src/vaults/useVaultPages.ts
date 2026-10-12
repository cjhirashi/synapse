import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listVaults, Vault } from "../api/vaults";
import { isSessionClosed } from "./errors";

type Status = "loading" | "ready" | "error";

/**
 * Lista paginada de bóvedas activas o de la papelera (RF-018, RF-028): primera página al
 * montar y páginas siguientes con `next_cursor` ("Cargar más").
 */
export function useVaultPages(deleted: boolean) {
  const navigate = useNavigate();
  const [items, setItems] = useState<Vault[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [loadingMore, setLoadingMore] = useState(false);

  const onError = useCallback(
    (err: unknown) => {
      if (isSessionClosed(err)) navigate("/login", { replace: true });
      else setStatus("error");
    },
    [navigate],
  );

  const reload = useCallback(async () => {
    setStatus("loading");
    try {
      const page = await listVaults({ deleted });
      setItems(page.items);
      setNextCursor(page.next_cursor);
      setStatus("ready");
    } catch (err) {
      onError(err);
    }
  }, [deleted, onError]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await listVaults({ deleted, cursor: nextCursor });
      setItems((current) => [...current, ...page.items]);
      setNextCursor(page.next_cursor);
    } catch (err) {
      onError(err);
    } finally {
      setLoadingMore(false);
    }
  }

  /** Quita de la vista una bóveda que salió de esta lista (borrada o restaurada). */
  function remove(id: string) {
    setItems((current) => current.filter((vault) => vault.id !== id));
  }

  return { items, nextCursor, status, loadingMore, loadMore, reload, remove };
}
