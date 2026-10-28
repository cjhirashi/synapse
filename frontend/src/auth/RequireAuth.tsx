import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ApiError, getMe, Me } from "../api/auth";

export const CHANGE_PASSWORD_PATH = "/settings/password";
export const API_KEYS_PATH = "/settings/api-keys";

type State = { status: "loading" } | { status: "anon" } | { status: "ok"; me: Me } | { status: "error" };

// Exportado para que las pruebas de componentes que cuelgan de `useMe()` (p. ej.
// AppLayout/AccountMenu) puedan proveer un `Me` sin pasar por `RequireAuth` + `getMe()`.
export const MeContext = createContext<Me | null>(null);

/** Usuario de la sesión verificada; sólo dentro de `RequireAuth`. */
export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe() fuera de <RequireAuth>");
  return me;
}

// Vuelve a pedir `/auth/me` y actualiza la sesión en caché. Quien cambia algo que `RequireAuth`
// decide con `me` (p. ej. `must_change_password` tras cambiar la contraseña) debe llamarla
// ANTES de navegar: si no, la redirección forzada se evalúa con el `me` obsoleto (VU-5).
const RefreshMeContext = createContext<(() => Promise<void>) | null>(null);

/** Renueva la sesión verificada; sólo dentro de `RequireAuth`. */
export function useRefreshMe(): () => Promise<void> {
  const refresh = useContext(RefreshMeContext);
  if (!refresh) throw new Error("useRefreshMe() fuera de <RequireAuth>");
  return refresh;
}

export default function RequireAuth({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const location = useLocation();

  const refreshMe = useCallback(async () => {
    setState({ status: "ok", me: await getMe() });
  }, []);

  useEffect(() => {
    let alive = true;
    getMe()
      .then((me) => alive && setState({ status: "ok", me }))
      .catch((err) => {
        if (!alive) return;
        if (err instanceof ApiError && err.status === 401) return setState({ status: "anon" });
        // Una comprobación al navegar que falla sin un 401 (sin red, backend caído) no cierra
        // una sesión ya verificada: la app sigue sobre la réplica local (SPEC-0005 RF-009).
        setState((previous) => (previous.status === "ok" ? previous : { status: "error" }));
      });
    return () => {
      alive = false;
    };
  }, [location.pathname]);

  if (state.status === "loading") return <p>Cargando…</p>;
  if (state.status === "anon") return <Navigate to="/login" replace />;
  if (state.status === "error") return <p role="alert">No se pudo verificar la sesión.</p>;
  if (state.me.must_change_password && location.pathname !== CHANGE_PASSWORD_PATH) {
    return <Navigate to={CHANGE_PASSWORD_PATH} replace />;
  }
  return (
    <RefreshMeContext.Provider value={refreshMe}>
      <MeContext.Provider value={state.me}>{children}</MeContext.Provider>
    </RefreshMeContext.Provider>
  );
}
