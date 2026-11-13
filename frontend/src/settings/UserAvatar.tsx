import { initials } from "../vaults/vaultIcon";
import "./UserAvatar.css";

interface UserAvatarProps {
  photoUrl: string | null;
  /** Nombre o correo: de aquí salen las iniciales cuando no hay foto. */
  label: string;
  /** Lado en px. */
  size: number;
  /** Texto alternativo de la foto; vacío = decorativa. */
  alt?: string;
}

/** Avatar redondo: la foto del usuario o, sin ella, sus iniciales sobre el color de acento. */
export default function UserAvatar({ photoUrl, label, size, alt = "" }: UserAvatarProps) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  return (
    <div className="settings-avatar-container" style={style}>
      {photoUrl ? (
        <img src={photoUrl} alt={alt} className="settings-avatar" />
      ) : (
        <div className="settings-avatar-placeholder" title={label}>
          {initials(label)}
        </div>
      )}
    </div>
  );
}
