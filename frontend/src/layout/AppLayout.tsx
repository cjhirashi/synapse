import { Link, NavLink, Outlet } from "react-router-dom";
import { CHANGE_PASSWORD_PATH } from "../auth/RequireAuth";
import LogoutDialog from "../sync/LogoutDialog";
import SyncStatusBar from "../sync/SyncStatusBar";
import { useSync } from "../sync/useSync";

/**
 * Marco de las rutas privadas: secciones (SPEC-0003), navegación de cuenta (RF-023) y
 * estado de la sincronización (SPEC-0005 RF-009). "Cerrar sesión" pasa por la
 * sincronización: con cambios sin confirmar abre antes el aviso (RF-017).
 */
export default function AppLayout() {
  const { requestLogout } = useSync();

  return (
    <>
      <nav aria-label="Principal">
        {/* `end`: «Bóvedas» no se marca como actual dentro de `/vaults/trash`. */}
        <NavLink to="/vaults" end>
          Bóvedas
        </NavLink>{" "}
        <NavLink to="/vaults/trash">Papelera</NavLink>
      </nav>
      <nav aria-label="Cuenta">
        <Link to={CHANGE_PASSWORD_PATH}>Cambiar contraseña</Link>{" "}
        <button type="button" onClick={() => void requestLogout()}>
          Cerrar sesión
        </button>
        <LogoutDialog />
      </nav>
      <SyncStatusBar />
      <main>
        <Outlet />
      </main>
    </>
  );
}
