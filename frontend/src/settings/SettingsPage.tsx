import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, Bell, Bot, KeyRound, Lock, LogOut, PanelLeft, PanelLeftClose, Palette, User } from "lucide-react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useMe } from "../auth/RequireAuth";
import { useMediaQuery } from "../layout/useMediaQuery";
import { useSync } from "../sync/useSync";
import UserAvatar from "./UserAvatar";
import "./settings.css";

// Las dos secciones de agentes van juntas: las keys identifican al agente y la asignación decide dónde escribe.
const NAV_GROUPS = [
  {
    title: "Cuenta",
    items: [
      { href: "/settings/profile", label: "Perfil", Icon: User },
      { href: "/settings/password", label: "Contraseña", Icon: Lock },
      { href: "/settings/theme", label: "Tema", Icon: Palette },
      { href: "/settings/notifications", label: "Notificaciones", Icon: Bell },
    ],
  },
  {
    title: "Agentes",
    items: [
      { href: "/settings/api-keys", label: "API keys", Icon: KeyRound },
      { href: "/settings/agent-access", label: "Agentes por bóveda", Icon: Bot },
    ],
  },
];
const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

const ROLE_LABEL = { admin: "Administrador", guest: "Invitado" } as const;

/**
 * Pantalla de usuario (H-028), aparte de la gestión de bóvedas: barra lateral con el regreso a «Bóvedas», la identidad,
 * las secciones y «Cerrar sesión»; a la derecha, el contenido de la sección (Outlet). Sin el riel de bóvedas.
 * En móvil (≤ 640 px) la barra es flotante como la de una bóveda: un botón en la franja superior la despliega y se
 * cierra al elegir una sección, con un clic fuera o con Escape.
 */
export default function SettingsPage() {
  const me = useMe();
  const { requestLogout } = useSync();
  const { pathname } = useLocation();
  const isMobile = useMediaQuery("(max-width: 640px)");
  const [open, setOpen] = useState(false);
  const sideId = useId();
  const sideRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const displayName = me.display_name || me.email;
  const section = NAV_ITEMS.find((item) => pathname.startsWith(item.href))?.label ?? "Ajustes";

  useEffect(() => setOpen(false), [isMobile, pathname]);

  useEffect(() => {
    if (!isMobile || !open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!sideRef.current?.contains(target) && !toggleRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [isMobile, open]);

  const toggleLabel = open ? "Ocultar el menú de ajustes" : "Mostrar el menú de ajustes";

  return (
    <div className="settings-page">
      <div className="settings-titlebar">
        <button ref={toggleRef} type="button" className="settings-toggle" aria-expanded={open} aria-controls={sideId} aria-label={toggleLabel} title={toggleLabel} onClick={() => setOpen((v) => !v)}>
          {open ? <PanelLeftClose size={18} aria-hidden="true" /> : <PanelLeft size={18} aria-hidden="true" />}
        </button>
        <span className="settings-titlebar-name">{section}</span>
      </div>

      <div className="settings-body">
        <aside
          ref={sideRef}
          id={sideId}
          className="settings-side"
          data-floating={isMobile ? "" : undefined}
          data-open={open ? "" : undefined}
        >
          <Link to="/vaults" className="settings-back">
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Volver a bóvedas</span>
          </Link>

          <header className="settings-header">
            <UserAvatar photoUrl={me.photo_url} label={displayName} size={56} />
            <div className="settings-identity">
              <h1>{displayName}</h1>
              {me.display_name && <p className="settings-email">{me.email}</p>}
              <span className="settings-role">{ROLE_LABEL[me.role]}</span>
            </div>
          </header>

          <nav className="settings-nav" aria-label="Secciones de usuario">
            {NAV_GROUPS.map((group) => (
              <div key={group.title} className="settings-nav-group" role="group" aria-label={group.title}>
                <span className="settings-nav-title" aria-hidden="true">{group.title}</span>
                {group.items.map(({ href, label, Icon }) => (
                  <NavLink key={href} to={href} className={({ isActive }) => (isActive ? "active" : "")}>
                    <Icon size={18} aria-hidden="true" />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>

          <div className="settings-side-footer">
            <button type="button" className="settings-logout" onClick={() => void requestLogout()} aria-label="Cerrar sesión">
              <LogOut size={18} aria-hidden="true" />
              <span>Cerrar sesión</span>
            </button>
          </div>
        </aside>

        <main className="settings-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
