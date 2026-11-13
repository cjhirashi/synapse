import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import AgentBadge from "../agents/AgentBadge";
import UserBadge from "../agents/UserBadge";
import type { ViewActions } from "./TaskViews";
import {
  GANTT_PX, STATUS_LABEL, addDays, daysBetween, formatDay, formatDue, ganttRange, ganttRows, isClosed, isOverdue, monthName,
  type GanttScale, type TaskNode,
} from "./taskModel";

const SCALES: Array<[GanttScale, string]> = [["day", "Día"], ["week", "Semana"], ["month", "Mes"]];
const DOW = ["D", "L", "M", "M", "J", "V", "S"];
/** Ancho mínimo de una barra para que su título quepa dentro; si es menor, el título va a su derecha. */
const TITLE_INSIDE_PX = 120;
/** Ancho mínimo para mostrar la foto del responsable dentro de la barra. */
const WHO_INSIDE_PX = 36;

/** Línea de tiempo: una fila por tarea y subtarea, con su barra de la creación al vencimiento, coloreada por estado. */
export default function TaskGantt({ nodes, actions, todayKey }: { nodes: TaskNode[]; actions: ViewActions; todayKey: string }) {
  const [scale, setScale] = useState<GanttScale>("day");
  const scroller = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => ganttRows(nodes), [nodes]);
  const { from, days } = useMemo(() => ganttRange(rows, todayKey), [rows, todayKey]);
  const px = GANTT_PX[scale];
  const todayOffset = daysBetween(from, todayKey) * px;

  const centerToday = () => {
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, todayOffset - el.clientWidth / 3);
  };
  // Al abrir y al cambiar de escala, «hoy» queda a la vista.
  useEffect(centerToday, [scale]); // eslint-disable-line react-hooks/exhaustive-deps

  const dayList = useMemo(() => Array.from({ length: days }, (_, i) => addDays(from, i)), [from, days]);
  const months = useMemo(() => {
    const out: Array<{ key: string; label: string; span: number }> = [];
    for (const key of dayList) {
      const month = key.slice(0, 7);
      const last = out[out.length - 1];
      if (last?.key === month) last.span += 1;
      else out.push({ key: month, label: `${monthName(+key.slice(5, 7))} ${key.slice(0, 4)}`, span: 1 });
    }
    return out;
  }, [dayList]);

  if (rows.length === 0) return <p className="tasks-empty">No hay tareas con estos filtros.</p>;

  return (
    <div className="tasks-gantt" data-scale={scale} style={{ "--g-day": `${px}px`, "--g-days": days } as CSSProperties}>
      <div className="tasks-gantt-bar">
        <div className="tasks-cal-modes" role="group" aria-label="Escala de la línea de tiempo">
          {SCALES.map(([id, label]) => (
            <button key={id} type="button" className="tasks-cal-mode" aria-pressed={scale === id} onClick={() => setScale(id)}>{label}</button>
          ))}
        </div>
        <button type="button" className="tasks-cal-step tasks-cal-today" onClick={centerToday}>Hoy</button>
        <p className="tasks-cal-note">Cada barra va del inicio de la tarea a su vencimiento; sin inicio, desde que se creó.</p>
      </div>
      <div className="tasks-gantt-scroll" ref={scroller}>
        <div className="tasks-gantt-grid" role="list" aria-label="Línea de tiempo de tareas">
          <div className="tasks-gantt-head" aria-hidden="true">
            <div className="tasks-gantt-label">Tarea</div>
            <div className="tasks-gantt-axis">
              <div className="tasks-gantt-months">
                {months.map((m) => <span key={m.key} style={{ width: m.span * px }}>{m.label}</span>)}
              </div>
              {scale !== "month" && (
                <div className="tasks-gantt-days">
                  {dayList.map((key) => {
                    const dow = new Date(`${key}T12:00:00Z`).getUTCDay();
                    const show = scale === "day" || dow === 1;
                    return (
                      <span key={key} className={`${key === todayKey ? "is-today" : ""}${dow === 0 || dow === 6 ? " is-weekend" : ""}`} style={{ width: px }}>
                        {show && <>{scale === "day" && <small>{DOW[dow]}</small>}{+key.slice(8)}</>}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="tasks-gantt-body">
            <span className="tasks-gantt-today" style={{ left: `calc(var(--g-label) + ${todayOffset + px / 2}px)` }} aria-hidden="true" />
            {rows.map(({ task, depth, start, end, progress }) => {
              const left = daysBetween(from, start) * px;
              const width = ((end === null ? 0 : daysBetween(start, end)) + 1) * px;
              const outside = width < TITLE_INSIDE_PX;
              const from_ = formatDay(task.start_at ?? task.created_at);
              const range = end === null ? `desde ${from_} · sin vencimiento` : `${from_} → ${formatDue(task.due_at ?? `${end}T12:00:00Z`)}`;
              return (
                <div key={task.id} role="listitem" id={`task-${task.id}`} className={`tasks-gantt-row${depth ? " tasks-gantt-row--sub" : ""}${isClosed(task) ? " tasks-row--closed" : ""}${actions.focusId === task.id ? " tasks-row--focus" : ""}`} data-status={task.status}>
                  <div className="tasks-gantt-label">
                    <span className="tasks-gantt-dot" aria-hidden="true" />
                    <button type="button" className="tasks-title-btn" title="Ver el detalle" aria-label={`Ver detalle de ${task.title}`} onClick={() => actions.onOpen(task)}>{task.title}</button>
                    {progress && <span className="tasks-progress">{progress.done}/{progress.total}</span>}
                  </div>
                  <div className="tasks-gantt-track">
                    <button
                      type="button" className={`tasks-gantt-item${end === null ? " tasks-gantt-item--open" : ""}${progress ? " tasks-gantt-item--summary" : ""}${isOverdue(task) ? " tasks-gantt-item--late" : ""}`}
                      style={{ left, width }} title={`${task.title} · ${STATUS_LABEL[task.status]} · ${range}`}
                      aria-label={`${task.title}, ${STATUS_LABEL[task.status]}, ${range}`} onClick={() => actions.onOpen(task)}
                    >
                      {progress && <i className="tasks-gantt-fill" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} aria-hidden="true" />}
                      {width >= WHO_INSIDE_PX && (
                        <span className="tasks-gantt-who" aria-hidden="true">
                          {task.assignee_type === "agent" && task.assignee_agent_id ? <AgentBadge agentId={task.assignee_agent_id} size={16} showName={false} /> : <UserBadge size={16} label={null} />}
                        </span>
                      )}
                      {!outside && <span className="tasks-gantt-text">{task.title}</span>}
                    </button>
                    {outside && <span className="tasks-gantt-after" style={{ left: left + width + 6 }}>{task.title}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
