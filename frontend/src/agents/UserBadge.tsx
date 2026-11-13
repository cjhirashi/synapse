import { useContext } from "react";
import { MeContext } from "../auth/RequireAuth";
import UserAvatar from "../settings/UserAvatar";
import "./agents.css";

/**
 * «Yo» con tu foto de perfil o, si no has cargado una, tus iniciales (las del nombre o, sin nombre, las del correo). Es la
 * contraparte de `AgentBadge`: donde un agente sale con su foto y nombre, tú sales con la tuya y «Yo».
 */
export default function UserBadge({ size = 18, label = "Yo" }: { size?: number; label?: string | null }) {
  const me = useContext(MeContext); // sin sesión (pruebas, vistas previas) cae a las iniciales de «Yo»
  const name = me?.display_name || me?.email || "Yo";
  return (
    <span className="agent-badge user-badge" title={me ? `${name} (tú)` : "Tú"}>
      <span aria-hidden="true" style={{ display: "inline-flex" }}>
        <UserAvatar photoUrl={me?.photo_url ?? null} label={name} size={size} />
      </span>
      {label !== null && <span className="agent-badge-name">{label}</span>}
    </span>
  );
}
