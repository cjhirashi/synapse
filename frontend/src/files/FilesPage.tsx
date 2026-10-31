import { useState, useEffect } from "react";
import { useSync } from "../sync/useSync";
import type { Vault } from "../sync/vaultStore";
import { listVaultFiles, type VaultFile } from "./uploadFile";

type Status = "loading" | "ready" | "error";

const DATE_FORMAT = new Intl.DateTimeFormat("es", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Mexico_City",
});

function getFileTypeName(contentType: string): string {
  if (contentType.includes("pdf")) return "PDF";
  if (contentType.includes("word") || contentType.includes("wordprocessingml")) return "Word";
  if (contentType.includes("excel") || contentType.includes("spreadsheet")) return "Excel";
  if (contentType.includes("powerpoint") || contentType.includes("presentation")) return "PowerPoint";
  if (contentType.includes("text")) return "Texto";
  if (contentType.includes("zip")) return "ZIP";
  if (contentType.includes("html")) return "HTML";
  if (contentType.includes("csv")) return "CSV";
  if (contentType.startsWith("image/")) return "Imagen";
  return contentType;
}

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

      {status === "ready" && files.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Tamaño</th>
              <th>Fecha</th>
              <th>Referencias</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr key={file.id}>
                <td>{file.name}</td>
                <td>{getFileTypeName(file.content_type)}</td>
                <td>{(file.size / 1024).toFixed(1)} KB</td>
                <td>{DATE_FORMAT.format(new Date(file.created_at))}</td>
                <td>{file.references_count ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
