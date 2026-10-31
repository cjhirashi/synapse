import { useState, useEffect } from "react";
import { useSync } from "../sync/useSync";
import type { Vault } from "../sync/vaultStore";
import { listVaultFiles, type VaultFile } from "./uploadFile";

type Status = "loading" | "ready" | "error";

export default function FilesPage() {
  const { vaults } = useSync();
  const [allVaults, setAllVaults] = useState<Vault[]>([]);
  const [selectedVaultId, setSelectedVaultId] = useState<string | null>(null);
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    const load = async () => {
      try {
        const list = await vaults.list({ deleted: false });
        setAllVaults(list);
        if (!selectedVaultId && list.length > 0) {
          setSelectedVaultId(list[0].id);
        }
      } catch (err) {
        console.error("Failed to load vaults:", err);
      }
    };
    void load();
  }, [vaults]);

  useEffect(() => {
    if (!selectedVaultId) return;

    const load = async () => {
      try {
        setStatus("loading");
        const data = await listVaultFiles(selectedVaultId);
        setFiles(data);
        setStatus("ready");
      } catch (err) {
        setStatus("error");
      }
    };

    void load();
  }, [selectedVaultId]);

  return (
    <section>
      <h1>Archivos</h1>

      {allVaults.length > 0 && (
        <div>
          <label htmlFor="vault-selector">Bóveda:</label>
          <select
            id="vault-selector"
            value={selectedVaultId || ""}
            onChange={(e) => setSelectedVaultId(e.target.value)}
          >
            {allVaults.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {status === "loading" && <p>Cargando…</p>}
      {status === "error" && <div role="alert">No se pudo cargar la lista.</div>}
      {status === "ready" && files.length === 0 && <p>La lista está vacía.</p>}
    </section>
  );
}
