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

/** Carpetas escritas una por línea → lista limpia (sin vacías, sin barras finales). */
export function parseFolders(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim().replace(/\/+$/, ""))
    .filter((line) => line.length > 0);
}
