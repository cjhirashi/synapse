/**
 * Diálogo para adjuntar archivos o URLs (H-025 paso 7).
 * Dos botones iniciales: "Subir archivo" y "Pegar URL".
 * Al elegir "Pegar URL", muestra formulario con campo URL, tipo y botones Insertar/Cancelar.
 */
import { ChangeEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";

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
  const dialogRef = useRef<HTMLDivElement>(null);

  // Al cerrar, el foco vuelve al elemento que abrió el diálogo.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => {
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  // Foco inicial
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

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  function handleKeyDownUrl(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      handleInsert();
    }
  }

  function handleFocusTrap(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;

    const focusableElements = dialogRef.current?.querySelectorAll(
      'button, input, select'
    ) as NodeListOf<HTMLElement> | undefined;

    if (!focusableElements || focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement as HTMLElement;

    if (event.shiftKey) {
      if (activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      }
    } else {
      if (activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="attach-dialog-title"
      className="attach-dialog"
      onKeyDown={(e) => {
        handleKeyDown(e);
        handleFocusTrap(e);
      }}
    >
      <h2 id="attach-dialog-title" className="attach-dialog-title">
        Adjuntar
      </h2>

      {!showForm ? (
        <div className="attach-dialog-buttons">
          <button type="button" ref={uploadBtnRef} onClick={handleUploadClick} className="attach-dialog-btn">
            Subir archivo
          </button>
          <button type="button" onClick={handlePasteUrlClick} className="attach-dialog-btn">
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

          <div className="attach-dialog-actions">
            <button type="button" onClick={handleInsert} className="attach-dialog-btn attach-dialog-btn-primary">
              Insertar
            </button>
            <button type="button" onClick={handleCancelForm} className="attach-dialog-btn">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
