import { useState } from "react";
import { useSync } from "../sync/useSync";
import { VaultNameTakenError, type Vault } from "../sync/vaultStore";
import { isStale, isStorageFull, STORAGE_FULL } from "./errors";
import { useVaultPages } from "./useVaultPages";

type Notice = { kind: "status" | "alert"; text: string } | null;

const DATE_FORMAT = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" });

/** Bóvedas borradas de la réplica local con su `deleted_at` y "Restaurar" (RF-028; SPEC-0005 RF-011). */
export default function TrashPage() {
  const { vaults } = useSync();
  const { items, hasMore, status, loadMore, reload, remove } = useVaultPages(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  async function restore(vault: Vault) {
    setRestoring(vault.id);
    setNotice(null);
    try {
      // La revisión viene del propio listado: `get` sólo ve bóvedas activas.
      await vaults.restore(vault.id, vault.rev);
      remove(vault.id);
      setNotice({ kind: "status", text: `«${vault.name}» se restauró.` });
    } catch (err) {
      const stale = isStale(err);
      let text = `No se pudo restaurar «${vault.name}». Inténtalo de nuevo.`;
      if (err instanceof VaultNameTakenError) {
        text = `No se puede restaurar «${vault.name}»: ya tienes otra bóveda con ese nombre.`;
      } else if (stale) {
        text = `«${vault.name}» cambió desde que se cargó la papelera; se muestra la versión actual.`;
      } else if (isStorageFull(err)) {
        text = STORAGE_FULL;
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
        <ul className="card-list">
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

      {status === "ready" && hasMore && (
        <button type="button" onClick={loadMore}>
          Cargar más
        </button>
      )}
    </section>
  );
}
