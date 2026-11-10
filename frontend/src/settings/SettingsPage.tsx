import { LogOut } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useMe, useRefreshMe } from "../auth/RequireAuth";
import { useSync } from "../sync/useSync";
import "./settings.css";

/**
 * Pantalla de usuario (H-028 B1-B3).
 * Layout de dos columnas: navegación lateral + contenido (Outlet).
 * Encabezado con el nombre o correo del usuario.
 * Botón «Cerrar sesión» al pie de la navegación.
 */
export default function SettingsPage() {
  const me = useMe();
  const refreshMe = useRefreshMe();
  const { requestLogout } = useSync();

  const displayName = me.display_name || me.email;

  const handleLogout = async () => {
    await requestLogout();
  };

  const navItems = [
    { href: "/settings/profile", label: "Perfil" },
    { href: "/settings/password", label: "Contraseña" },
    { href: "/settings/api-keys", label: "API keys" },
    { href: "/settings/theme", label: "Tema" },
    { href: "/settings/agent-access", label: "Agentes por bóveda" },
  ];

  return (
    <div className="settings-page">
      {/* Encabezado con el nombre del usuario */}
      <header className="settings-header">
        <h1>{displayName}</h1>
      </header>

      <div className="settings-container">
        {/* Navegación lateral */}
        <nav className="settings-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              className={({ isActive }) => isActive ? "active" : ""}
            >
              {item.label}
            </NavLink>
          ))}

          {/* Botón cerrar sesión al pie */}
          <button className="settings-logout" onClick={handleLogout} aria-label="Cerrar sesión">
            <LogOut size={20} />
            <span>Cerrar sesión</span>
          </button>
        </nav>

        {/* Contenido de la sección activa */}
        <main className="settings-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
