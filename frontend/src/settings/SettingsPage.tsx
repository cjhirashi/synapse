import { Bell, Bot, KeyRound, Lock, LogOut, Palette, User } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useMe } from "../auth/RequireAuth";
import { useSync } from "../sync/useSync";
import UserAvatar from "./UserAvatar";
import "./settings.css";

const NAV_ITEMS = [
  { href: "/settings/profile", label: "Perfil", Icon: User },
  { href: "/settings/password", label: "Contraseña", Icon: Lock },
  { href: "/settings/api-keys", label: "API keys", Icon: KeyRound },
  { href: "/settings/theme", label: "Tema", Icon: Palette },
  { href: "/settings/agent-access", label: "Agentes por bóveda", Icon: Bot },
  { href: "/settings/notifications", label: "Notificaciones", Icon: Bell },
];

const ROLE_LABEL = { admin: "Administrador", guest: "Invitado" } as const;

/**
 * Pantalla de usuario (H-028): tarjeta de identidad arriba (avatar, nombre, correo, rol y cerrar sesión)
 * y debajo la navegación de secciones con su contenido (Outlet).
 */
export default function SettingsPage() {
  const me = useMe();
  const { requestLogout } = useSync();

  const displayName = me.display_name || me.email;

  return (
    <div className="settings-page">
      <div className="settings-inner">
        <header className="settings-header">
          <UserAvatar photoUrl={me.photo_url} label={displayName} size={72} />
          <div className="settings-identity">
            <h1>{displayName}</h1>
            {me.display_name && <p className="settings-email">{me.email}</p>}
            <span className="settings-role">{ROLE_LABEL[me.role]}</span>
          </div>
          <button type="button" className="settings-logout" onClick={() => void requestLogout()} aria-label="Cerrar sesión">
            <LogOut size={16} aria-hidden="true" />
            <span>Cerrar sesión</span>
          </button>
        </header>

        <div className="settings-container">
          <nav className="settings-nav" aria-label="Secciones de usuario">
            {NAV_ITEMS.map(({ href, label, Icon }) => (
              <NavLink key={href} to={href} className={({ isActive }) => (isActive ? "active" : "")}>
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          <main className="settings-content">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
