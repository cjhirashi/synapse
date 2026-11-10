/**
 * Diálogo para adjuntar archivos o URLs (H-025 paso 7).
 * Dos botones iniciales: "Subir archivo" y "Pegar URL".
 * Al elegir "Pegar URL", muestra formulario con campo URL, tipo y botones Insertar/Cancelar.
 */
import { ChangeEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { Link2, Paperclip, Upload } from "lucide-react";
import DialogFrame from "./DialogFrame";

export interface AttachDialogProps {
  onUpload: () => void;
  onUrl: (url: string, kind: "auto" | "image" | "youtube") => string | null;
  onClose: () => void;
}

export default function AttachDialog({ onUpload, onUrl, onClose }: AttachDialogProps) {
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<"auto" | "image" | "youtube">("auto");
  const [error, setError] = useState<string | null>(null);

  const uploadBtnRef = useRef<HTMLButtonElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  // Al cerrar, el foco vuelve al elemento que abrió el diálogo.
  useEffect(() => {
    if (!showForm && uploadBtnRef.current) {
      uploadBtnRef.current.focus();
    }
  }, [showForm]);

  // Foco en URL input cuando se muestra el formulario
  useEffect(() => {
    if (showForm && urlInputRef.current) {
      urlInputRef.current.focus();
    }
  }, [showForm]);

  function handleUploadClick() {
    onUpload();
    onClose();
  }

  function handlePasteUrlClick() {
    setShowForm(true);
    setUrl("");
    setKind("auto");
    setError(null);
  }

  function handleCancelForm() {
    onClose();
  }

  function handleInsert() {
    setError(null);
    const result = onUrl(url, kind);
    if (result !== null) {
      setError(result);
    } else {
      setShowForm(false);
      setUrl("");
      onClose();
    }
  }

  function handleKeyDownUrl(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      handleInsert();
    }
  }

  return (
    <DialogFrame
      titleId="attach-dialog-title"
      title="Adjuntar"
      subtitle={showForm ? "Inserta una imagen o un video desde su dirección" : "Sube un archivo o pega una dirección"}
      glyph={Paperclip}
      tone="neutral"
      size="sm"
      onCancel={onClose}
      actions={
        showForm ? (
          <>
            <button type="button" onClick={handleCancelForm}>
              Cancelar
            </button>
            <button type="button" onClick={handleInsert} className="btn-primary">
              Insertar
            </button>
          </>
        ) : undefined
      }
    >
      {!showForm ? (
        <div className="attach-dialog-buttons">
          <button type="button" ref={uploadBtnRef} onClick={handleUploadClick} className="attach-dialog-btn">
            <Upload size={16} aria-hidden="true" />
            Subir archivo
          </button>
          <button type="button" onClick={handlePasteUrlClick} className="attach-dialog-btn">
            <Link2 size={16} aria-hidden="true" />
            Pegar URL
          </button>
        </div>
      ) : (
        <div className="attach-dialog-form">
          <div className="attach-dialog-field">
            <label htmlFor="attach-url" className="attach-dialog-label">
              URL
            </label>
            <input
              id="attach-url"
              ref={urlInputRef}
              type="text"
              className="attach-dialog-input"
              value={url}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
              onKeyDown={handleKeyDownUrl}
              aria-label="URL"
            />
          </div>

          <div className="attach-dialog-field">
            <label htmlFor="attach-kind" className="attach-dialog-label">
              Tipo
            </label>
            <select
              id="attach-kind"
              className="attach-dialog-select"
              value={kind}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setKind(e.target.value as "auto" | "image" | "youtube")}
              aria-label="Tipo"
            >
              <option value="auto">Automático</option>
              <option value="image">Imagen</option>
              <option value="youtube">Video de YouTube</option>
            </select>
          </div>

          {error && (
            <div className="attach-dialog-error" role="alert">
              {error}
            </div>
          )}
        </div>
      )}
    </DialogFrame>
  );
}
