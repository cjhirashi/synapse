/** Cliente de invitaciones a bóvedas compartidas (H-064 F5a): `/invitations`. Solo con la sesión. */
import { request } from "../api/auth";

export interface Grant {
  folder: string;
  level: "lectura" | "escritura";
}

export interface Owner {
  id: string;
  email: string;
  display_name: string | null;
}

export interface Invitation {
  id: string;
  vault_id: string;
  status: "pendiente" | "activo";
  created_at: string;
  responded_at: string | null;
  owner: Owner | null;
  vault_name: string | null;
  grants: Grant[];
}

export interface ListInvitationsResponse {
  items: Invitation[];
}

/** Invitaciones pendientes y activas de la persona. */
export async function listInvitations(): Promise<ListInvitationsResponse> {
  return (await request("/invitations")).json();
}

/** Acepta una invitación pendiente. */
export async function acceptInvitation(id: string): Promise<void> {
  await request(`/invitations/${encodeURIComponent(id)}/accept`, { method: "POST" });
}

/** Rechaza una invitación pendiente. */
export async function rejectInvitation(id: string): Promise<void> {
  await request(`/invitations/${encodeURIComponent(id)}/reject`, { method: "POST" });
}

/** Sale de una bóveda compartida. Sin cuerpo en la respuesta (204). */
export async function leaveInvitation(id: string): Promise<void> {
  await request(`/invitations/${encodeURIComponent(id)}/leave`, { method: "POST" });
}
