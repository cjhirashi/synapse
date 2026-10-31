import { useState, useEffect } from "react";
import { useSync } from "../sync/useSync";
import type { Vault } from "../sync/vaultStore";
import {
  listVaultFiles,
  renameFile,
  setFileVisibility,
  deleteFile,
  uploadFile,
  UploadTypeError,
  UploadTooLargeError,
  type VaultFile,
  fileUrl,
} from "./uploadFile";
import { scanFileReferences, type FileRef } from "./fileReferences";
import { ConfirmDialog } from "../editor/ConfirmDialog";
import "./files.css";

type Status = "loading" | "ready" | "error";

interface RenameDialog {
  fileId: string;
  currentName: string;
}

interface DeleteConfirm {
  fileId: string;
  fileName: string;
  references: Array<{ id: string; path: string }>;
}

interface VisibilityConfirm {
  fileId: string;
  fileName: string;
  newVisibility: "private" | "public";
  currentVisibility: "private" | "public";
  references: Array<{ id: string; path: string }>;
}

const DATE_FORMAT = new Intl.DateTimeFormat("es", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Mexico_City",
});

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
  const { vaults, notes } = useSync();
  const [allVaults, setAllVaults] = useState<Vault[]>([]);
  const [selectedVaultId, setSelectedVaultId] = useState<string | null>(null);
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  const [notice, setNotice] = useState<{ kind: "status" | "alert"; text: string } | null>(null);

  // Diálogos
  const [renameDialog, setRenameDialog] = useState<RenameDialog | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(null);
  const [visibilityConfirm, setVisibilityConfirm] = useState<VisibilityConfirm | null>(null);
  const [renameTmp, setRenameTmp] = useState("");

  // Referencias desde los documentos de la bóveda (C-9), calculadas en la réplica local.
  const [refMap, setRefMap] = useState<Map<string, FileRef[]>>(new Map());
  const filesWithReferences = files.map((file) => ({ ...file, references_count: refMap.get(file.id)?.length ?? 0 }));

  function handleDownload(file: VaultFile) {
    window.open(fileUrl(file.id), "_blank");
  }

  async function handleCopyLink(file: VaultFile) {
    try {
      await navigator.clipboard.writeText(fileUrl(file.id));
      setNotice({ kind: "status", text: "Link copiado." });
      setTimeout(() => setNotice(null), 3000);
    } catch (err) {
      setNotice({ kind: "alert", text: "No se pudo copiar el link." });
    }
  }

  function handleRenameClick(file: VaultFile) {
    setRenameDialog({ fileId: file.id, currentName: file.name });
    setRenameTmp(file.name);
  }

  async function handleRenameSave() {
    if (!renameDialog || !renameTmp.trim()) return;
    try {
      const updated = await renameFile(renameDialog.fileId, renameTmp);
      setFiles((prev) =>
        prev.map((f) => (f.id === renameDialog.fileId ? { ...f, name: updated.name } : f))
      );
      setNotice({ kind: "status", text: `Archivo renombrado a "${updated.name}".` });
      setRenameDialog(null);
      setTimeout(() => setNotice(null), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo renombrar el archivo.";
      setNotice({ kind: "alert", text: msg });
    }
  }

  async function handleVisibilityClick(file: VaultFile) {
    const newVisibility = file.visibility === "private" ? "public" : "private";
    const refs = file.vault_id ? ((await scanFileReferences(notes, file.vault_id)).get(file.id) ?? []) : [];

    // Si cambiar a público, SIEMPRE pedir confirmación (C-8)
    // Si cambiar a privado y está en uso, pedir confirmación (C-9)
    if (newVisibility === "public" || refs.length > 0) {
      setVisibilityConfirm({
        fileId: file.id,
        fileName: file.name,
        newVisibility,
        currentVisibility: file.visibility,
        references: refs,
      });
    } else {
      // Público → privado sin referencias, directo (sin confirmación)
      void handleVisibilityConfirm(file.id, newVisibility);
    }
  }

  async function handleVisibilityConfirm(fileId: string, newVisibility: "private" | "public") {
    try {
      const updated = await setFileVisibility(fileId, newVisibility);
      setFiles((prev) =>
        prev.map((f) => (f.id === fileId ? { ...f, visibility: updated.visibility } : f))
      );
      setNotice({
        kind: "status",
        text: `Visibilidad cambiada a ${newVisibility === "private" ? "privado" : "público"}.`,
      });
      setVisibilityConfirm(null);
      setTimeout(() => setNotice(null), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo cambiar la visibilidad.";
      setNotice({ kind: "alert", text: msg });
    }
  }

  async function handleDeleteClick(file: VaultFile) {
    const refs = file.vault_id ? ((await scanFileReferences(notes, file.vault_id)).get(file.id) ?? []) : [];
    setDeleteConfirm({
      fileId: file.id,
      fileName: file.name,
      references: refs,
    });
  }

  async function handleDeleteConfirm() {
    if (!deleteConfirm) return;
    try {
      await deleteFile(deleteConfirm.fileId);
      setFiles((prev) => prev.filter((f) => f.id !== deleteConfirm.fileId));
      setNotice({ kind: "status", text: "Archivo borrado." });
      setDeleteConfirm(null);
      setTimeout(() => setNotice(null), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo borrar el archivo.";
      setNotice({ kind: "alert", text: msg });
    }
  }

  async function uploadMany(list: File[]) {
    if (!selectedVaultId) return;
    for (const file of list) {
      try {
        const uploaded = await uploadFile(file, selectedVaultId);
        setFiles((prev) => [uploaded, ...prev]);
        setNotice({ kind: "status", text: `"${file.name}" subido.` });
        setTimeout(() => setNotice(null), 3000);
      } catch (err) {
        let msg = `No se pudo subir "${file.name}".`;
        if (err instanceof UploadTypeError) {
          msg = `"${file.name}": tipo de archivo no admitido.`;
        } else if (err instanceof UploadTooLargeError) {
          msg = `"${file.name}": supera el tamaño máximo.`;
        } else if (err instanceof Error) {
          msg = err.message;
        }
        setNotice({ kind: "alert", text: msg });
      }
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    e.target.value = "";
    await uploadMany(list);
  }

  function handleDrop(e: React.DragEvent<HTMLElement>) {
    e.preventDefault();
    setDragging(false);
    void uploadMany(Array.from(e.dataTransfer.files ?? []));
  }

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
  }, [vaults, selectedVaultId]);

  useEffect(() => {
    if (!selectedVaultId) return;

    const load = async () => {
      try {
        setStatus("loading");
        const data = await listVaultFiles(selectedVaultId);
        setFiles(data);
        setStatus("ready");
        void scanFileReferences(notes, selectedVaultId).then(setRefMap, () => setRefMap(new Map()));
      } catch (err) {
        setStatus("error");
      }
    };

    void load();
  }, [selectedVaultId, notes]);

  return (
    <section
      className={`files-page${dragging ? " files-page--dragging" : ""}`}
      onDragOver={(e) => {
        if (e.dataTransfer?.types?.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={handleDrop}
    >
      <header className="page-header">
        <h1>Archivos</h1>
      </header>
      {notice && <p role={notice.kind}>{notice.text}</p>}

      {allVaults.length > 0 && (
        <div className="files-toolbar">
          <label htmlFor="vault-selector">Bóveda</label>
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
          <button
            type="button"
            className="btn-primary files-upload"
            onClick={() => {
              const input = document.querySelector<HTMLInputElement>("#file-upload-input");
              input?.click();
            }}
          >
            Subir archivo
          </button>
          <input
            id="file-upload-input"
            type="file"
            multiple
            hidden
            onChange={(e) => void handleUpload(e)}
          />
        </div>
      )}

      {status === "loading" && <p>Cargando…</p>}
      {status === "error" && <div role="alert">No se pudo cargar la lista.</div>}
      {status === "ready" && files.length === 0 && <p className="files-empty">Aún no hay archivos en esta bóveda. Súbelos con el botón o arrástralos aquí.</p>}

      {status === "ready" && filesWithReferences.length > 0 && (
        <>
          <div className="files-toolbar">
            <label htmlFor="search-files">Buscar</label>
            <input
              id="search-files"
              type="search"
              placeholder="Nombre del archivo…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="files-table-wrap">
          <table className="files-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Tamaño</th>
                <th>Fecha</th>
                <th>Referencias</th>
                <th><span className="files-sr">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {filesWithReferences
                .filter((file) => file.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((file) => (
                  <tr key={file.id}>
                    <td className="files-name" data-label="Nombre">{file.name}</td>
                    <td data-label="Tipo">{getFileTypeName(file.content_type)}</td>
                    <td data-label="Tamaño">{formatSize(file.size)}</td>
                    <td data-label="Fecha">{DATE_FORMAT.format(new Date(file.created_at))}</td>
                    <td data-label="Usado en">{file.references_count ?? 0}</td>
                    <td className="files-actions">
                      <button
                        type="button"
                        aria-label={`Abrir ${file.name}`}
                        onClick={() => handleDownload(file)}
                      >
                        Abrir
                      </button>
                      <button
                        type="button"
                        aria-label={`Descargar ${file.name}`}
                        onClick={() => handleDownload(file)}
                      >
                        Descargar
                      </button>
                      <button
                        type="button"
                        aria-label={`Copiar link de ${file.name}`}
                        onClick={() => void handleCopyLink(file)}
                      >
                        Link
                      </button>
                      <button
                        type="button"
                        aria-label={`Renombrar ${file.name}`}
                        onClick={() => handleRenameClick(file)}
                      >
                        Renombrar
                      </button>
                      <button
                        type="button"
                        aria-label={`Cambiar visibilidad de ${file.name}`}
                        onClick={() => void handleVisibilityClick(file)}
                      >
                        {file.visibility === "private" ? "Privado" : "Público"}
                      </button>
                      <button
                        type="button"
                        aria-label={`Borrar ${file.name}`}
                        onClick={() => void handleDeleteClick(file)}
                      >
                        Borrar
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          </div>
        </>
      )}

      {/* Rename Dialog */}
      {renameDialog && (
        <ConfirmDialog
          titleId="rename-dialog-title"
          title={`Renombrar "${renameDialog.currentName}"`}
          onCancel={() => setRenameDialog(null)}
        >
          <input
            autoFocus
            type="text"
            value={renameTmp}
            onChange={(e) => setRenameTmp(e.target.value)}
            placeholder="Nuevo nombre…"
          />
          <button type="button" onClick={() => void handleRenameSave()}>
            Guardar
          </button>
          <button type="button" onClick={() => setRenameDialog(null)}>
            Cancelar
          </button>
        </ConfirmDialog>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <ConfirmDialog
          titleId="delete-dialog-title"
          title={`¿Borrar "${deleteConfirm.fileName}"?`}
          onCancel={() => setDeleteConfirm(null)}
        >
          {deleteConfirm.references.length > 0 && (
            <div>
              <p>
                <strong>Advertencia:</strong> Este archivo está en uso en {deleteConfirm.references.length}{" "}
                documento(s). Si lo borra, quedarán con enlace roto:
              </p>
              <ul>
                {deleteConfirm.references.map((ref) => (
                  <li key={ref.id}>{ref.path}</li>
                ))}
              </ul>
            </div>
          )}
          <button type="button" onClick={() => void handleDeleteConfirm()} data-autofocus>
            Borrar
          </button>
          <button type="button" onClick={() => setDeleteConfirm(null)}>
            Cancelar
          </button>
        </ConfirmDialog>
      )}

      {/* Visibility Confirmation */}
      {visibilityConfirm && (
        <ConfirmDialog
          titleId="visibility-dialog-title"
          title={`¿Cambiar a ${visibilityConfirm.newVisibility === "public" ? "público" : "privado"}?`}
          onCancel={() => setVisibilityConfirm(null)}
        >
          {visibilityConfirm.newVisibility === "public" && (
            <p>Este archivo será visible para cualquiera con el enlace.</p>
          )}
          {visibilityConfirm.newVisibility === "private" && visibilityConfirm.references.length > 0 && (
            <div>
              <p>
                <strong>Advertencia:</strong> Este archivo está en uso en {visibilityConfirm.references.length}{" "}
                documento(s). Si lo marca como privado, dejarán de poder acceder:
              </p>
              <ul>
                {visibilityConfirm.references.map((ref) => (
                  <li key={ref.id}>{ref.path}</li>
                ))}
              </ul>
            </div>
          )}
          <button
            type="button"
            onClick={() => void handleVisibilityConfirm(visibilityConfirm.fileId, visibilityConfirm.newVisibility)}
            data-autofocus={visibilityConfirm.newVisibility === "public"}
          >
            Confirmar
          </button>
          <button type="button" onClick={() => setVisibilityConfirm(null)}>
            Cancelar
          </button>
        </ConfirmDialog>
      )}
    </section>
  );
}
