import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { logout } from "../api/auth";
import { CHANGE_PASSWORD_PATH } from "../auth/RequireAuth";

/** Marco de las rutas privadas: secciones (SPEC-0003) y navegación de cuenta (RF-023). */
export default function AppLayout() {
  const navigate = useNavigate();
  const [error, setError] = useState(false);

  async function onLogout() {
    setError(false);
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch {
      // Las cookies son httpOnly: si el backend no las limpió, la sesión sigue abierta.
      setError(true);
    }
  }

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
        <button type="button" onClick={onLogout}>
          Cerrar sesión
        </button>
        {error && <p role="alert">No se pudo cerrar la sesión. Inténtalo de nuevo.</p>}
      </nav>
      <main>
        <Outlet />
      </main>
    </>
  );
}
