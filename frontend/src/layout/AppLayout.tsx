import { Link, NavLink, Outlet } from "react-router-dom";
import { CHANGE_PASSWORD_PATH } from "../auth/RequireAuth";
import ThemeToggle from "../theme/ThemeToggle";
import LogoutDialog from "../sync/LogoutDialog";
import SyncStatusBar from "../sync/SyncStatusBar";
import { useSync } from "../sync/useSync";
import "./AppLayout.css";

const navLinkClass = ({ isActive }: { isActive: boolean }) => (isActive ? "active" : undefined);

/**
 * Marco de las rutas privadas: secciones (SPEC-0003), navegación de cuenta (RF-023) y
 * estado de la sincronización (SPEC-0005 RF-009). "Cerrar sesión" pasa por la
 * sincronización: con cambios sin confirmar abre antes el aviso (RF-017).
 */
export default function AppLayout() {
  const { requestLogout } = useSync();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <span className="app-brand-mark" aria-hidden="true" />
          Synapse
        </div>
        <nav aria-label="Principal" className="app-nav-primary">
          {/* `end`: «Bóvedas» no se marca como actual dentro de `/vaults/trash`. */}
          <NavLink to="/vaults" end className={navLinkClass}>
            Bóvedas
          </NavLink>
          <NavLink to="/vaults/trash" className={navLinkClass}>
            Papelera
          </NavLink>
        </nav>
        <nav aria-label="Cuenta" className="app-nav-account">
          <Link to={CHANGE_PASSWORD_PATH}>Cambiar contraseña</Link>
          <button type="button" onClick={() => void requestLogout()}>
            Cerrar sesión
          </button>
          <ThemeToggle />
          <LogoutDialog />
        </nav>
      </header>
      <SyncStatusBar />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
