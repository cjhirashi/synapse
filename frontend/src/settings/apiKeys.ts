import { request } from "../api/auth";

/** Elemento del listado (`GET /auth/agent-keys`): sin el valor plano ni el hash (RF-004). */
export interface AgentKey {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

/** Respuesta de la creación: el valor plano (`key`) viaja **sólo aquí**, una vez (RF-001). */
export interface CreatedAgentKey {
  id: string;
  label: string;
  key: string;
  created_at: string;
}

/** Keys de agente del usuario de la sesión, activas y revocadas (C-1). */
export async function listAgentKeys(): Promise<AgentKey[]> {
  return (await request("/auth/agent-keys")).json();
}

/** Crea una key; un `label` ya en uso llega como `ApiError` 409 (C-2/C-3). */
export async function createAgentKey(label: string): Promise<CreatedAgentKey> {
  return (await request("/auth/agent-keys", { method: "POST", body: JSON.stringify({ label }) })).json();
}

/** Revoca una key propia por id (C-4); una ajena o inexistente llega como `ApiError` 404. */
export async function revokeAgentKey(id: string): Promise<void> {
  await request(`/auth/agent-keys/${encodeURIComponent(id)}`, { method: "DELETE" });
}
