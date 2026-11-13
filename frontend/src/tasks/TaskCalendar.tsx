import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Row, type ViewActions } from "./TaskViews";
import {
  calendarTitle, formatDue, formatTime, isClosed, isOverdue, monthGrid, monthName, shiftAnchor, tasksByDay, weekDays, weekdayLabel,
  type CalendarMode,
} from "./taskModel";
import type { Task } from "./tasksApi";

const MODES: Array<[CalendarMode, string]> = [["year", "Año"], ["month", "Mes"], ["week", "Semana"], ["day", "Día"]];
const UNIT: Record<CalendarMode, { prev: string; next: string }> = {
  year: { prev: "Año anterior", next: "Año siguiente" },
  month: { prev: "Mes anterior", next: "Mes siguiente" },
  week: { prev: "Semana anterior", next: "Semana siguiente" },
  day: { prev: "Día anterior", next: "Día siguiente" },
};
const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const byTime = (a: Task, b: Task) => (a.due_at ?? "").localeCompare(b.due_at ?? "");

/** Botón de una tarea dentro de una celda: abre su edición. */
function CalendarTask({ task, actions, time = false }: { task: Task; actions: ViewActions; time?: boolean }) {
  return (
    <button
      type="button"
      className={`tasks-cal-task${isClosed(task) ? " tasks-row--closed" : ""}${isOverdue(task) ? " tasks-chip--overdue" : ""}`}
      title={`${task.title} · ${formatDue(task.due_at as string)}`}
      onClick={() => actions.onOpen(task)}
    >
      {time && <span className="tasks-cal-time">{formatTime(task.due_at as string)}</span>}
      {task.title}
    </button>
  );
}

/** Año: doce meses en miniatura; un día con tareas lleva un punto (rojo si alguna venció) y abre su día. */
function YearView({ anchor, byDay, todayKey, onOpenDay, onOpenMonth }: { anchor: string; byDay: Map<string, Task[]>; todayKey: string; onOpenDay: (key: string) => void; onOpenMonth: (key: string) => void }) {
  const year = +anchor.slice(0, 4);
  return (
    <div className="tasks-year">
      {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
        <section key={month} className="tasks-mini" aria-label={`${monthName(month)} ${year}`}>
          <h4>
            <button type="button" onClick={() => onOpenMonth(`${year}-${String(month).padStart(2, "0")}-01`)} aria-label={`Ver ${monthName(month)} ${year}`}>{monthName(month)}</button>
          </h4>
          <div className="tasks-mini-grid">
            {DOW.map((d) => <span key={d} className="tasks-mini-dow" aria-hidden="true">{d.charAt(0)}</span>)}
            {monthGrid(year, month).flat().map((cell) => {
              if (!cell.inMonth) return <span key={cell.key} className="tasks-mini-day tasks-mini-day--out" aria-hidden="true" />;
              const day = byDay.get(cell.key) ?? [];
              const late = day.some((t) => isOverdue(t));
              return (
                <button
                  key={cell.key} type="button" data-date={cell.key} data-count={day.length}
                  className={`tasks-mini-day${cell.key === todayKey ? " tasks-mini-day--today" : ""}${day.length > 0 ? " tasks-mini-day--has" : ""}${late ? " tasks-mini-day--late" : ""}`}
                  aria-label={`${cell.day} de ${monthName(month)}: ${day.length === 0 ? "sin tareas" : plural(day.length, "tarea", "tareas")}`}
                  onClick={() => onOpenDay(cell.key)}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Mes: la cuadrícula de siempre; el número de cada día abre ese día. */
function MonthView({ anchor, byDay, todayKey, actions, onOpenDay }: { anchor: string; byDay: Map<string, Task[]>; todayKey: string; actions: ViewActions; onOpenDay: (key: string) => void }) {
  const weeks = monthGrid(+anchor.slice(0, 4), +anchor.slice(5, 7));
  return (
    <div className="tasks-cal-grid" role="grid">
      {DOW.map((d) => <div key={d} className="tasks-cal-dow" role="columnheader">{d}</div>)}
      {weeks.flat().map((cell) => (
        <div key={cell.key} role="gridcell" className={`tasks-cal-cell${cell.inMonth ? "" : " tasks-cal-cell--out"}${cell.key === todayKey ? " tasks-cal-cell--today" : ""}`} data-date={cell.key}>
          <button type="button" className="tasks-cal-day" aria-label={`Ver el día ${cell.day} de ${monthName(+cell.key.slice(5, 7))}`} onClick={() => onOpenDay(cell.key)}>{cell.day}</button>
          {(byDay.get(cell.key) ?? []).map((task) => <CalendarTask key={task.id} task={task} actions={actions} />)}
        </div>
      ))}
    </div>
  );
}

/** Semana: siete columnas (una por día, apiladas en móvil) con la hora de cada vencimiento. */
function WeekView({ anchor, byDay, todayKey, actions, onOpenDay }: { anchor: string; byDay: Map<string, Task[]>; todayKey: string; actions: ViewActions; onOpenDay: (key: string) => void }) {
  return (
    <div className="tasks-week">
      {weekDays(anchor).map((key) => {
        const day = [...(byDay.get(key) ?? [])].sort(byTime);
        return (
          <section key={key} className={`tasks-week-day${key === todayKey ? " tasks-week-day--today" : ""}`} data-date={key} aria-label={weekdayLabel(key)}>
            <h4>
              <button type="button" onClick={() => onOpenDay(key)} aria-label={`Ver el día ${weekdayLabel(key)}`}>{weekdayLabel(key)}</button>
              {day.length > 0 && <span className="tasks-chip">{day.length}</span>}
            </h4>
            {day.length === 0 ? <p className="tasks-week-empty">Sin tareas</p> : day.map((task) => <CalendarTask key={task.id} task={task} actions={actions} time />)}
          </section>
        );
      })}
    </div>
  );
}

/** Día: las tareas que vencen ese día, en orden de hora, con todo lo de la lista (estado, asignación, edición). */
function DayView({ anchor, byDay, actions }: { anchor: string; byDay: Map<string, Task[]>; actions: ViewActions }) {
  const day = [...(byDay.get(anchor) ?? [])].sort(byTime);
  if (day.length === 0) return <p className="tasks-empty">No hay tareas que venzan este día.</p>;
  return (
    <div className="tasks-day">
      {day.map((task) => (
        <div key={task.id} className="tasks-day-item">
          <span className="tasks-cal-time">{formatTime(task.due_at as string)}</span>
          <div className="tasks-table">
            <ul className="tasks-list">
              <Row task={task} node={{ task, children: [] }} actions={actions} sub={task.parent_id !== null} />
            </ul>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Calendario de tareas con cuatro subvistas (año, mes, semana y día) sobre un mismo ancla de fecha: las flechas mueven una
 * unidad de la subvista elegida, «Hoy» vuelve a hoy y pulsar un día o un mes baja a su detalle. Solo cuentan las tareas con
 * vencimiento; las fechas son de la Ciudad de México.
 */
export function TaskCalendar({ tasks, actions, todayKey }: { tasks: Task[]; actions: ViewActions; todayKey: string }) {
  const [mode, setMode] = useState<CalendarMode>("month");
  const [anchor, setAnchor] = useState(todayKey);
  const byDay = useMemo(() => tasksByDay(tasks), [tasks]);
  const undated = tasks.filter((t) => t.due_at === null).length;

  const openDay = (key: string) => { setAnchor(key); setMode("day"); };
  const openMonth = (key: string) => { setAnchor(key); setMode("month"); };

  return (
    <div className="tasks-calendar">
      <div className="tasks-cal-head">
        <div className="tasks-cal-nav">
          <button type="button" className="tasks-cal-step" onClick={() => setAnchor(shiftAnchor(anchor, mode, -1))} aria-label={UNIT[mode].prev}><ChevronLeft size={16} aria-hidden="true" /></button>
          <button type="button" className="tasks-cal-step" onClick={() => setAnchor(shiftAnchor(anchor, mode, 1))} aria-label={UNIT[mode].next}><ChevronRight size={16} aria-hidden="true" /></button>
        </div>
        <h3 aria-live="polite">{calendarTitle(anchor, mode)}</h3>
        <button type="button" className="tasks-cal-today" onClick={() => setAnchor(todayKey)} disabled={anchor === todayKey && mode !== "year"}>Hoy</button>
        <div className="tasks-cal-modes" role="group" aria-label="Subvista del calendario">
          {MODES.map(([id, label]) => (
            <button key={id} type="button" className="tasks-cal-mode" aria-pressed={mode === id} onClick={() => setMode(id)}>{label}</button>
          ))}
        </div>
      </div>
      <div key={mode} className="tasks-cal-pane">
        {mode === "year" && <YearView anchor={anchor} byDay={byDay} todayKey={todayKey} onOpenDay={openDay} onOpenMonth={openMonth} />}
        {mode === "month" && <MonthView anchor={anchor} byDay={byDay} todayKey={todayKey} actions={actions} onOpenDay={openDay} />}
        {mode === "week" && <WeekView anchor={anchor} byDay={byDay} todayKey={todayKey} actions={actions} onOpenDay={openDay} />}
        {mode === "day" && <DayView anchor={anchor} byDay={byDay} actions={actions} />}
      </div>
      {undated > 0 && <p className="tasks-cal-note">{plural(undated, "tarea sin fecha no aparece", "tareas sin fecha no aparecen")} en el calendario.</p>}
    </div>
  );
}
