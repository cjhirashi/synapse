import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api/problems";
import { restoreVault, Vault, VAULT_PROBLEM } from "../api/vaults";
import { isSessionClosed, isStale } from "./errors";
import { useVaultPages } from "./useVaultPages";

type Notice = { kind: "status" | "alert"; text: string } | null;

const DATE_FORMAT = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" });

/** Bóvedas borradas con su `deleted_at` y "Restaurar" (RF-028). */
export default function TrashPage() {
  const navigate = useNavigate();
  const { items, nextCursor, status, loadingMore, loadMore, reload, remove } = useVaultPages(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  async function restore(vault: Vault) {
    setRestoring(vault.id);
    setNotice(null);
    try {
      // El `etag` viene del propio listado: una borrada no se puede pedir por id (PLAN-0003 §13).
      await restoreVault(vault.id, vault.etag);
      remove(vault.id);
      setNotice({ kind: "status", text: `«${vault.name}» se restauró.` });
    } catch (err) {
      if (isSessionClosed(err)) return navigate("/login", { replace: true });
      const stale = isStale(err);
      let text = `No se pudo restaurar «${vault.name}». Inténtalo de nuevo.`;
      if (err instanceof ApiError && err.type === VAULT_PROBLEM.nameTaken) {
        text = `No se puede restaurar «${vault.name}»: ya tienes otra bóveda con ese nombre.`;
      } else if (stale) {
        text = `«${vault.name}» cambió desde que se cargó la papelera; se muestra la versión actual.`;
      }
      setNotice({ kind: "alert", text });
      if (stale) void reload();
    } finally {
      setRestoring(null);
    }
  }

  return (
    <section>
      <h1>Papelera</h1>
      {notice && <p role={notice.kind}>{notice.text}</p>}

      {status === "loading" && <p>Cargando…</p>}
      {status === "error" && (
        <div role="alert">
          No se pudo cargar la papelera.{" "}
          <button type="button" onClick={() => void reload()}>
            Reintentar
          </button>
        </div>
      )}
      {status === "ready" && items.length === 0 && <p>La papelera está vacía.</p>}

      {status === "ready" && items.length > 0 && (
        <ul>
          {items.map((vault) => (
            <li key={vault.id} aria-labelledby={`trashed-${vault.id}`}>
              <h2 id={`trashed-${vault.id}`}>{vault.name}</h2>
              {vault.deleted_at && (
                <p>
                  Borrada el <time dateTime={vault.deleted_at}>{DATE_FORMAT.format(new Date(vault.deleted_at))}</time>
                </p>
              )}
              <button type="button" onClick={() => void restore(vault)} disabled={restoring !== null}>
                Restaurar
              </button>
            </li>
          ))}
        </ul>
      )}

      {status === "ready" && nextCursor && (
        <button type="button" onClick={() => void loadMore()} disabled={loadingMore}>
          Cargar más
        </button>
      )}
    </section>
  );
}
