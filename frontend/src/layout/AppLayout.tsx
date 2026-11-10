import { NavLink, Outlet } from "react-router-dom";
import BrandLogo from "../brand/BrandLogo";
import LogoutDialog from "../sync/LogoutDialog";
import SyncStatusBar from "../sync/SyncStatusBar";
import VaultRail from "../notes/VaultRail";
import "./AppLayout.css";

const navLinkClass = ({ isActive }: { isActive: boolean }) => (isActive ? "active" : undefined);

/**
 * Marco de las rutas privadas: sección principal (SPEC-0003), estado de la sincronización
 * (SPEC-0005 RF-009) y riel de bóvedas (SPEC-0008 RF-001). H-028 A7: Archivos, Papelera, el
 * selector de tema y el menú de usuario salen de la navbar — Archivos/Papelera/Usuario viven en
 * el riel y el tema en la pantalla de usuario. `LogoutDialog` sigue montado (el aviso de cambios
 * sin confirmar, RF-017); «Cerrar sesión» lo dispara ahora la pantalla de usuario vía `requestLogout()`.
 */
export default function AppLayout() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          {/* Logo oficial y después el nombre (SPEC-0011 RF-008). Sigue siendo un <div> sin enlace (RF-012). */}
          <BrandLogo />
          Synapse
        </div>
        <nav aria-label="Principal" className="app-nav-primary">
          {/* `end`: «Bóvedas» no se marca como actual dentro de `/vaults/trash`. */}
          <NavLink to="/vaults" end className={navLinkClass}>
            Bóvedas
          </NavLink>
        </nav>
        <nav aria-label="Cuenta" className="app-nav-account">
          <LogoutDialog />
        </nav>
      </header>
      <SyncStatusBar />
      {/* Riel de bóvedas (SPEC-0008 RF-001) a la izquierda de cada pantalla privada. */}
      <div className="app-body">
        <VaultRail />
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
