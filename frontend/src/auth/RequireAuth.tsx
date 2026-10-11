import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ApiError, getMe, Me } from "../api/auth";

export const CHANGE_PASSWORD_PATH = "/settings/password";

type State = { status: "loading" } | { status: "anon" } | { status: "ok"; me: Me } | { status: "error" };

export default function RequireAuth({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const location = useLocation();

  useEffect(() => {
    let alive = true;
    getMe()
      .then((me) => alive && setState({ status: "ok", me }))
      .catch((err) => alive && setState(err instanceof ApiError && err.status === 401 ? { status: "anon" } : { status: "error" }));
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
  return <>{children}</>;
}
