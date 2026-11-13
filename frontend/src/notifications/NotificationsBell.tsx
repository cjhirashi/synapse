import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { NavLink } from "react-router-dom";
import { NOTICES_CHANGED, unreadCount } from "./notificationsApi";
import "./notifications.css";

const POLL_MS = 30_000;

/**
 * Campana de avisos en el extremo derecho de la navbar, con el contador de sin leer. Se relee cada 30 s con la pestaña visible,
 * al volver a ella, al leer y al instante cuando el service worker recibe un push (así el número sube sin esperar al sondeo).
 */
export default function NotificationsBell() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      unreadCount().then((n) => { if (alive) setCount(n); }).catch(() => undefined);
    };
    const onWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === "NOTICES_CHANGED") window.dispatchEvent(new Event(NOTICES_CHANGED));
    };
    refresh();
    const timer = window.setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
    window.addEventListener("focus", refresh);
    window.addEventListener(NOTICES_CHANGED, refresh);
    navigator.serviceWorker?.addEventListener("message", onWorkerMessage);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(NOTICES_CHANGED, refresh);
      navigator.serviceWorker?.removeEventListener("message", onWorkerMessage);
    };
  }, []);

  const label = count > 0 ? `Avisos (${count} sin leer)` : "Avisos";
  return (
    <NavLink to="/avisos" className={({ isActive }) => `app-bell${isActive ? " active" : ""}`} aria-label={label} title={label}>
      <Bell size={20} aria-hidden="true" />
      {count > 0 && <span className="notices-badge" aria-hidden="true">{count > 99 ? "99+" : count}</span>}
    </NavLink>
  );
}
