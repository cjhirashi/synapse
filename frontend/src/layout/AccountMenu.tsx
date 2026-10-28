import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { useMe, API_KEYS_PATH, CHANGE_PASSWORD_PATH } from "../auth/RequireAuth";
import { useSync } from "../sync/useSync";
import "./AccountMenu.css";

/** Avatar + correo con menú desplegable (cambiar contraseña / cerrar sesión). */
export default function AccountMenu() {
  const { email } = useMe();
  const { requestLogout } = useSync();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="account-menu" ref={ref}>
      <button
        type="button"
        className="account-menu-trigger"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Menú de cuenta (${email})`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="account-avatar" aria-hidden="true">
          {email.charAt(0).toUpperCase()}
        </span>
        <span className="account-email">{email}</span>
        <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
      </button>

      {open && (
        <div className="account-menu-popover">
          <div className="account-menu-header">{email}</div>
          <Link to={CHANGE_PASSWORD_PATH} onClick={() => setOpen(false)}>
            Cambiar contraseña
          </Link>
          <Link to={API_KEYS_PATH} onClick={() => setOpen(false)}>
            API keys
          </Link>
          <button
            type="button"
            className="account-menu-logout"
            onClick={() => {
              setOpen(false);
              void requestLogout();
            }}
          >
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
