import { request } from "../api/auth";

export interface AgentKeyInfo {
  label: string;
  is_admin: boolean;
}

/** Un agente registrado en una bóveda (nota `AG - AGENTES/<id>.md`), con el nombre de su clave. */
export interface AgentRegistration {
  agent_id: string;
  estado: "activo" | "suspendido" | string;
  carpetas: string[];
  note_id: string;
  keys: AgentKeyInfo[];
}

export interface VaultAgentAccess {
  mode: "off" | "shadow" | "enforce" | string;
  agents: AgentRegistration[];
  unregistered_keys: AgentKeyInfo[];
  unregistered_agent_ids: string[];
}

export interface VaultOption {
  id: string;
  name: string;
}

/** Bóvedas del usuario (REST, las primeras 200). */
export async function listVaultOptions(): Promise<VaultOption[]> {
  const page = await (await request("/vaults?limit=200")).json();
  return (page.items as VaultOption[]).map(({ id, name }) => ({ id, name }));
}

export async function getVaultAgentAccess(vaultId: string): Promise<VaultAgentAccess> {
  return (await request(`/vaults/${encodeURIComponent(vaultId)}/agent-access`)).json();
}

export async function putAgentRegistration(
  vaultId: string,
  agentId: string,
  carpetas: string[],
  estado: "activo" | "suspendido",
): Promise<AgentRegistration> {
  const init = { method: "PUT", body: JSON.stringify({ carpetas, estado }) };
  return (await request(`/vaults/${encodeURIComponent(vaultId)}/agent-access/${encodeURIComponent(agentId)}`, init)).json();
}

export async function deleteAgentRegistration(vaultId: string, agentId: string): Promise<void> {
  const init = { method: "DELETE" };
  await request(`/vaults/${encodeURIComponent(vaultId)}/agent-access/${encodeURIComponent(agentId)}`, init);
}

/** Una skill de bóveda (H-041 E4): su propietario (ausente si está archivada), sus invitados y su estado. */
export interface SkillInfo {
  note_id: string;
  path: string;
  titulo: string | null;
  propietario: string | null;
  agentes: string[];
  estado: string | null;
}

export async function listSkills(vaultId: string): Promise<SkillInfo[]> {
  return ((await (await request(`/vaults/${encodeURIComponent(vaultId)}/skills`)).json()) as { skills: SkillInfo[] }).skills;
}

/** Qué hacer con una skill de un gestor que sale: asignarla a uno de sus invitados, eliminarla o archivarla. */
export interface SkillResolution {
  note_id: string;
  accion: "assign" | "delete" | "archive";
  a?: string;
}

export interface LeaveResult {
  asignadas: number;
  eliminadas: number;
  archivadas: number;
  invitaciones_quitadas: number;
}

/** Quita o suspende a un gestor resolviendo antes cada skill de la que es propietario (409 si falta alguna). */
export async function leaveAgent(vaultId: string, agentId: string, modo: "quitar" | "suspender", skills: SkillResolution[]): Promise<LeaveResult> {
  const init = { method: "POST", body: JSON.stringify({ modo, skills }) };
  return (await request(`/vaults/${encodeURIComponent(vaultId)}/agent-access/${encodeURIComponent(agentId)}/leave`, init)).json();
}

/** Asigna una skill (por ejemplo, una archivada) a un gestor activo. */
export async function assignSkill(vaultId: string, noteId: string, propietario: string): Promise<SkillInfo> {
  const init = { method: "POST", body: JSON.stringify({ propietario }) };
  return (await request(`/vaults/${encodeURIComponent(vaultId)}/skills/${encodeURIComponent(noteId)}/assign`, init)).json();
}

/** Nombre de la skill: el de su nota sin carpeta ni extensión. */
export function skillName(skill: Pick<SkillInfo, "path">): string {
  return (skill.path.split("/").pop() ?? skill.path).replace(/\.md$/i, "");
}

/** Carpetas escritas una por línea → lista limpia (sin vacías, sin barras finales). */
export function parseFolders(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim().replace(/\/+$/, ""))
    .filter((line) => line.length > 0);
}
