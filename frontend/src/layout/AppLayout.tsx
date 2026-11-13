import { Link, Outlet, useMatch } from "react-router-dom";
import BrandLogo from "../brand/BrandLogo";
import NotificationsBell from "../notifications/NotificationsBell";
import LogoutDialog from "../sync/LogoutDialog";
import SyncStatusBar from "../sync/SyncStatusBar";
import VaultRail from "../notes/VaultRail";
import "./AppLayout.css";

/**
 * Marco de las rutas privadas: sección principal (SPEC-0003), estado de la sincronización
 * (SPEC-0005 RF-009) y riel de bóvedas (SPEC-0008 RF-001). H-028 A7: Archivos, Papelera, el
 * selector de tema y el menú de usuario salen de la navbar — Archivos/Papelera/Usuario viven en
 * el riel y el tema en la pantalla de usuario; el botón «Bóvedas» también salió: ahora es el enlace del logo. `LogoutDialog` sigue montado (el aviso de cambios
 * sin confirmar, RF-017); «Cerrar sesión» lo dispara ahora la pantalla de usuario vía `requestLogout()`.
 */
export default function AppLayout() {
  // Ajustes de usuario es una pantalla aparte: su barra lateral es la de opciones y no se mezcla con el riel de bóvedas.
  const inSettings = useMatch("/settings/*") !== null;
  return (
    <div className="app-shell">
      <header className="app-header">
        {/* Logo y nombre son el enlace a las bóvedas (sustituye al botón «Bóvedas» de la navbar). El logo es decorativo: el nombre accesible sale de la etiqueta. */}
        <Link to="/vaults" className="app-brand" aria-label="Synapse, ir a Bóvedas" title="Ir a Bóvedas">
          <BrandLogo />
          Synapse
        </Link>
        <nav aria-label="Cuenta" className="app-nav-account">
          <LogoutDialog />
        </nav>
        {/* Campana de avisos: siempre en el extremo derecho de la navbar (antes vivía en el riel de bóvedas). */}
        <NotificationsBell />
      </header>
      <SyncStatusBar />
      {/* Riel de bóvedas (SPEC-0008 RF-001) a la izquierda de cada pantalla privada. */}
      <div className="app-body">
        {!inSettings && <VaultRail />}
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
