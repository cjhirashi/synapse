import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { deleteVault, Vault } from "../api/vaults";
import { isSessionClosed, isStale } from "./errors";
import { useVaultPages } from "./useVaultPages";

type Notice = { kind: "status" | "alert"; text: string } | null;

/** Bóvedas activas (RF-018) con borrado confirmado (RF-020). */
export default function VaultListPage() {
  const navigate = useNavigate();
  const { items, nextCursor, status, loadingMore, moreFailed, loadMore, reload, remove } = useVaultPages(false);
  const [confirming, setConfirming] = useState<Vault | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function confirmDelete(vault: Vault) {
    setBusy(true);
    setNotice(null);
    try {
      await deleteVault(vault.id, vault.etag);
      remove(vault.id);
      setNotice({ kind: "status", text: `«${vault.name}» se movió a la papelera.` });
    } catch (err) {
      if (isSessionClosed(err)) return navigate("/login", { replace: true });
      const stale = isStale(err);
      setNotice({
        kind: "alert",
        text: stale
          ? `«${vault.name}» cambió desde que se cargó la lista; se muestra la versión actual.`
          : `No se pudo mover «${vault.name}» a la papelera. Inténtalo de nuevo.`,
      });
      if (stale) void reload();
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  return (
    <section>
      <h1>Bóvedas</h1>
      <Link to="/vaults/new">Nueva bóveda</Link>
      {notice && <p role={notice.kind}>{notice.text}</p>}

      {status === "loading" && <p>Cargando…</p>}
      {status === "error" && (
        <div role="alert">
          No se pudieron cargar las bóvedas.{" "}
          <button type="button" onClick={() => void reload()}>
            Reintentar
          </button>
        </div>
      )}
      {status === "ready" && items.length === 0 && <p>Aún no tienes bóvedas.</p>}

      {status === "ready" && items.length > 0 && (
        <ul>
          {items.map((vault) => (
            <li key={vault.id} aria-labelledby={`vault-${vault.id}`}>
              <h2 id={`vault-${vault.id}`}>{vault.name}</h2>
              {vault.description && <p>{vault.description}</p>}
              {vault.tags.length > 0 && (
                <ul aria-label="Etiquetas">
                  {vault.tags.map((tag) => (
                    <li key={tag}>{tag}</li>
                  ))}
                </ul>
              )}
              <Link to={`/vaults/${encodeURIComponent(vault.id)}/edit`}>Editar</Link>{" "}
              <button type="button" onClick={() => setConfirming(vault)}>
                Borrar
              </button>
            </li>
          ))}
        </ul>
      )}

      {status === "ready" && moreFailed && <p role="alert">No se pudieron cargar más bóvedas. Vuelve a intentarlo.</p>}
      {status === "ready" && nextCursor && (
        <button type="button" onClick={() => void loadMore()} disabled={loadingMore}>
          Cargar más
        </button>
      )}

      {confirming && (
        <div role="alertdialog" aria-labelledby="confirm-delete-title">
          <p id="confirm-delete-title">¿Mover «{confirming.name}» a la papelera?</p>
          <button type="button" onClick={() => void confirmDelete(confirming)} disabled={busy}>
            Mover a la papelera
          </button>{" "}
          <button type="button" onClick={() => setConfirming(null)} disabled={busy}>
            Cancelar
          </button>
        </div>
      )}
    </section>
  );
}
