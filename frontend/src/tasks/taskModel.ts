/**
 * Reglas puras de la interfaz de tareas (H-053): jerarquía, filtros, fechas en America/Mexico_City y calendario.
 * Las fechas viajan en UTC; aquí se muestran y se editan en hora de la Ciudad de México.
 */
import type { Task, TaskStatus } from "./tasksApi";

export const TZ = "America/Mexico_City";

export const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: "Pendiente",
  in_progress: "En progreso",
  done: "Hecha",
  cancelled: "Cancelada",
};
export const STATUSES: TaskStatus[] = ["pending", "in_progress", "done", "cancelled"];
export const PRIORITY_LABEL = { low: "Baja", medium: "Media", high: "Alta" } as const;

// --- Recordatorios de vencimiento ---

/** Los que rigen cuando la tarea no tiene lista propia (el servidor usa los mismos): 1 día y 1 hora antes. */
export const DEFAULT_REMINDERS: readonly number[] = [1440, 60];
export const MAX_REMINDERS = 5;
export const MAX_REMINDER_MINUTES = 40320; // cuatro semanas

export type ReminderUnit = "minutes" | "hours" | "days" | "weeks";
export const REMINDER_UNIT_MINUTES: Record<ReminderUnit, number> = { minutes: 1, hours: 60, days: 1440, weeks: 10080 };
export const REMINDER_UNIT_LABEL: Record<ReminderUnit, [string, string]> = {
  minutes: ["minuto", "minutos"], hours: ["hora", "horas"], days: ["día", "días"], weeks: ["semana", "semanas"],
};

/** Los recordatorios que de verdad aplican a una tarea (sin lista propia, los de siempre), del más lejano al más cercano. */
export function effectiveReminders(task: Pick<{ reminders: number[] | null }, "reminders">): number[] {
  return [...(task.reminders ?? DEFAULT_REMINDERS)].sort((a, b) => b - a);
}

/** Un total de minutos en la mayor unidad que lo expresa exacto: 90 → 1,5 h no existe, así que queda en 90 minutos; 120 → 2 horas. */
export function splitReminder(minutes: number): { value: number; unit: ReminderUnit } {
  for (const unit of ["weeks", "days", "hours"] as const) {
    if (minutes % REMINDER_UNIT_MINUTES[unit] === 0) return { value: minutes / REMINDER_UNIT_MINUTES[unit], unit };
  }
  return { value: minutes, unit: "minutes" };
}

/** «30 minutos antes», «1 hora antes», «2 días antes». */
export function formatReminder(minutes: number): string {
  const { value, unit } = splitReminder(minutes);
  const [one, many] = REMINDER_UNIT_LABEL[unit];
  return `${value} ${value === 1 ? one : many} antes`;
}

export const isClosed = (task: Pick<Task, "status">) => task.status === "done" || task.status === "cancelled";

// --- Jerarquía ---

export interface TaskNode {
  task: Task;
  children: Task[];
}

/** Raíces con sus subtareas, en el orden de `sort_order` que manda el servidor. */
export function buildTree(tasks: Task[]): TaskNode[] {
  const byParent = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.parent_id) byParent.set(t.parent_id, [...(byParent.get(t.parent_id) ?? []), t]);
  }
  return tasks.filter((t) => !t.parent_id).map((task) => ({ task, children: byParent.get(task.id) ?? [] }));
}

// --- Filtros ---

export type DueFilter = "all" | "overdue" | "today" | "week" | "none";
export interface TaskFilter {
  assignee: "all" | "user" | string; // `all`, `user` o el id de un agente
  statuses: TaskStatus[]; // vacío = todos
  due: DueFilter;
}
export const NO_FILTER: TaskFilter = { assignee: "all", statuses: [], due: "all" };

export function matchesFilter(task: Task, filter: TaskFilter, now: Date = new Date()): boolean {
  if (filter.assignee === "user" && task.assignee_type !== "user") return false;
  if (filter.assignee !== "all" && filter.assignee !== "user" && task.assignee_agent_id !== filter.assignee) return false;
  if (filter.statuses.length > 0 && !filter.statuses.includes(task.status)) return false;
  if (filter.due === "none") return task.due_at === null;
  if (filter.due === "all") return true;
  if (task.due_at === null) return false;
  const due = new Date(task.due_at).getTime();
  if (filter.due === "overdue") return due < now.getTime() && !isClosed(task);
  const today = dateKey(now.toISOString());
  const key = dateKey(task.due_at);
  if (filter.due === "today") return key === today;
  return key >= today && key <= addDays(today, 6);
}

/** Árbol filtrado: una raíz se ve si ella o alguna subtarea coincide; si coincide ella, con todas sus subtareas. */
export function filterTree(nodes: TaskNode[], filter: TaskFilter, now: Date = new Date()): TaskNode[] {
  const out: TaskNode[] = [];
  for (const node of nodes) {
    const self = matchesFilter(node.task, filter, now);
    const kids = self ? node.children : node.children.filter((c) => matchesFilter(c, filter, now));
    if (self || kids.length > 0) out.push({ task: node.task, children: kids });
  }
  return out;
}

export function isOverdue(task: Task, now: Date = new Date()): boolean {
  return task.due_at !== null && !isClosed(task) && new Date(task.due_at).getTime() < now.getTime();
}

// --- Fechas en hora de la Ciudad de México ---

function parts(date: Date, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hourCycle: "h23", ...options }).formatToParts(date)) out[p.type] = p.value;
  return out;
}

/** `YYYY-MM-DD` del instante en hora de la Ciudad de México (el día del calendario). */
export function dateKey(iso: string): string {
  const p = parts(new Date(iso), { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${p.year}-${p.month}-${p.day}`;
}

export function addDays(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** UTC → valor de `<input type="datetime-local">` en hora de la Ciudad de México. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const p = parts(new Date(iso), { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Valor de `datetime-local` (hora de la Ciudad de México) → ISO UTC; vacío → `null`. */
export function fromLocalInput(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let utc = wall;
  for (let i = 0; i < 2; i++) {
    const p = parts(new Date(utc), { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    utc -= shown - wall;
  }
  return new Date(utc).toISOString();
}

export function formatDue(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: TZ, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

export function formatDay(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: TZ, day: "numeric", month: "short" }).format(new Date(iso));
}

// --- Calendario mensual ---

export interface CalendarCell {
  key: string; // YYYY-MM-DD
  day: number;
  inMonth: boolean;
}

/** Semanas (lunes a domingo) que cubren el mes `month` (1-12) de `year`. */
export function monthGrid(year: number, month: number): CalendarCell[][] {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const weekday = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7; // lunes = 0
  let key = addDays(first, -weekday);
  const weeks: CalendarCell[][] = [];
  do {
    const week: CalendarCell[] = [];
    for (let i = 0; i < 7; i++, key = addDays(key, 1)) {
      week.push({ key, day: +key.slice(8), inMonth: +key.slice(5, 7) === month });
    }
    weeks.push(week);
  } while (+key.slice(5, 7) === month);
  return weeks;
}

// --- Subvistas del calendario: año, mes, semana y día ---

export type CalendarMode = "year" | "month" | "week" | "day";

const utcNoon = (key: string) => new Date(`${key}T12:00:00Z`);

/** Lunes de la semana (lunes a domingo) que contiene `key`. */
export function weekStart(key: string): string {
  return addDays(key, -((utcNoon(key).getUTCDay() + 6) % 7));
}

/** Los siete días (lunes a domingo) de la semana de `key`. */
export function weekDays(key: string): string[] {
  const start = weekStart(key);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Mueve el ancla del calendario una unidad de la subvista: ±1 año, mes (al día 1), semana o día. */
export function shiftAnchor(key: string, mode: CalendarMode, delta: number): string {
  if (mode === "day") return addDays(key, delta);
  if (mode === "week") return addDays(key, delta * 7);
  const year = +key.slice(0, 4);
  const month = +key.slice(5, 7);
  if (mode === "year") return `${year + delta}-${String(month).padStart(2, "0")}-01`;
  const index = year * 12 + (month - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-01`;
}

const calendarFormat = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", ...options });

/** Nombre de un mes (1-12) en español, en minúsculas. */
export function monthName(month: number): string {
  return calendarFormat({ month: "long" }).format(new Date(Date.UTC(2026, month - 1, 15, 12)));
}

/** Encabezado de la subvista: «2026», «noviembre 2026», «9 – 15 nov 2026» o «viernes 13 de noviembre de 2026». */
export function calendarTitle(key: string, mode: CalendarMode): string {
  const year = key.slice(0, 4);
  if (mode === "year") return year;
  if (mode === "month") return `${monthName(+key.slice(5, 7))} ${year}`;
  if (mode === "day") return calendarFormat({ weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(utcNoon(key)).replace(",", "");
  const days = weekDays(key);
  const first = utcNoon(days[0]);
  const last = utcNoon(days[6]);
  const short = calendarFormat({ month: "short" });
  const sameMonth = days[0].slice(0, 7) === days[6].slice(0, 7);
  return `${first.getUTCDate()}${sameMonth ? "" : ` ${short.format(first).replace(".", "")}`} – ${last.getUTCDate()} ${short.format(last).replace(".", "")} ${days[6].slice(0, 4)}`;
}

/** Etiqueta corta de un día para la semana: «Lun 9». */
export function weekdayLabel(key: string): string {
  const name = calendarFormat({ weekday: "short" }).format(utcNoon(key)).replace(".", "");
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${+key.slice(8)}`;
}

/** Hora (HH:MM, Ciudad de México) de un vencimiento. */
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

export function tasksByDay(tasks: Task[]): Map<string, Task[]> {
  const out = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.due_at) continue;
    const key = dateKey(t.due_at);
    out.set(key, [...(out.get(key) ?? []), t]);
  }
  return out;
}

// --- Rutas indicativas ---

export interface PathIndex {
  notes: Map<string, string>; // ruta (con y sin .md) → id de la nota
  folders: Set<string>;
}

/** Documentos y carpetas de la bóveda, para sugerir y resolver la ruta de una tarea (nunca la exige). */
export function buildPathIndex(notePaths: { id: string; path: string }[]): PathIndex {
  const notes = new Map<string, string>();
  const folders = new Set<string>();
  for (const { id, path } of notePaths) {
    notes.set(path, id);
    notes.set(path.replace(/\.md$/i, ""), id);
    const levels = path.split("/");
    for (let i = 1; i < levels.length; i++) folders.add(levels.slice(0, i).join("/"));
  }
  return { notes, folders };
}

export type PathTarget = { kind: "note"; id: string } | { kind: "folder"; path: string } | null;

export function resolvePath(path: string, index: PathIndex): PathTarget {
  const noteId = index.notes.get(path);
  if (noteId) return { kind: "note", id: noteId };
  return index.folders.has(path) ? { kind: "folder", path } : null;
}
