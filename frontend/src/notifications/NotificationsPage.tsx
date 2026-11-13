import { useCallback, useEffect, useState } from "react";
import { CheckCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDue } from "../tasks/taskModel";
import { NOTICES_CHANGED, listNotices, markAllRead, markRead, type Notice } from "./notificationsApi";
import "./notifications.css";

/** Pantalla de avisos (H-053): los más nuevos primero; un clic marca el aviso como leído y abre la tarea. */
export default function NotificationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Notice[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await listNotices();
      setItems(data.items);
      setUnread(data.unread);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
    // Un push que llega con esta pantalla abierta (o un cambio hecho en otro sitio) la actualiza al momento.
    const refresh = () => void load();
    window.addEventListener(NOTICES_CHANGED, refresh);
    return () => window.removeEventListener(NOTICES_CHANGED, refresh);
  }, [load]);

  async function open(notice: Notice) {
    if (!notice.read_at) await markRead(notice.id).catch(() => undefined);
    if (notice.url?.startsWith("/")) navigate(notice.url);
    else await load();
  }

  return (
    <section className="notices-page" aria-label="Avisos">
      <header className="notices-head">
        <h1>Avisos</h1>
        <button type="button" disabled={unread === 0} onClick={() => void markAllRead().then(load)}>
          <CheckCheck size={14} aria-hidden="true" /> Marcar todo como leído
        </button>
      </header>
      {failed && <p className="tasks-error" role="alert">No se pudieron leer los avisos. <button type="button" onClick={() => void load()}>Reintentar</button></p>}
      {items === null && !failed && <p className="tasks-empty">Cargando avisos…</p>}
      {items !== null && items.length === 0 && <p className="tasks-empty">No tienes avisos.</p>}
      <ul className="notices-list">
        {(items ?? []).map((notice) => (
          <li key={notice.id}>
            <button type="button" className={`notices-item${notice.read_at ? "" : " notices-item--unread"}`} onClick={() => void open(notice)}>
              <span className="notices-title">{notice.title}</span>
              {notice.body && <span className="notices-body">{notice.body}</span>}
              <span className="notices-time">{formatDue(notice.created_at)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
