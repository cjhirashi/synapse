import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import AgentBadge from "../agents/AgentBadge";
import UserBadge from "../agents/UserBadge";
import { VaultTag, type ViewActions } from "./TaskViews";
import {
  GANTT_PX, STATUS_LABEL, addDays, daysBetween, formatDay, formatDue, ganttPatch, ganttPreview, ganttRange, ganttRows, isClosed, isOverdue, monthName,
  type GanttDragMode, type GanttRow, type GanttScale, type TaskNode,
} from "./taskModel";

const SCALES: Array<[GanttScale, string]> = [["day", "Día"], ["week", "Semana"], ["month", "Mes"]];
const DOW = ["D", "L", "M", "M", "J", "V", "S"];
/** Ancho mínimo de una barra para que su título quepa dentro; si es menor, el título va a su derecha. */
const TITLE_INSIDE_PX = 120;
/** Ancho mínimo para mostrar la foto del responsable dentro de la barra. */
const WHO_INSIDE_PX = 36;
/** Ancho mínimo para ofrecer los bordes de redimensionar; por debajo, la barra solo se mueve. */
const HANDLES_PX = 30;
/** Píxeles que debe moverse el puntero para que sea un arrastre y no un clic. */
const DRAG_THRESHOLD_PX = 4;
const MODE_LABEL: Record<GanttDragMode, string> = { move: "mueve", start: "cambia el inicio de", end: "cambia el vencimiento de" };

/** Línea de tiempo: una fila por tarea y subtarea con inicio y vencimiento, con su barra de uno a otro, coloreada por estado. */
export default function TaskGantt({ nodes, actions, todayKey }: { nodes: TaskNode[]; actions: ViewActions; todayKey: string }) {
  const [scale, setScale] = useState<GanttScale>("day");
  const scroller = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; mode: GanttDragMode; delta: number } | null>(null);
  const dragged = useRef(false); // tras soltar una barra el navegador manda un clic: no debe abrir el detalle
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

  /** Arrastre con el puntero: el cuerpo mueve la barra; el borde izquierdo cambia el inicio y el derecho, el vencimiento. */
  function begin(event: PointerEvent, row: GanttRow, mode: GanttDragMode) {
    if (event.button !== 0) return;
    event.stopPropagation();
    const originX = event.clientX;
    let delta = 0;
    let moved = false;
    const onMove = (e: globalThis.PointerEvent) => {
      if (Math.abs(e.clientX - originX) > DRAG_THRESHOLD_PX) moved = true;
      if (!moved) return;
      delta = Math.round((e.clientX - originX) / px);
      setDrag({ id: row.task.id, mode, delta });
    };
    const onEnd = (e: globalThis.PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      setDrag(null);
      if (!moved) return;
      dragged.current = true;
      window.setTimeout(() => { dragged.current = false; }, 0);
      const patch = e.type === "pointerup" ? ganttPatch(row, mode, delta) : null;
      if (patch) actions.onDates(row.task, patch);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  }

  /** Teclado: Alt + flechas mueve la barra un día; Alt + Mayús + flechas cambia el vencimiento. */
  function onKey(event: KeyboardEvent, row: GanttRow) {
    if (!event.altKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    const patch = ganttPatch(row, event.shiftKey ? "end" : "move", event.key === "ArrowRight" ? 1 : -1);
    if (patch) actions.onDates(row.task, patch);
  }

  const total = nodes.reduce((count, node) => count + 1 + node.children.length, 0);
  const hidden = total - rows.length;
  if (rows.length === 0) {
    return <p className="tasks-empty">{total === 0 ? "No hay tareas con estos filtros." : "Ninguna tarea tiene fecha de inicio y de vencimiento: la línea de tiempo solo dibuja las que tienen ambas."}</p>;
  }

  return (
    <div className="tasks-gantt" data-scale={scale} style={{ "--g-day": `${px}px`, "--g-days": days } as CSSProperties}>
      <div className="tasks-gantt-bar">
        <div className="tasks-cal-modes" role="group" aria-label="Escala de la línea de tiempo">
          {SCALES.map(([id, label]) => (
            <button key={id} type="button" className="tasks-cal-mode" aria-pressed={scale === id} onClick={() => setScale(id)}>{label}</button>
          ))}
        </div>
        <button type="button" className="tasks-cal-step tasks-cal-today" onClick={centerToday}>Hoy</button>
        <p className="tasks-cal-note">
          Solo se dibujan las tareas con fecha de inicio y de vencimiento{hidden > 0 && <> ({hidden} {hidden === 1 ? "no tiene" : "no tienen"} ambas)</>}. Arrastra una barra para moverla o sus bordes para cambiar el inicio o el vencimiento.
        </p>
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
            {rows.map((row) => {
              const { task, depth, progress } = row;
              const live = drag?.id === task.id ? drag : null;
              const { start, end } = live ? ganttPreview(row, live.mode, live.delta) : row;
              const left = daysBetween(from, start) * px;
              const width = (daysBetween(start, end) + 1) * px;
              const outside = width < TITLE_INSIDE_PX;
              const range = live
                ? `${formatDay(`${start}T12:00:00Z`)} → ${formatDay(`${end}T12:00:00Z`)}`
                : `${formatDay(task.start_at as string)} → ${formatDue(task.due_at as string)}`;
              return (
                <div key={task.id} role="listitem" id={`task-${task.id}`} className={`tasks-gantt-row${depth ? " tasks-gantt-row--sub" : ""}${isClosed(task) ? " tasks-row--closed" : ""}${actions.focusId === task.id ? " tasks-row--focus" : ""}`} data-status={task.status}>
                  <div className="tasks-gantt-label">
                    <span className="tasks-gantt-dot" aria-hidden="true" />
                    {row.parentTitle && <span className="tasks-gantt-parent" title={`Subtarea de ${row.parentTitle}`} aria-hidden="true">↳</span>}
                    <button type="button" className="tasks-title-btn" title="Ver el detalle" aria-label={`Ver detalle de ${task.title}`} onClick={() => actions.onOpen(task)}>{task.title}</button>
                    <VaultTag task={task} actions={actions} />
                    {progress && <span className="tasks-progress">{progress.done}/{progress.total}</span>}
                  </div>
                  <div className="tasks-gantt-track">
                    <button
                      type="button" className={`tasks-gantt-item${progress ? " tasks-gantt-item--summary" : ""}${isOverdue(task) ? " tasks-gantt-item--late" : ""} tasks-gantt-item--drag${live ? " tasks-gantt-item--dragging" : ""}`}
                      data-drag={live ? live.mode : undefined}
                      style={{ left, width }} title={`${task.title} · ${STATUS_LABEL[task.status]} · ${range} · arrastra para cambiar las fechas`}
                      aria-label={`${task.title}, ${STATUS_LABEL[task.status]}, ${range}`}
                      aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Alt+Shift+ArrowRight"
                      onClick={() => { if (!dragged.current) actions.onOpen(task); }}
                      onPointerDown={(e) => begin(e, row, "move")} onKeyDown={(e) => onKey(e, row)}
                    >
                      {width >= HANDLES_PX && (
                        <span className="tasks-gantt-handle tasks-gantt-handle--start" aria-hidden="true" title={`Arrastra para cambiar el inicio de ${task.title}`}
                          onPointerDown={(e) => begin(e, row, "start")} onClick={(e) => e.stopPropagation()} />
                      )}
                      {progress && <i className="tasks-gantt-fill" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} aria-hidden="true" />}
                      {width >= WHO_INSIDE_PX && (
                        <span className="tasks-gantt-who" aria-hidden="true">
                          {task.assignee_type === "agent" && task.assignee_agent_id ? <AgentBadge agentId={task.assignee_agent_id} size={16} showName={false} /> : <UserBadge size={16} label={null} />}
                        </span>
                      )}
                      {!outside && !live && <span className="tasks-gantt-text">{task.title}</span>}
                      {!outside && live && <span className="tasks-gantt-text">{range}</span>}
                      {width >= HANDLES_PX && (
                        <span className="tasks-gantt-handle tasks-gantt-handle--end" aria-hidden="true" title={`Arrastra para cambiar el vencimiento de ${task.title}`}
                          onPointerDown={(e) => begin(e, row, "end")} onClick={(e) => e.stopPropagation()} />
                      )}
                    </button>
                    {outside && <span className={`tasks-gantt-after${live ? " is-live" : ""}`} style={{ left: left + width + 6 }}>{live ? range : task.title}</span>}
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
