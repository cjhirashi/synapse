import { useState, useEffect, useCallback, type DragEvent } from "react";
import { useSync } from "../sync/useSync";
import type { Vault } from "../sync/vaultStore";
import {
  listVaultFiles,
  listFileFolders,
  createFileFolder,
  moveFileFolder,
  deleteFileFolder,
  moveFile,
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
import { htmlEmbedMarkup } from "./embed";
import {
  baseName,
  folderNameError,
  isInside,
  joinPath,
  parentOf,
} from "./fileFolderTree";
import { DRAG_FILE, FileFolderTree } from "./FileFolderTree";
import { DataTable, type DataColumn } from "../ui/DataTable";
import {
  Archive,
  Code,
  Download,
  ExternalLink,
  File as FileIcon,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FolderInput,
  FolderPlus,
  Globe,
  Link2,
  Lock,
  Pencil,
  Trash2,
} from "lucide-react";
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

interface MoveDialog {
  fileId: string;
  fileName: string;
  destination: string;
}

const DATE_FORMAT = new Intl.DateTimeFormat("es", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Mexico_City",
});

/** El backend devuelve fechas UTC sin zona (`2026-10-30T20:12:08.35`): sin la Z el navegador las leería como locales. */
function parseUtc(value: string): Date {
  return new Date(/(Z|[+-]\d\d:?\d\d)$/.test(value) ? value : `${value}Z`);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileTypeName(contentType: string): string {
  if (contentType.includes("pdf")) return "PDF";
  if (contentType.includes("word") || contentType.includes("wordprocessingml"))
    return "Word";
  if (contentType.includes("excel") || contentType.includes("spreadsheet"))
    return "Excel";
  if (
    contentType.includes("powerpoint") ||
    contentType.includes("presentation")
  )
    return "PowerPoint";
  if (contentType.includes("html")) return "HTML";
  if (contentType.includes("csv")) return "CSV";
  if (contentType.includes("zip")) return "ZIP";
  if (contentType.includes("text") || contentType.includes("json"))
    return "Texto";
  if (contentType.startsWith("image/")) return "Imagen";
  return contentType;
}

function TypeIcon({ contentType }: { contentType: string }) {
  const props = { size: 15, "aria-hidden": true, className: "files-type-icon" } as const;
  if (contentType.startsWith("image/")) return <FileImage {...props} />;
  if (contentType.includes("html")) return <FileCode {...props} />;
  if (contentType.includes("excel") || contentType.includes("spreadsheet") || contentType.includes("csv"))
    return <FileSpreadsheet {...props} />;
  if (contentType.includes("zip")) return <Archive {...props} />;
  if (contentType.includes("pdf") || contentType.includes("word") || contentType.includes("text") || contentType.includes("presentation") || contentType.includes("powerpoint"))
    return <FileText {...props} />;
  return <FileIcon {...props} />;
}

/** Mensaje legible de un error de la API; el de carpeta no vacía se explica con sus palabras. */
function errorText(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

type Row = VaultFile & { references_count: number };

export default function FilesPage() {
  const { vaults, notes } = useSync();
  const [allVaults, setAllVaults] = useState<Vault[]>([]);
  const [selectedVaultId, setSelectedVaultId] = useState<string | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState("");
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  const [notice, setNotice] = useState<{
    kind: "status" | "alert";
    text: string;
  } | null>(null);

  // Diálogos de archivo
  const [renameDialog, setRenameDialog] = useState<RenameDialog | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(
    null,
  );
  const [visibilityConfirm, setVisibilityConfirm] =
    useState<VisibilityConfirm | null>(null);
  const [renameTmp, setRenameTmp] = useState("");
  const [moveDialog, setMoveDialog] = useState<MoveDialog | null>(null);

  // Carpetas
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderError, setNewFolderError] = useState<string | null>(null);
  const [folderRename, setFolderRename] = useState<{ path: string; name: string } | null>(null);
  const [folderRenameError, setFolderRenameError] = useState<string | null>(null);
  const [folderDelete, setFolderDelete] = useState<string | null>(null);

  // Referencias desde los documentos de la bóveda (C-9), calculadas en la réplica local.
  const [refMap, setRefMap] = useState<Map<string, FileRef[]>>(new Map());
  const filesWithReferences: Row[] = files.map((file) => ({
    ...file,
    references_count: refMap.get(file.id)?.length ?? 0,
  }));

  const flash = useCallback((next: { kind: "status" | "alert"; text: string }) => {
    setNotice(next);
    if (next.kind === "status") setTimeout(() => setNotice(null), 3000);
  }, []);

  function handleOpen(file: VaultFile) {
    window.open(fileUrl(file.id), "_blank", "noopener");
  }

  function handleDownload(file: VaultFile) {
    const link = document.createElement("a");
    link.href = fileUrl(file.id);
    link.download = file.name;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function handleCopyLink(file: VaultFile) {
    try {
      await navigator.clipboard.writeText(fileUrl(file.id));
      flash({ kind: "status", text: "Link copiado." });
    } catch (err) {
      flash({ kind: "alert", text: "No se pudo copiar el link." });
    }
  }

  async function handleCopyEmbed(file: VaultFile) {
    try {
      await navigator.clipboard.writeText(htmlEmbedMarkup(fileUrl(file.id)));
      flash({ kind: "status", text: "Incrustado copiado." });
    } catch (err) {
      flash({ kind: "alert", text: "No se pudo copiar el incrustado." });
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
        prev.map((f) =>
          f.id === renameDialog.fileId ? { ...f, name: updated.name } : f,
        ),
      );
      flash({
        kind: "status",
        text: `Archivo renombrado a "${updated.name}".`,
      });
      setRenameDialog(null);
    } catch (err) {
      flash({ kind: "alert", text: errorText(err, "No se pudo renombrar el archivo.") });
    }
  }

  async function handleVisibilityClick(file: VaultFile) {
    const newVisibility = file.visibility === "private" ? "public" : "private";
    const refs = file.vault_id
      ? ((await scanFileReferences(notes, file.vault_id)).get(file.id) ?? [])
      : [];

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

  async function handleVisibilityConfirm(
    fileId: string,
    newVisibility: "private" | "public",
  ) {
    try {
      const updated = await setFileVisibility(fileId, newVisibility);
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId ? { ...f, visibility: updated.visibility } : f,
        ),
      );
      flash({
        kind: "status",
        text: `Visibilidad cambiada a ${newVisibility === "private" ? "privado" : "público"}.`,
      });
      setVisibilityConfirm(null);
    } catch (err) {
      flash({ kind: "alert", text: errorText(err, "No se pudo cambiar la visibilidad.") });
    }
  }

  async function handleDeleteClick(file: VaultFile) {
    const refs = file.vault_id
      ? ((await scanFileReferences(notes, file.vault_id)).get(file.id) ?? [])
      : [];
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
      flash({ kind: "status", text: "Archivo borrado." });
      setDeleteConfirm(null);
    } catch (err) {
      flash({ kind: "alert", text: errorText(err, "No se pudo borrar el archivo.") });
    }
  }

  async function uploadMany(list: File[]) {
    if (!selectedVaultId) return;
    for (const file of list) {
      try {
        const uploaded = await uploadFile(file, selectedVaultId, selectedFolder || undefined);
        setFiles((prev) => [uploaded, ...prev]);
        flash({ kind: "status", text: `"${file.name}" subido.` });
      } catch (err) {
        let msg = `No se pudo subir "${file.name}".`;
        if (err instanceof UploadTypeError) {
          msg = `"${file.name}": tipo de archivo no admitido.`;
        } else if (err instanceof UploadTooLargeError) {
          msg = `"${file.name}": supera el tamaño máximo.`;
        } else if (err instanceof Error) {
          msg = err.message;
        }
        flash({ kind: "alert", text: msg });
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

  // --- Carpetas (H-046) ---

  const refreshFolders = useCallback(async (vaultId: string) => {
    try {
      setFolders(await listFileFolders(vaultId));
    } catch {
      // El árbol es secundario: si falla, la tabla sigue funcionando.
    }
  }, []);

  async function moveFileTo(fileId: string, destination: string) {
    if (!selectedVaultId) return;
    const file = files.find((f) => f.id === fileId);
    if (file && (file.folder ?? "") === destination) return;
    try {
      await moveFile(fileId, destination);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      void refreshFolders(selectedVaultId);
      flash({
        kind: "status",
        text: `Archivo movido a ${destination ? `«${destination}»` : "la raíz"}.`,
      });
    } catch (err) {
      flash({ kind: "alert", text: errorText(err, "No se pudo mover el archivo.") });
    }
  }

  async function handleMoveSave() {
    if (!moveDialog) return;
    await moveFileTo(moveDialog.fileId, moveDialog.destination);
    setMoveDialog(null);
  }

  async function moveFolderTo(path: string, destinationParent: string) {
    if (!selectedVaultId) return;
    const destination = joinPath(destinationParent, baseName(path));
    if (destination === path) return;
    if (isInside(destinationParent, path)) {
      flash({ kind: "alert", text: "Una carpeta no se puede mover dentro de sí misma." });
      return;
    }
    try {
      await moveFileFolder(selectedVaultId, path, destination);
      await refreshFolders(selectedVaultId);
      if (isInside(selectedFolder, path)) setSelectedFolder(destination + selectedFolder.slice(path.length));
      flash({ kind: "status", text: `Carpeta movida a «${destination}».` });
    } catch (err) {
      flash({ kind: "alert", text: errorText(err, "No se pudo mover la carpeta.") });
    }
  }

  async function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedVaultId) return;
    const error = folderNameError(newFolderName);
    if (error) {
      setNewFolderError(error);
      return;
    }
    const path = joinPath(selectedFolder, newFolderName.trim());
    try {
      setFolders(await createFileFolder(selectedVaultId, path));
      setNewFolderOpen(false);
      setNewFolderName("");
      setNewFolderError(null);
      setSelectedFolder(path);
      flash({ kind: "status", text: `Carpeta «${path}» creada.` });
    } catch (err) {
      setNewFolderError(errorText(err, "No se pudo crear la carpeta."));
    }
  }

  async function handleRenameFolder() {
    if (!folderRename || !selectedVaultId) return;
    const error = folderNameError(folderRename.name);
    if (error) {
      setFolderRenameError(error);
      return;
    }
    const destination = joinPath(parentOf(folderRename.path), folderRename.name.trim());
    if (destination === folderRename.path) {
      setFolderRename(null);
      return;
    }
    try {
      await moveFileFolder(selectedVaultId, folderRename.path, destination);
      await refreshFolders(selectedVaultId);
      if (isInside(selectedFolder, folderRename.path)) {
        setSelectedFolder(destination + selectedFolder.slice(folderRename.path.length));
      }
      setFolderRename(null);
      setFolderRenameError(null);
      flash({ kind: "status", text: `Carpeta renombrada a «${baseName(destination)}».` });
    } catch (err) {
      setFolderRenameError(errorText(err, "No se pudo renombrar la carpeta."));
    }
  }

  async function handleDeleteFolder() {
    if (!folderDelete || !selectedVaultId) return;
    const path = folderDelete;
    try {
      await deleteFileFolder(selectedVaultId, path);
      await refreshFolders(selectedVaultId);
      if (isInside(selectedFolder, path)) setSelectedFolder(parentOf(path));
      setFolderDelete(null);
      flash({ kind: "status", text: `Carpeta «${path}» borrada.` });
    } catch (err) {
      setFolderDelete(null);
      flash({
        kind: "alert",
        text: errorText(err, `No se pudo borrar «${path}». Si tiene archivos, muévelos o bórralos primero.`),
      });
    }
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

  // Al cambiar de bóveda: carpetas nuevas y vuelta a la raíz.
  useEffect(() => {
    if (!selectedVaultId) return;
    setSelectedFolder("");
    setFolders([]);
    void refreshFolders(selectedVaultId);
  }, [selectedVaultId, refreshFolders]);

  // Archivos de la carpeta abierta.
  useEffect(() => {
    if (!selectedVaultId) return;
    let cancelled = false;
    const load = async () => {
      try {
        setStatus("loading");
        const data = await listVaultFiles(selectedVaultId, selectedFolder);
        if (cancelled) return;
        setFiles(data);
        setStatus("ready");
      } catch (err) {
        if (!cancelled) setStatus("error");
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedVaultId, selectedFolder]);

  // Referencias desde los documentos (se recalculan cuando cambian las notas).
  useEffect(() => {
    if (!selectedVaultId) return;
    void scanFileReferences(notes, selectedVaultId).then(setRefMap, () =>
      setRefMap(new Map()),
    );
  }, [selectedVaultId, notes]);

  const visibleRows = filesWithReferences.filter((file) =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const columns: DataColumn<Row>[] = [
    { key: "name", label: "Nombre", key_column: true, sortValue: (f) => f.name },
    { key: "type", label: "Tipo", sortValue: (f) => getFileTypeName(f.content_type) },
    { key: "size", label: "Tamaño", sortValue: (f) => f.size },
    { key: "date", label: "Fecha", sortValue: (f) => parseUtc(f.created_at).getTime() },
    { key: "visibility", label: "Visibilidad", sortValue: (f) => f.visibility },
    { key: "refs", label: "Usado en", sortValue: (f) => f.references_count },
  ];

  function renderCell(file: Row, column: DataColumn<Row>) {
    switch (column.key) {
      case "name":
        return (
          <span className="files-name">
            <TypeIcon contentType={file.content_type} />
            {file.name}
          </span>
        );
      case "type":
        return getFileTypeName(file.content_type);
      case "size":
        return formatSize(file.size);
      case "date":
        return DATE_FORMAT.format(parseUtc(file.created_at));
      case "visibility":
        return (
          <button
            type="button"
            className={`files-visibility files-visibility--${file.visibility}`}
            aria-label={`Cambiar visibilidad de ${file.name}`}
            onClick={() => void handleVisibilityClick(file)}
          >
            {file.visibility === "private" ? (
              <Lock size={12} aria-hidden="true" />
            ) : (
              <Globe size={12} aria-hidden="true" />
            )}
            {file.visibility === "private" ? "Privado" : "Público"}
          </button>
        );
      default:
        return file.references_count ?? 0;
    }
  }

  function rowActions(file: Row) {
    return (
      <span className="data-table-icons">
        <button type="button" aria-label={`Abrir ${file.name}`} title="Abrir" onClick={() => handleOpen(file)}>
          <ExternalLink size={14} aria-hidden="true" />
        </button>
        <button type="button" aria-label={`Descargar ${file.name}`} title="Descargar" onClick={() => handleDownload(file)}>
          <Download size={14} aria-hidden="true" />
        </button>
        <button type="button" aria-label={`Copiar link de ${file.name}`} title="Copiar link" onClick={() => void handleCopyLink(file)}>
          <Link2 size={14} aria-hidden="true" />
        </button>
        {file.content_type === "text/html" && (
          <button type="button" aria-label={`Copiar incrustado de ${file.name}`} title="Copiar incrustado" onClick={() => void handleCopyEmbed(file)}>
            <Code size={14} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          aria-label={`Mover ${file.name}`}
          title="Mover a otra carpeta"
          onClick={() => setMoveDialog({ fileId: file.id, fileName: file.name, destination: file.folder ?? "" })}
        >
          <FolderInput size={14} aria-hidden="true" />
        </button>
        <button type="button" aria-label={`Renombrar ${file.name}`} title="Renombrar" onClick={() => handleRenameClick(file)}>
          <Pencil size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="data-table-danger"
          aria-label={`Borrar ${file.name}`}
          title="Borrar"
          onClick={() => void handleDeleteClick(file)}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </span>
    );
  }

  const crumbs = selectedFolder ? selectedFolder.split("/") : [];

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
        <div className="files-layout">
          <aside className="files-side" aria-label="Carpetas">
            <div className="files-side-head">
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
                className="files-side-new"
                aria-expanded={newFolderOpen}
                onClick={() => {
                  setNewFolderOpen((open) => !open);
                  setNewFolderError(null);
                }}
              >
                <FolderPlus size={14} aria-hidden="true" /> Nueva carpeta
              </button>
              {newFolderOpen && (
                <form className="files-side-form" onSubmit={(e) => void handleCreateFolder(e)}>
                  <label htmlFor="new-folder-name">
                    Nombre (se crea en {selectedFolder ? `«${selectedFolder}»` : "la raíz"})
                  </label>
                  <input
                    id="new-folder-name"
                    autoFocus
                    type="text"
                    value={newFolderName}
                    onChange={(e) => {
                      setNewFolderName(e.target.value);
                      setNewFolderError(null);
                    }}
                    aria-invalid={newFolderError ? true : undefined}
                    aria-describedby={newFolderError ? "new-folder-error" : undefined}
                  />
                  {newFolderError && (
                    <p id="new-folder-error" role="alert" className="files-side-error">
                      {newFolderError}
                    </p>
                  )}
                  <div className="files-side-actions">
                    <button type="button" onClick={() => setNewFolderOpen(false)}>
                      Cancelar
                    </button>
                    <button type="submit" className="btn-primary">
                      Crear
                    </button>
                  </div>
                </form>
              )}
            </div>
            <FileFolderTree
              folders={folders}
              selected={selectedFolder}
              onSelect={setSelectedFolder}
              onDropFile={(fileId, destination) => void moveFileTo(fileId, destination)}
              onDropFolder={(path, destination) => void moveFolderTo(path, destination)}
              onRename={(path) => {
                setFolderRename({ path, name: baseName(path) });
                setFolderRenameError(null);
              }}
              onDelete={setFolderDelete}
            />
          </aside>

          <div className="files-main">
            <div className="files-toolbar">
              <nav className="files-crumbs" aria-label="Ruta de la carpeta">
                <button type="button" onClick={() => setSelectedFolder("")} aria-current={selectedFolder === "" ? "page" : undefined}>
                  Raíz
                </button>
                {crumbs.map((name, i) => {
                  const path = crumbs.slice(0, i + 1).join("/");
                  return (
                    <span key={path}>
                      <span aria-hidden="true"> / </span>
                      <button type="button" onClick={() => setSelectedFolder(path)} aria-current={path === selectedFolder ? "page" : undefined}>
                        {name}
                      </button>
                    </span>
                  );
                })}
              </nav>
              <button
                type="button"
                className="btn-primary files-upload"
                onClick={() => {
                  const input =
                    document.querySelector<HTMLInputElement>("#file-upload-input");
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

            {status === "loading" && <p>Cargando…</p>}
            {status === "error" && (
              <div role="alert">No se pudo cargar la lista.</div>
            )}
            {status === "ready" && files.length === 0 && (
              <p className="files-empty">
                {selectedFolder
                  ? "Esta carpeta no tiene archivos. Súbelos con el botón o arrástralos aquí, o muévelos desde otra carpeta."
                  : "Aún no hay archivos en esta bóveda. Súbelos con el botón o arrástralos aquí."}
              </p>
            )}

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

                <DataTable
                  label="Archivos"
                  columns={columns}
                  rows={visibleRows}
                  getRowKey={(f) => f.id}
                  renderCell={renderCell}
                  rowActions={rowActions}
                  initialSort={{ key: "date", dir: "desc" }}
                  emptyMessage="Ningún archivo coincide con la búsqueda."
                  onRowDragStart={(event: DragEvent<HTMLTableRowElement>, file) => {
                    event.dataTransfer.setData(DRAG_FILE, file.id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* Rename Dialog */}
      {renameDialog && (
        <ConfirmDialog
          titleId="rename-dialog-title"
          title={`Renombrar "${renameDialog.currentName}"`}
          glyph={Pencil}
          body={
            <input
              autoFocus
              type="text"
              value={renameTmp}
              onChange={(e) => setRenameTmp(e.target.value)}
              placeholder="Nuevo nombre…"
            />
          }
          onCancel={() => setRenameDialog(null)}
        >
          <button type="button" onClick={() => setRenameDialog(null)}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void handleRenameSave()}
          >
            Guardar
          </button>
        </ConfirmDialog>
      )}

      {/* Mover archivo */}
      {moveDialog && (
        <ConfirmDialog
          titleId="move-dialog-title"
          title={`Mover "${moveDialog.fileName}"`}
          glyph={FolderInput}
          body={
            <>
              <label htmlFor="move-destination">Carpeta de destino</label>
              <select
                id="move-destination"
                autoFocus
                value={moveDialog.destination}
                onChange={(e) => setMoveDialog({ ...moveDialog, destination: e.target.value })}
              >
                <option value="">Raíz</option>
                {folders.map((path) => (
                  <option key={path} value={path}>
                    {path}
                  </option>
                ))}
              </select>
            </>
          }
          onCancel={() => setMoveDialog(null)}
        >
          <button type="button" onClick={() => setMoveDialog(null)}>
            Cancelar
          </button>
          <button type="button" className="btn-primary" onClick={() => void handleMoveSave()}>
            Mover
          </button>
        </ConfirmDialog>
      )}

      {/* Renombrar carpeta */}
      {folderRename && (
        <ConfirmDialog
          titleId="folder-rename-dialog-title"
          title={`Renombrar la carpeta «${baseName(folderRename.path)}»`}
          glyph={Pencil}
          body={
            <>
              <input
                autoFocus
                type="text"
                aria-label="Nuevo nombre de la carpeta"
                value={folderRename.name}
                onChange={(e) => {
                  setFolderRename({ ...folderRename, name: e.target.value });
                  setFolderRenameError(null);
                }}
              />
              {folderRenameError && (
                <p role="alert" className="files-side-error">
                  {folderRenameError}
                </p>
              )}
            </>
          }
          onCancel={() => setFolderRename(null)}
        >
          <button type="button" onClick={() => setFolderRename(null)}>
            Cancelar
          </button>
          <button type="button" className="btn-primary" onClick={() => void handleRenameFolder()}>
            Guardar
          </button>
        </ConfirmDialog>
      )}

      {/* Borrar carpeta */}
      {folderDelete && (
        <ConfirmDialog
          titleId="folder-delete-dialog-title"
          title={`¿Borrar la carpeta «${folderDelete}»?`}
          tone="danger"
          glyph={Trash2}
          body={<p>Solo se puede borrar una carpeta vacía. Si tiene archivos, muévelos o bórralos antes.</p>}
          onCancel={() => setFolderDelete(null)}
        >
          <button type="button" data-autofocus onClick={() => setFolderDelete(null)}>
            Cancelar
          </button>
          <button type="button" className="btn-danger" onClick={() => void handleDeleteFolder()}>
            Borrar carpeta
          </button>
        </ConfirmDialog>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <ConfirmDialog
          titleId="delete-dialog-title"
          title={`¿Borrar "${deleteConfirm.fileName}"?`}
          tone="danger"
          glyph={Trash2}
          body={
            deleteConfirm.references.length > 0 && (
              <>
                <p>
                  <strong>Advertencia:</strong> Este archivo está en uso en{" "}
                  {deleteConfirm.references.length} documento(s). Si lo borra,
                  quedarán con enlace roto:
                </p>
                <ul>
                  {deleteConfirm.references.map((ref) => (
                    <li key={ref.id}>{ref.path}</li>
                  ))}
                </ul>
              </>
            )
          }
          onCancel={() => setDeleteConfirm(null)}
        >
          <button
            type="button"
            data-autofocus
            onClick={() => setDeleteConfirm(null)}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={() => void handleDeleteConfirm()}
          >
            Borrar
          </button>
        </ConfirmDialog>
      )}

      {/* Visibility Confirmation */}
      {visibilityConfirm && (
        <ConfirmDialog
          titleId="visibility-dialog-title"
          title={`¿Cambiar a ${visibilityConfirm.newVisibility === "public" ? "público" : "privado"}?`}
          tone="warning"
          body={
            (visibilityConfirm.newVisibility === "public" ||
              visibilityConfirm.references.length > 0) && (
              <>
                {visibilityConfirm.newVisibility === "public" && (
                  <p>
                    Este archivo será visible para cualquiera con el enlace.
                  </p>
                )}
                {visibilityConfirm.newVisibility === "private" &&
                  visibilityConfirm.references.length > 0 && (
                    <>
                      <p>
                        <strong>Advertencia:</strong> Este archivo está en uso
                        en {visibilityConfirm.references.length} documento(s).
                        Si lo marca como privado, dejarán de poder acceder:
                      </p>
                      <ul>
                        {visibilityConfirm.references.map((ref) => (
                          <li key={ref.id}>{ref.path}</li>
                        ))}
                      </ul>
                    </>
                  )}
              </>
            )
          }
          onCancel={() => setVisibilityConfirm(null)}
        >
          <button type="button" onClick={() => setVisibilityConfirm(null)}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() =>
              void handleVisibilityConfirm(
                visibilityConfirm.fileId,
                visibilityConfirm.newVisibility,
              )
            }
            data-autofocus={visibilityConfirm.newVisibility === "public"}
          >
            Confirmar
          </button>
        </ConfirmDialog>
      )}
    </section>
  );
}
