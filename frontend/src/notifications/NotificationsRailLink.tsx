import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { NavLink } from "react-router-dom";
import { NOTICES_CHANGED, unreadCount } from "./notificationsApi";

const POLL_MS = 45_000;

/** Entrada «Avisos» del riel con el contador de avisos sin leer: se relee cada 45 s con la pestaña visible, al volver a ella y al leer. */
export default function NotificationsRailLink({ expanded }: { expanded: boolean }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      unreadCount().then((n) => { if (alive) setCount(n); }).catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
    window.addEventListener("focus", refresh);
    window.addEventListener(NOTICES_CHANGED, refresh);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(NOTICES_CHANGED, refresh);
    };
  }, []);

  const label = count > 0 ? `Avisos (${count} sin leer)` : "Avisos";
  return (
    <NavLink to="/avisos" className="vault-rail-icon vault-rail-action" aria-label={label} title={label}>
      <span className="vault-rail-glyph notices-rail-glyph">
        <Bell size={18} aria-hidden="true" />
        {count > 0 && <span className="notices-badge" aria-hidden="true">{count > 99 ? "99+" : count}</span>}
      </span>
      {expanded && <span className="vault-rail-name">Avisos</span>}
    </NavLink>
  );
}
