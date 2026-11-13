import { describe, expect, it } from "vitest";
import {
  NO_FILTER, buildPathIndex, buildTree, dateKey, filterTree, fromLocalInput, isOverdue, monthGrid, resolvePath, toLocalInput, tasksByDay,
} from "./taskModel";
import { DEFAULT_REMINDERS, effectiveReminders, formatReminder, splitReminder, daysBetween, ganttRange, ganttRows, calendarTitle, formatTime, monthName, shiftAnchor, weekDays, weekStart, weekdayLabel } from "./taskModel";
import type { Task } from "./tasksApi";

let n = 0;
function task(over: Partial<Task> = {}): Task {
  n += 1;
  return {
    id: `t${n}`, vault_id: "v", parent_id: null, sort_order: n, title: `T${n}`, description: null, notes: null, status: "pending",
    priority: "medium", start_at: null, due_at: null, assignee_type: "user", assignee_agent_id: null, path: null, reminders: null, created_by: "user", updated_by: "user",
    version: 1, created_at: "2026-11-12T00:00:00Z", updated_at: "2026-11-12T00:00:00Z", completed_at: null, purge_at: null, ...over,
  };
}

describe("fechas en la Ciudad de México", () => {
  it("convierte entre UTC y el valor del campo datetime-local", () => {
    expect(toLocalInput("2026-11-20T15:00:00Z")).toBe("2026-11-20T09:00");
    expect(fromLocalInput("2026-11-20T09:00")).toBe("2026-11-20T15:00:00.000Z");
    expect(fromLocalInput("")).toBeNull();
    expect(toLocalInput(null)).toBe("");
  });

  it("el día del calendario es el de la Ciudad de México, no el de UTC", () => {
    expect(dateKey("2026-11-21T03:30:00Z")).toBe("2026-11-20"); // 21:30 del 20 en CDMX
    expect(dateKey("2026-11-20T15:00:00Z")).toBe("2026-11-20");
  });
});

describe("jerarquía y filtros", () => {
  const root = task({ id: "r" });
  const mine = task({ id: "c1", parent_id: "r", assignee_type: "user" });
  const aira = task({ id: "c2", parent_id: "r", assignee_type: "agent", assignee_agent_id: "aira", status: "done" });
  const other = task({ id: "x", assignee_type: "agent", assignee_agent_id: "liza" });
  const all = [root, mine, aira, other];

  it("agrupa subtareas bajo su raíz", () => {
    const tree = buildTree(all);
    expect(tree.map((t) => t.task.id)).toEqual(["r", "x"]);
    expect(tree[0].children.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("una raíz se ve si coincide una subtarea, con solo las subtareas que coinciden", () => {
    const tree = filterTree(buildTree(all), { ...NO_FILTER, assignee: "aira" });
    expect(tree.map((t) => [t.task.id, t.children.map((c) => c.id)])).toEqual([["r", ["c2"]]]);
  });

  it("si coincide la raíz se ven todas sus subtareas; filtra por estado", () => {
    expect(filterTree(buildTree(all), { ...NO_FILTER, assignee: "user" })[0].children).toHaveLength(2);
    const done = filterTree(buildTree(all), { ...NO_FILTER, statuses: ["done"] });
    expect(done.map((t) => t.task.id)).toEqual(["r"]);
  });

  it("vencidas: solo las abiertas con fecha pasada", () => {
    const now = new Date("2026-11-12T12:00:00Z");
    const late = task({ due_at: "2026-11-10T12:00:00Z" });
    const closed = task({ due_at: "2026-11-10T12:00:00Z", status: "done" });
    expect(isOverdue(late, now)).toBe(true);
    expect(isOverdue(closed, now)).toBe(false);
    expect(filterTree(buildTree([late, closed]), { ...NO_FILTER, due: "overdue" }, now).map((t) => t.task.id)).toEqual([late.id]);
  });
});

describe("calendario", () => {
  it("el mes se completa con semanas de lunes a domingo", () => {
    const weeks = monthGrid(2026, 11);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0][0].key).toBe("2026-10-26"); // 1 nov 2026 es domingo
    expect(weeks.flat().filter((c) => c.inMonth)).toHaveLength(30);
  });

  it("ubica cada tarea en su día", () => {
    const a = task({ due_at: "2026-11-21T03:30:00Z" });
    expect(tasksByDay([a, task()]).get("2026-11-20")).toEqual([a]);
  });
});

describe("rutas indicativas", () => {
  const index = buildPathIndex([{ id: "n1", path: "Proyectos/Synapse/Plan.md" }]);
  it("resuelve documentos (con o sin .md) y carpetas; lo demás es null", () => {
    expect(resolvePath("Proyectos/Synapse/Plan.md", index)).toEqual({ kind: "note", id: "n1" });
    expect(resolvePath("Proyectos/Synapse/Plan", index)).toEqual({ kind: "note", id: "n1" });
    expect(resolvePath("Proyectos/Synapse", index)).toEqual({ kind: "folder", path: "Proyectos/Synapse" });
    expect(resolvePath("No/existe.md", index)).toBeNull();
  });
});

describe("subvistas del calendario", () => {
  it("la semana va de lunes a domingo y cruza meses y años", () => {
    expect(weekStart("2026-11-13")).toBe("2026-11-09"); // viernes
    expect(weekStart("2026-11-09")).toBe("2026-11-09"); // lunes
    expect(weekStart("2026-11-15")).toBe("2026-11-09"); // domingo
    expect(weekDays("2026-11-13")).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]);
    expect(weekDays("2027-01-01")[0]).toBe("2026-12-28");
    expect(weekDays("2027-01-01")[6]).toBe("2027-01-03");
  });

  it("el ancla se mueve por la unidad de la subvista, sin saltarse meses cortos ni fines de año", () => {
    expect(shiftAnchor("2026-11-13", "day", 1)).toBe("2026-11-14");
    expect(shiftAnchor("2026-12-31", "day", 1)).toBe("2027-01-01");
    expect(shiftAnchor("2026-11-13", "week", -1)).toBe("2026-11-06");
    expect(shiftAnchor("2026-11-13", "month", 1)).toBe("2026-12-01");
    expect(shiftAnchor("2026-12-20", "month", 1)).toBe("2027-01-01");
    expect(shiftAnchor("2026-01-20", "month", -1)).toBe("2025-12-01");
    expect(shiftAnchor("2026-01-31", "month", 1)).toBe("2026-02-01");
    expect(shiftAnchor("2026-11-13", "year", 1)).toBe("2027-11-01");
    expect(shiftAnchor("2026-11-13", "year", -2)).toBe("2024-11-01");
  });

  it("los encabezados se escriben en español y la semana lo resume en un rango", () => {
    expect(calendarTitle("2026-11-13", "year")).toBe("2026");
    expect(calendarTitle("2026-11-13", "month")).toBe("noviembre 2026");
    expect(calendarTitle("2026-11-13", "day")).toBe("viernes 13 de noviembre de 2026");
    expect(calendarTitle("2026-11-13", "week")).toBe("9 – 15 nov 2026");
    expect(calendarTitle("2026-11-30", "week")).toBe("30 nov – 6 dic 2026");
    expect(calendarTitle("2027-01-01", "week")).toBe("28 dic – 3 ene 2027");
    expect(monthName(1)).toBe("enero");
    expect(monthName(12)).toBe("diciembre");
    expect(weekdayLabel("2026-11-09")).toBe("Lun 9");
    expect(weekdayLabel("2026-11-15")).toBe("Dom 15");
  });

  it("la hora de un vencimiento sale en la Ciudad de México", () => {
    expect(formatTime("2026-11-13T02:00:00Z")).toBe("20:00"); // UTC-6 en noviembre
    expect(formatTime("2026-11-13T18:30:00Z")).toBe("12:30");
  });
});

describe("recordatorios", () => {
  it("se expresan en la mayor unidad exacta y se leen en español", () => {
    expect(splitReminder(1)).toEqual({ value: 1, unit: "minutes" });
    expect(splitReminder(90)).toEqual({ value: 90, unit: "minutes" });
    expect(splitReminder(120)).toEqual({ value: 2, unit: "hours" });
    expect(splitReminder(1440)).toEqual({ value: 1, unit: "days" });
    expect(splitReminder(4320)).toEqual({ value: 3, unit: "days" });
    expect(splitReminder(10080)).toEqual({ value: 1, unit: "weeks" });
    expect(splitReminder(40320)).toEqual({ value: 4, unit: "weeks" });
    expect([1, 30, 60, 120, 1440, 2880, 10080, 20160].map(formatReminder)).toEqual([
      "1 minuto antes", "30 minutos antes", "1 hora antes", "2 horas antes", "1 día antes", "2 días antes", "1 semana antes", "2 semanas antes"]);
  });

  it("sin lista propia rigen los de siempre; una lista propia se ordena del más lejano al más cercano; vacía = ninguno", () => {
    expect(DEFAULT_REMINDERS).toEqual([1440, 60]);
    expect(effectiveReminders({ reminders: null })).toEqual([1440, 60]);
    expect(effectiveReminders({ reminders: [30, 10080, 60] })).toEqual([10080, 60, 30]);
    expect(effectiveReminders({ reminders: [] })).toEqual([]);
  });
});

describe("línea de tiempo", () => {
  it("daysBetween cuenta días de calendario, también hacia atrás", () => {
    expect(daysBetween("2026-11-13", "2026-11-20")).toBe(7);
    expect(daysBetween("2026-11-13", "2026-11-13")).toBe(0);
    expect(daysBetween("2026-11-13", "2026-11-10")).toBe(-3);
    expect(daysBetween("2026-10-30", "2026-11-02")).toBe(3);
  });

  it("las filas van raíz y sus subtareas; la barra es de la creación al vencimiento (en hora de México) y una raíz sin fecha toma la mayor de sus subtareas", () => {
    const root = task({ id: "r", created_at: "2026-11-12T20:00:00Z", due_at: null });
    const kid = task({ id: "k", parent_id: "r", created_at: "2026-11-12T20:00:00Z", due_at: "2026-11-18T03:00:00Z", status: "done" }); // 17 nov 21:00 en México
    const other = task({ id: "o", created_at: "2026-11-13T12:00:00Z", due_at: null });
    const rows = ganttRows([{ task: root, children: [kid] }, { task: other, children: [] }]);
    expect(rows.map((r) => [r.task.id, r.depth])).toEqual([["r", 0], ["k", 1], ["o", 0]]);
    expect(rows[0]).toMatchObject({ start: "2026-11-12", end: "2026-11-17", progress: { done: 1, total: 1 } });
    expect(rows[1]).toMatchObject({ start: "2026-11-12", end: "2026-11-17", progress: null });
    expect(rows[2]).toMatchObject({ start: "2026-11-13", end: null });
  });

  it("la barra empieza en la fecha de inicio de la tarea; una raíz sin inicio toma el primero de sus subtareas", () => {
    const root = task({ id: "r", created_at: "2026-11-01T12:00:00Z", due_at: "2026-11-20T18:00:00Z" });
    const early = task({ id: "a", parent_id: "r", created_at: "2026-11-01T12:00:00Z", start_at: "2026-11-15T18:00:00Z", due_at: "2026-11-17T18:00:00Z" });
    const late = task({ id: "b", parent_id: "r", created_at: "2026-11-01T12:00:00Z", start_at: "2026-11-18T18:00:00Z", due_at: "2026-11-20T18:00:00Z" });
    const own = task({ id: "o", created_at: "2026-11-01T12:00:00Z", start_at: "2026-11-05T18:00:00Z", due_at: "2026-11-08T18:00:00Z" });
    const rows = ganttRows([{ task: root, children: [late, early] }, { task: own, children: [] }]);
    expect(rows.map((r) => [r.task.id, r.start, r.end])).toEqual([
      ["r", "2026-11-15", "2026-11-20"], ["b", "2026-11-18", "2026-11-20"], ["a", "2026-11-15", "2026-11-17"], ["o", "2026-11-05", "2026-11-08"],
    ]);
  });

  it("si el vencimiento es anterior a la creación, la barra empieza en el vencimiento", () => {
    const [row] = ganttRows([{ task: task({ created_at: "2026-11-13T12:00:00Z", due_at: "2026-11-10T12:00:00Z" }), children: [] }]);
    expect(row).toMatchObject({ start: "2026-11-10", end: "2026-11-10" });
  });

  it("el rango cubre hoy, lo más antiguo y lo más lejano, con un mínimo de cinco semanas", () => {
    expect(ganttRange([], "2026-11-13")).toEqual({ from: "2026-11-10", days: 34 });
    const rows = ganttRows([{ task: task({ created_at: "2026-10-01T12:00:00Z", due_at: "2026-12-25T12:00:00Z" }), children: [] }]);
    const { from, days } = ganttRange(rows, "2026-11-13");
    expect(from).toBe("2026-09-29");
    expect(daysBetween(from, "2026-12-28")).toBe(days - 1);
  });
});
