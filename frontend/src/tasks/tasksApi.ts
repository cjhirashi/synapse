/**
 * Cliente de las tareas de bóveda (H-053): `/vaults/{id}/tasks`. Cada tarea es una raíz o una subtarea
 * (`parent_id`); las fechas llegan en UTC con `Z`. `version` es el ETag que se manda en `If-Match`.
 */
import { request } from "../api/auth";

export type TaskStatus = "pending" | "in_progress" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high";
export type AssigneeType = "user" | "agent";

export interface Task {
  id: string;
  vault_id: string;
  parent_id: string | null;
  sort_order: number;
  title: string;
  description: string | null;
  notes: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  /** Inicio opcional (nunca posterior al vencimiento); la línea de tiempo lo usa para empezar la barra. */
  start_at: string | null;
  due_at: string | null;
  assignee_type: AssigneeType;
  assignee_agent_id: string | null;
  path: string | null;
  /** Minutos antes del vencimiento a los que avisar; `null` = los de siempre (1 día y 1 hora), `[]` = ninguno. */
  reminders: number[] | null;
  created_by: string;
  updated_by: string;
  version: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  /** Cuándo se elimina una raíz cerrada (retención); las subtareas salen con su raíz. */
  purge_at: string | null;
}

/** Campos editables; `null` vacía descripción, notas, inicio, vencimiento y ruta. */
export interface TaskInput {
  title?: string;
  description?: string | null;
  notes?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  start_at?: string | null;
  due_at?: string | null;
  assignee_type?: AssigneeType;
  assignee_agent_id?: string | null;
  path?: string | null;
  /** Minutos antes del vencimiento (hasta 5, de 1 a 40 320); `null` = los de siempre, `[]` = ninguno. */
  reminders?: number[] | null;
}

const base = (vaultId: string) => `/vaults/${encodeURIComponent(vaultId)}/tasks`;

export async function listTasks(vaultId: string): Promise<Task[]> {
  const res = await request(base(vaultId));
  return ((await res.json()) as { items: Task[] }).items;
}

/** Las tareas de todas las bóvedas de la persona (la ventana global; cada una trae su `vault_id`). */
export async function listAllTasks(): Promise<Task[]> {
  return ((await (await request("/tasks")).json()) as { items: Task[] }).items;
}

/** Tareas abiertas asignadas a la persona (para el contador de la pestaña). */
export async function listMyOpenTasks(vaultId: string): Promise<Task[]> {
  const query = new URLSearchParams({ assignee: "user" });
  query.append("status", "pending");
  query.append("status", "in_progress");
  return ((await (await request(`${base(vaultId)}?${query}`)).json()) as { items: Task[] }).items;
}

export async function createTask(vaultId: string, input: TaskInput & { title: string }, parentId?: string): Promise<Task> {
  const url = parentId ? `${base(vaultId)}/${encodeURIComponent(parentId)}/subtasks` : base(vaultId);
  return (await request(url, { method: "POST", body: JSON.stringify(input) })).json();
}

export async function updateTask(vaultId: string, task: Task, input: TaskInput): Promise<Task> {
  const res = await request(`${base(vaultId)}/${encodeURIComponent(task.id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "If-Match": `"${task.version}"` },
    body: JSON.stringify(input),
  });
  return res.json();
}

export async function deleteTask(vaultId: string, taskId: string): Promise<void> {
  await request(`${base(vaultId)}/${encodeURIComponent(taskId)}`, { method: "DELETE" });
}
