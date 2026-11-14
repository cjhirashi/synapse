/**
 * Cliente de los proyectos de bóveda (H-058): `/vaults/{id}/projects`. Un proyecto agrupa tareas de su bóveda; su avance
 * (`tasks_total`, `tasks_done`) cuenta las tareas raíz. `version` es el ETag que se manda en `If-Match`.
 */
import { request } from "../api/auth";
import type { AssigneeType } from "./tasksApi";

export type ProjectStatus = "active" | "on_hold" | "completed";
export type ProjectColor = "gray" | "blue" | "green" | "red" | "orange" | "yellow" | "purple" | "pink";

export interface Project {
  id: string;
  vault_id: string;
  sort_order: number;
  title: string;
  description: string | null;
  status: ProjectStatus;
  color: ProjectColor;
  assignee_type: AssigneeType;
  assignee_agent_id: string | null;
  created_by: string;
  updated_by: string;
  version: number;
  created_at: string;
  updated_at: string;
  tasks_total: number;
  tasks_done: number;
}

export interface ProjectInput {
  title?: string;
  description?: string | null;
  status?: ProjectStatus;
  color?: ProjectColor;
  assignee_type?: AssigneeType;
  assignee_agent_id?: string | null;
}

export const PROJECT_STATUSES: ProjectStatus[] = ["active", "on_hold", "completed"];
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = { active: "Activo", on_hold: "En pausa", completed: "Completado" };
export const PROJECT_COLORS: ProjectColor[] = ["gray", "blue", "green", "red", "orange", "yellow", "purple", "pink"];
export const PROJECT_COLOR_LABEL: Record<ProjectColor, string> = {
  gray: "Gris", blue: "Azul", green: "Verde", red: "Rojo", orange: "Naranja", yellow: "Amarillo", purple: "Morado", pink: "Rosa",
};
/** Color CSS de cada color de proyecto (tokens del tema). */
export const PROJECT_COLOR_CSS: Record<ProjectColor, string> = {
  gray: "var(--text-muted)", blue: "var(--info)", green: "var(--success)", red: "var(--danger)",
  orange: "var(--vault-orange)", yellow: "var(--vault-yellow)", purple: "var(--vault-purple)", pink: "var(--vault-pink)",
};

const base = (vaultId: string) => `/vaults/${encodeURIComponent(vaultId)}/projects`;

export async function listProjects(vaultId: string): Promise<Project[]> {
  return ((await (await request(base(vaultId))).json()) as { items: Project[] }).items;
}

/** Los proyectos de todas las bóvedas de la persona (la ventana global). */
export async function listAllProjects(): Promise<Project[]> {
  return ((await (await request("/projects")).json()) as { items: Project[] }).items;
}

export async function createProject(vaultId: string, input: ProjectInput & { title: string }): Promise<Project> {
  return (await request(base(vaultId), { method: "POST", body: JSON.stringify(input) })).json();
}

export async function updateProject(vaultId: string, project: Project, input: ProjectInput): Promise<Project> {
  const res = await request(`${base(vaultId)}/${encodeURIComponent(project.id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "If-Match": `"${project.version}"` },
    body: JSON.stringify(input),
  });
  return res.json();
}

export async function deleteProject(vaultId: string, projectId: string): Promise<void> {
  await request(`${base(vaultId)}/${encodeURIComponent(projectId)}`, { method: "DELETE" });
}
