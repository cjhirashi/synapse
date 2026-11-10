import { useCallback, useRef, useState } from "react";
import { ApiError, deletePhoto, updateDisplayName, uploadPhoto } from "../api/auth";
import { useMe, useRefreshMe } from "../auth/RequireAuth";
import { initials } from "../vaults/vaultIcon";
import "./profile.css";

/**
 * Sección Perfil (H-028 B4+B10).
 * Editor de nombre (input maxLength 80, guardar → updateDisplayName → refreshMe).
 * Avatar cuadrado con object-fit: cover; previsualización; subir/quitar foto.
 */
export default function ProfilePage() {
  const me = useMe();
  const refreshMe = useRefreshMe();

  const [displayName, setDisplayName] = useState(me.display_name ?? "");
  // `previewUrl` es SOLO el blob del archivo recién elegido; cuando es null, la imagen mostrada sale
  // de `me.photo_url` (ya refrescado tras subir/quitar). Así nunca queda un blob revocado en el <img>.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveName = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    try {
      const trimmed = displayName.trim();
      await updateDisplayName(trimmed || null);
      await refreshMe();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Error desconocido al guardar el nombre.");
      }
    } finally {
      setIsSaving(false);
    }
  }, [displayName, refreshMe]);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setError(null);
  }, []);

  const handleUploadPhoto = useCallback(async () => {
    if (!selectedFile) return;

    setIsSaving(true);
    setError(null);
    try {
      await uploadPhoto(selectedFile);
      await refreshMe();
      setSelectedFile(null);
      if (previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
      // La imagen vuelve a salir de `me.photo_url` (versión nueva); se descarta el blob local.
      setPreviewUrl(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Error desconocido al subir la foto.");
      }
    } finally {
      setIsSaving(false);
    }
  }, [selectedFile, refreshMe, previewUrl]);

  const handleDeletePhoto = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    try {
      await deletePhoto();
      await refreshMe();
      setPreviewUrl(null);
      setSelectedFile(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Error desconocido al eliminar la foto.");
      }
    } finally {
      setIsSaving(false);
    }
  }, [refreshMe]);

  const displayNameForAvatar = displayName || me.email;
  const avatarInitials = initials(displayNameForAvatar);

  return (
    <section className="profile-page">
      <h1>{displayName || me.email}</h1>

      {/* Avatar */}
      <div className="profile-section">
        <div className="settings-avatar-container">
          {previewUrl ?? me.photo_url ? (
            <img
              src={previewUrl ?? me.photo_url ?? undefined}
              alt="Foto de perfil"
              className="settings-avatar"
            />
          ) : (
            <div className="settings-avatar-placeholder" title={displayNameForAvatar}>
              {avatarInitials}
            </div>
          )}
        </div>
      </div>

      {/* Editor de nombre */}
      <div className="profile-section">
        <label htmlFor="display-name">Nombre</label>
        <input
          id="display-name"
          type="text"
          maxLength={80}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          disabled={isSaving}
          className="profile-input"
        />
        <button
          onClick={handleSaveName}
          disabled={isSaving}
          className="profile-button-primary"
        >
          {isSaving ? "Guardando…" : "Guardar"}
        </button>
      </div>

      {/* Foto */}
      <div className="profile-section">
        <label htmlFor="photo-input">Foto de perfil (PNG, JPEG, WebP; máx. 2 MB)</label>
        <input
          id="photo-input"
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFileSelect}
          disabled={isSaving}
          className="profile-file-input"
        />
        {selectedFile && (
          <button
            onClick={handleUploadPhoto}
            disabled={isSaving}
            className="profile-button-primary"
          >
            {isSaving ? "Subiendo…" : "Subir foto"}
          </button>
        )}
        {me.photo_url && (
          <button
            onClick={handleDeletePhoto}
            disabled={isSaving}
            className="profile-button-danger"
          >
            {isSaving ? "Eliminando…" : "Quitar foto"}
          </button>
        )}
      </div>

      {/* Mensajes de error */}
      {error && (
        <div className="profile-error" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
