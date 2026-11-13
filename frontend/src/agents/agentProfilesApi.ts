/** Perfil de agente (H-053): nombre visible y foto por `agent_id`. Cliente de `/agent-profiles`. */
import { request } from "../api/auth";

export interface AgentProfile {
  agent_id: string;
  display_name: string | null;
  photo_url: string | null;
}

/** Aviso de que un perfil cambió: todas las pantallas que muestran agentes lo releen. */
export const AGENT_PROFILES_CHANGED = "synapse:agent-profiles-changed";

export async function listAgentProfiles(): Promise<AgentProfile[]> {
  return ((await (await request("/agent-profiles")).json()) as { items: AgentProfile[] }).items;
}

async function change(path: string, init: RequestInit): Promise<AgentProfile> {
  const profile = (await (await request(path, init)).json()) as AgentProfile;
  window.dispatchEvent(new Event(AGENT_PROFILES_CHANGED));
  return profile;
}

export function setAgentName(agentId: string, displayName: string | null): Promise<AgentProfile> {
  return change(`/agent-profiles/${encodeURIComponent(agentId)}`, { method: "PUT", body: JSON.stringify({ display_name: displayName }) });
}

export function uploadAgentPhoto(agentId: string, file: Blob): Promise<AgentProfile> {
  const form = new FormData();
  form.append("file", file);
  return change(`/agent-profiles/${encodeURIComponent(agentId)}/photo`, { method: "PUT", body: form, headers: {} });
}

export function deleteAgentPhoto(agentId: string): Promise<AgentProfile> {
  return change(`/agent-profiles/${encodeURIComponent(agentId)}/photo`, { method: "DELETE", headers: {} });
}
