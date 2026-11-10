import { useCallback, useRef, useState } from "react";
import { ApiError, deletePhoto, updateDisplayName, uploadPhoto } from "../api/auth";
import { useMe, useRefreshMe } from "../auth/RequireAuth";
import { Camera, Check, Trash2, Upload } from "lucide-react";
import UserAvatar from "./UserAvatar";
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
  const [saved, setSaved] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveName = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      const trimmed = displayName.trim();
      await updateDisplayName(trimmed || null);
      await refreshMe();
      setSaved(true);
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

  const label = displayName.trim() || me.email;
  const nameChanged = displayName.trim() !== (me.display_name ?? "");
  const shownPhoto = previewUrl ?? me.photo_url;

  return (
    <section className="profile-page">
      <h2>Perfil</h2>
      <p className="settings-section-intro">Tu nombre y tu foto se muestran en el riel y en esta pantalla.</p>

      <div className="settings-card">
        <h3>Foto de perfil</h3>
        <div className="profile-photo-row">
          <UserAvatar photoUrl={shownPhoto} label={label} size={96} alt="Foto de perfil" />
          <div className="profile-photo-actions">
            <div className="profile-buttons">
              <button type="button" className="profile-button-secondary" disabled={isSaving} onClick={() => fileInputRef.current?.click()}>
                <Camera size={16} aria-hidden="true" />
                {me.photo_url || selectedFile ? "Elegir otra" : "Elegir foto"}
              </button>
              {selectedFile && (
                <button type="button" onClick={handleUploadPhoto} disabled={isSaving} className="profile-button-primary">
                  <Upload size={16} aria-hidden="true" />
                  {isSaving ? "Subiendo…" : "Subir foto"}
                </button>
              )}
              {me.photo_url && (
                <button type="button" onClick={handleDeletePhoto} disabled={isSaving} className="profile-button-danger">
                  <Trash2 size={16} aria-hidden="true" />
                  {isSaving ? "Eliminando…" : "Quitar foto"}
                </button>
              )}
            </div>
            <p className="profile-hint">
              {selectedFile ? `${selectedFile.name}: pulsa «Subir foto» para guardarla.` : "PNG, JPG o WebP, hasta 2 MB. Se recorta a cuadrado."}
            </p>
            <input
              id="photo-input"
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileSelect}
              disabled={isSaving}
              className="profile-file-input"
              aria-label="Foto de perfil (PNG, JPEG, WebP; máx. 2 MB)"
            />
          </div>
        </div>
      </div>

      <div className="settings-card">
        <h3>Información personal</h3>
        <div className="profile-field">
          <label htmlFor="display-name">Nombre</label>
          <input
            id="display-name"
            type="text"
            maxLength={80}
            value={displayName}
            placeholder="Cómo quieres que te llamemos"
            onChange={(e) => {
              setDisplayName(e.target.value);
              setSaved(false);
            }}
            disabled={isSaving}
            className="profile-input"
          />
          <p className="profile-hint">Se muestra en lugar de tu correo. {displayName.length}/80</p>
        </div>
        <div className="profile-field">
          <label htmlFor="profile-email">Correo</label>
          <input id="profile-email" type="email" value={me.email} readOnly className="profile-input" />
          <p className="profile-hint">Con este correo inicias sesión; no se puede cambiar aquí.</p>
        </div>
        <div className="profile-actions">
          {saved && !nameChanged && (
            <span role="status" className="profile-saved">
              <Check size={16} aria-hidden="true" /> Guardado
            </span>
          )}
          <button type="button" onClick={handleSaveName} disabled={isSaving || !nameChanged} className="profile-button-primary">
            {isSaving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>

      {error && (
        <div className="profile-error" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
