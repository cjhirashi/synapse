import { describe, expect, it } from "vitest";
import {
  NO_FILTER, buildPathIndex, buildTree, dateKey, filterTree, fromLocalInput, isOverdue, monthGrid, resolvePath, toLocalInput, tasksByDay,
} from "./taskModel";
import type { Task } from "./tasksApi";

let n = 0;
function task(over: Partial<Task> = {}): Task {
  n += 1;
  return {
    id: `t${n}`, vault_id: "v", parent_id: null, sort_order: n, title: `T${n}`, description: null, notes: null, status: "pending",
    priority: "medium", due_at: null, assignee_type: "user", assignee_agent_id: null, path: null, created_by: "user", updated_by: "user",
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
