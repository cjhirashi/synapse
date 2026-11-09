import { useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { ConfirmDialog } from "../editor/ConfirmDialog";
import { useSync } from "../sync/useSync";
import { DataTable, type DataColumn } from "../ui/DataTable";
import type { Vault } from "../sync/vaultStore";
import VaultChip from "./VaultChip";
import { isStale, isStorageFull, STORAGE_FULL } from "./errors";
import { useVaultPages } from "./useVaultPages";

const DATE_FORMAT = new Intl.DateTimeFormat("es", { dateStyle: "short", timeStyle: "short" });

const COLUMNS: DataColumn<Vault>[] = [
  { key: "name", label: "Nombre", key_column: true, size: "xl", sortValue: (v) => v.name },
  { key: "description", label: "Descripción", size: "xxl", clip: true },
  { key: "tags", label: "Etiquetas", size: "lg" },
  { key: "updated", label: "Actualizada", size: "lg", sortValue: (v) => v.updated_at },
];

type Notice = { kind: "status" | "alert"; text: string } | null;

/** Bóvedas activas de la réplica local (RF-018) con borrado confirmado (RF-020; SPEC-0005 RF-011). */
export default function VaultListPage() {
  const { vaults } = useSync();
  const { items, hasMore, status, loadMore, reload, remove } = useVaultPages(false);
  const [confirming, setConfirming] = useState<Vault | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function confirmDelete(vault: Vault) {
    setBusy(true);
    setNotice(null);
    try {
      // Una revisión nueva con `deleted_at`: viaja por el push como cualquier edición (RF-011).
      await vaults.softDelete(vault.id, vault.rev);
      remove(vault.id);
      setNotice({ kind: "status", text: `«${vault.name}» se movió a la papelera.` });
    } catch (err) {
      const stale = isStale(err);
      let text = `No se pudo mover «${vault.name}» a la papelera. Inténtalo de nuevo.`;
      if (stale) text = `«${vault.name}» cambió desde que se cargó la lista; se muestra la versión actual.`;
      else if (isStorageFull(err)) text = STORAGE_FULL;
      setNotice({ kind: "alert", text });
      if (stale) void reload();
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  return (
    <section className="vault-list-page">
      <div className="page-header">
        <h1>Bóvedas</h1>
        <Link to="/vaults/new">Nueva bóveda</Link>
      </div>
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
        <DataTable
          label="Bóvedas"
          columns={COLUMNS}
          rows={items}
          getRowKey={(vault) => vault.id}
          emptyMessage="Aún no tienes bóvedas."
          renderCell={(vault, column) => {
            if (column.key === "name") {
              return (
                <span className="vault-list-title">
                  <VaultChip id={vault.id} name={vault.name} icon={vault.icon} />
                  <Link to={`/vaults/${encodeURIComponent(vault.id)}`}>{vault.name}</Link>
                </span>
              );
            }
            if (column.key === "description") return vault.description ? <span title={vault.description}>{vault.description}</span> : null;
            if (column.key === "tags") {
              return vault.tags.length > 0 ? (
                <ul className="chip-list" aria-label="Etiquetas">
                  {vault.tags.map((tag) => (
                    <li key={tag}>{tag}</li>
                  ))}
                </ul>
              ) : null;
            }
            return <time dateTime={vault.updated_at}>{DATE_FORMAT.format(new Date(vault.updated_at))}</time>;
          }}
          rowActions={(vault) => (
            <span className="data-table-icons">
              {/* "Abrir" entra a las notas de la bóveda (SPEC-0008); "Editar" va a sus metadatos. */}
              <Link to={`/vaults/${encodeURIComponent(vault.id)}`} aria-label={`Abrir ${vault.name}`} title="Abrir">
                <ExternalLink size={15} aria-hidden="true" />
              </Link>
              <Link to={`/vaults/${encodeURIComponent(vault.id)}/edit`} aria-label={`Editar ${vault.name}`} title="Editar">
                <Pencil size={15} aria-hidden="true" />
              </Link>
              <button
                type="button"
                className="data-table-danger"
                aria-label={`Borrar ${vault.name}`}
                title="Borrar"
                onClick={() => setConfirming(vault)}
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </span>
          )}
        />
      )}

      {status === "ready" && hasMore && (
        <button type="button" onClick={loadMore}>
          Cargar más
        </button>
      )}

      {confirming && (
        <ConfirmDialog
          titleId="confirm-delete-title"
          title={`¿Mover «${confirming.name}» a la papelera?`}
          tone="danger"
          glyph={Trash2}
          body="Podrás restaurarla desde la papelera."
          onCancel={() => setConfirming(null)}
        >
          <button type="button" data-autofocus onClick={() => setConfirming(null)} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="btn-danger" onClick={() => void confirmDelete(confirming)} disabled={busy}>
            Mover a la papelera
          </button>
        </ConfirmDialog>
      )}
    </section>
  );
}
