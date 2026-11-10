import { useCallback, useRef, useState } from "react";
import { ApiError, deletePhoto, updateDisplayName, uploadPhoto } from "../api/auth";
import { useMe, useRefreshMe } from "../auth/RequireAuth";
import { Camera, Check, Trash2 } from "lucide-react";
import { AVATAR_MAX_BYTES, AVATAR_TYPES, squareAvatar } from "./avatarImage";
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

  // Un solo paso: al elegir la foto se recorta a cuadrado, se muestra ya y se sube; el riel y la tarjeta se actualizan solos.
  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      setError(null);
      setSaved(false);
      if (!AVATAR_TYPES.includes(file.type)) {
        setError("Elige una imagen PNG, JPG o WebP.");
        return;
      }
      setIsSaving(true);
      let preview: string | null = null;
      try {
        const prepared = await squareAvatar(file);
        if (prepared.size > AVATAR_MAX_BYTES) {
          setError("La foto pesa más de 2 MB. Elige una más pequeña.");
          return;
        }
        preview = URL.createObjectURL(prepared);
        setPreviewUrl(preview);
        await uploadPhoto(prepared);
        await refreshMe();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "No se pudo subir la foto. Inténtalo de nuevo.");
      } finally {
        // La imagen vuelve a salir de `me.photo_url` (versión nueva); se descarta el blob local.
        setPreviewUrl(null);
        if (preview) URL.revokeObjectURL(preview);
        setIsSaving(false);
      }
    },
    [refreshMe],
  );

  const handleDeletePhoto = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    try {
      await deletePhoto();
      await refreshMe();
      setPreviewUrl(null);
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

      {error && (
        <div className="profile-error" role="alert">
          {error}
        </div>
      )}

      <div className="settings-card">
        <h3>Foto de perfil</h3>
        <div className="profile-photo-row">
          <UserAvatar photoUrl={shownPhoto} label={label} size={96} alt="Foto de perfil" />
          <div className="profile-photo-actions">
            <div className="profile-buttons">
              <button type="button" className="profile-button-secondary" disabled={isSaving} onClick={() => fileInputRef.current?.click()}>
                <Camera size={16} aria-hidden="true" />
                {previewUrl ? "Subiendo…" : me.photo_url ? "Cambiar foto" : "Elegir foto"}
              </button>
              {me.photo_url && (
                <button type="button" onClick={handleDeletePhoto} disabled={isSaving} className="profile-button-danger">
                  <Trash2 size={16} aria-hidden="true" />
                  Quitar foto
                </button>
              )}
            </div>
            <p className="profile-hint">PNG, JPG o WebP. Se recorta a cuadrado y se guarda al elegirla.</p>
            <input
              id="photo-input"
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileSelect}
              disabled={isSaving}
              className="profile-file-input"
              aria-label="Archivo de la foto de perfil (PNG, JPEG, WebP)"
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

    </section>
  );
}
