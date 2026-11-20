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

export interface MemberUser {
  id: string;
  email: string;
  display_name: string | null;
}

export interface Member {
  id: string;
  vault_id: string;
  user_id: string;
  status: "pendiente" | "activo" | "revocado";
  ended_reason: string | null;
  invited_by: string;
  created_at: string;
  responded_at: string | null;
  ended_at: string | null;
  user: MemberUser | null;
  grants: Grant[];
}

export interface ListMembersResponse {
  items: Member[];
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

/** Miembros de una bóveda (todos los estados). Solo el propietario. */
export async function listMembers(vaultId: string): Promise<ListMembersResponse> {
  return (await request(`/vaults/${encodeURIComponent(vaultId)}/members`)).json();
}

/** Invita a una persona a una bóveda. Solo el propietario. */
export async function inviteMember(vaultId: string, email: string, grants: Grant[]): Promise<Member> {
  return (
    await request(`/vaults/${encodeURIComponent(vaultId)}/members`, {
      method: "POST",
      body: JSON.stringify({ email, grants }),
    })
  ).json();
}

/** Actualiza los permisos de un miembro. Solo el propietario. */
export async function updateMemberGrants(vaultId: string, memberId: string, grants: Grant[]): Promise<Member> {
  return (
    await request(`/vaults/${encodeURIComponent(vaultId)}/members/${encodeURIComponent(memberId)}/grants`, {
      method: "PUT",
      body: JSON.stringify({ grants }),
    })
  ).json();
}

/** Quita el acceso de un miembro a la bóveda. Solo el propietario. Sin cuerpo en la respuesta (204). */
export async function removeMember(vaultId: string, memberId: string): Promise<void> {
  await request(`/vaults/${encodeURIComponent(vaultId)}/members/${encodeURIComponent(memberId)}`, { method: "DELETE" });
}
