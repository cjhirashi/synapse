import { useCallback, useEffect, useMemo, useState } from "react";
import { AlarmClock, CalendarClock, Check, CheckCheck, Gauge, Globe, RefreshCw, UserPlus, Users, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import AgentBadge from "../agents/AgentBadge";
import UserBadge from "../agents/UserBadge";
import { STATUS_LABEL, PRIORITY_LABEL, addDays, dateKey, formatDay, formatDue, formatTime } from "../tasks/taskModel";
import VaultChip from "../vaults/VaultChip";
import {
  NOTICES_CHANGED, listNoticeVaults, listNotices, markAllRead, markRead, type Notice, type NoticeVault,
} from "./notificationsApi";
import "./notifications.css";

const KIND: Record<string, { icon: LucideIcon; label: string }> = {
  task_assigned: { icon: UserPlus, label: "Tarea asignada" },
  task_status: { icon: RefreshCw, label: "Cambio de estado" },
  task_due: { icon: AlarmClock, label: "Vencimiento" },
  publication_expired: { icon: Globe, label: "Publicación" },
  limit_grace: { icon: Gauge, label: "Límites de la cuenta" },
  vault_share: { icon: Users, label: "Compartir bóveda" },
};

/** Encabezado del aviso sin repetir el título de la tarea (la tarjeta ya lo muestra): «Vence en 1 h», «aira marcó la tarea como Hecha». */
export function headline(notice: Notice): string {
  if (!notice.task) return notice.title;
  const text = notice.title.replace(/«[^»]*»\s*(\(de [^)]*\)\s*)?/, notice.kind === "task_due" ? "" : "la tarea ").replace(/\s+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function dayLabel(iso: string, now = new Date()): string {
  const key = dateKey(iso);
  const today = dateKey(now.toISOString());
  if (key === today) return "Hoy";
  if (key === addDays(today, -1)) return "Ayer";
  return formatDay(iso);
}

function groupByDay(items: Notice[]): Array<{ key: string; label: string; items: Notice[] }> {
  const groups: Array<{ key: string; label: string; items: Notice[] }> = [];
  for (const notice of items) {
    const key = dateKey(notice.created_at);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(notice);
    else groups.push({ key, label: dayLabel(notice.created_at), items: [notice] });
  }
  return groups;
}

function NoticeCard({ notice, vault, onOpen, onRead }: { notice: Notice; vault: NoticeVault | undefined; onOpen: (notice: Notice) => void; onRead: (notice: Notice) => void }) {
  const { icon: Icon, label } = KIND[notice.kind] ?? { icon: RefreshCw, label: "Aviso" };
  const task = notice.task ?? null;
  const isTask = notice.resource_type === "task";
  // Sin tarea ni cuerpo (p. ej. una invitación) el mensaje es el título y no se repite como titular; la bóveda solo se muestra si la persona la conoce.
  const lone = !task && !isTask && !notice.body;
  const showVault = !!notice.vault_id && (isTask || !!vault);
  const unread = !notice.read_at;
  return (
    <div className={`notice-card${unread ? " notice-card--unread" : ""}`} data-kind={notice.kind}>
    <button type="button" className="notice-open" onClick={() => onOpen(notice)}>
      <span className="notice-icon" aria-hidden="true"><Icon size={18} /></span>
      <span className="notice-main">
        <span className="notice-top">
          <span className="notice-kind">{label}</span>
          {!lone && <span className="notice-headline">{headline(notice)}</span>}
          <time className="notice-time" dateTime={notice.created_at} title={formatDue(notice.created_at)}>{formatTime(notice.created_at)}</time>
        </span>
        <span className="notice-title">{task?.title ?? notice.body ?? notice.title}</span>
        {task?.description && <span className="notice-desc">{task.description}</span>}
        {(isTask || task || showVault) && <span className="notice-meta">
          {task ? (
            <>
              <span className="notice-chip notice-status" data-status={task.status}>{STATUS_LABEL[task.status]}</span>
              <span className="notice-owner" title="Responsable">
                {task.assignee_type === "agent" && task.assignee_agent_id ? <AgentBadge agentId={task.assignee_agent_id} size={20} /> : <UserBadge size={20} label="Tú" />}
              </span>
              {task.priority === "high" && <span className="notice-chip notice-chip--high">Prioridad {PRIORITY_LABEL.high.toLowerCase()}</span>}
              {task.due_at && <span className="notice-due"><CalendarClock size={13} aria-hidden="true" />{formatDue(task.due_at)}</span>}
            </>
          ) : (
            isTask && <span className="notice-chip notice-gone">Tarea eliminada</span>
          )}
          {showVault && notice.vault_id && (
            <span className="notice-vault" title="Bóveda">
              <VaultChip id={notice.vault_id} name={vault?.name ?? "B"} icon={vault?.icon} />
              <span className="notice-vault-name">{vault?.name ?? "Bóveda"}</span>
            </span>
          )}
        </span>}
      </span>
    </button>
    {unread && (
      <button type="button" className="notice-read" onClick={() => onRead(notice)} aria-label={`Marcar como leído: ${task?.title ?? notice.title}`} title="Marcar como leído sin abrir la tarea">
        <Check size={16} aria-hidden="true" />
      </button>
    )}
    </div>
  );
}

/** Pantalla de avisos (H-053): los más nuevos primero, por día; cada aviso trae su tarea (título, descripción, estado, responsable y bóveda). Un clic lo marca leído y abre la tarea. */
export default function NotificationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Notice[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [failed, setFailed] = useState(false);
  const [vaults, setVaults] = useState<Map<string, NoticeVault>>(new Map());
  const [onlyUnread, setOnlyUnread] = useState(false);

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
    listNoticeVaults().then((list) => setVaults(new Map(list.map((v) => [v.id, v])))).catch(() => undefined);
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

  async function read(notice: Notice) {
    await markRead(notice.id).catch(() => undefined);
  }

  const shown = useMemo(() => (items ?? []).filter((n) => !onlyUnread || !n.read_at), [items, onlyUnread]);
  const groups = useMemo(() => groupByDay(shown), [shown]);

  return (
    <section className="notices-page" aria-label="Avisos">
      <header className="notices-head">
        <div>
          <h1>Avisos</h1>
          <p className="notices-sub">{unread === 0 ? "Estás al día." : `${unread} sin leer`}</p>
        </div>
        <button type="button" className="notices-readall" disabled={unread === 0} onClick={() => void markAllRead().then(load)}>
          <CheckCheck size={14} aria-hidden="true" /> Marcar todo como leído
        </button>
      </header>
      <div className="notices-filter" role="group" aria-label="Filtrar avisos">
        <button type="button" aria-pressed={!onlyUnread} onClick={() => setOnlyUnread(false)}>Todos</button>
        <button type="button" aria-pressed={onlyUnread} onClick={() => setOnlyUnread(true)}>Sin leer{unread > 0 ? ` (${unread})` : ""}</button>
      </div>
      {failed && <p className="tasks-error" role="alert">No se pudieron leer los avisos. <button type="button" onClick={() => void load()}>Reintentar</button></p>}
      {items === null && !failed && <p className="tasks-empty">Cargando avisos…</p>}
      {items !== null && items.length === 0 && <p className="tasks-empty">No tienes avisos.</p>}
      {items !== null && items.length > 0 && shown.length === 0 && <p className="tasks-empty">No tienes avisos sin leer.</p>}
      {groups.map((group) => (
        <section key={group.key} className="notices-group" aria-label={group.label}>
          <h2 className="notices-day">{group.label}</h2>
          <ul className="notices-list">
            {group.items.map((notice) => (
              <li key={notice.id}>
                <NoticeCard notice={notice} vault={notice.vault_id ? vaults.get(notice.vault_id) : undefined} onOpen={(n) => void open(n)} onRead={(n) => void read(n)} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
