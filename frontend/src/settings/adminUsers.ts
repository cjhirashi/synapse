/** Cliente de la gestión de cuentas del administrador (H-060): `/admin/users`. Solo con la sesión de un admin o super admin. */
import { request } from "../api/auth";

export type AdminRole = "super_admin" | "admin" | "guest";

/** Límites de una cuenta; `null` = sin límite. El almacenamiento va en bytes, por bóveda. */
export interface UserLimits {
  max_vaults: number | null;
  max_notes_per_vault: number | null;
  max_storage_bytes_per_vault: number | null;
}

export interface Grace {
  kind: "vaults" | "documents" | "storage";
  vault_id: string | null;
  deadline_at: string;
}

export interface AdminUser {
  id: string;
  email: string;
  role: AdminRole;
  display_name: string | null;
  must_change_password: boolean;
  created_at: string;
  /** Cuenta dada de baja: se puede recuperar hasta `purge_at`; después se borra todo. */
  deleted_at: string | null;
  purge_at: string | null;
  limits: UserLimits;
  /** Efectivo: administradores siempre; un usuario, solo si se le activó compartir bóvedas. */
  can_share_vaults: boolean;
  /** Bóvedas vivas hoy; `null` si el servidor no pudo contarlas. */
  vaults_used: number | null;
  /** Bytes de todos sus archivos, en todas sus bóvedas. */
  storage_bytes: number;
  grace: Grace[];
}

/** Uso de una bóveda vista por un administrador: sin nombre ni id (son privados de la persona), solo un alias por orden de creación. */
export interface VaultUsage {
  alias: string;
  documents: number;
  storage_bytes: number;
}

/** Uso de una cuenta por bóveda y en total (`GET /admin/users/{id}/usage`). */
export interface UserUsage {
  vaults: VaultUsage[];
  documents_total: number;
  storage_bytes_total: number;
}

export const MB = 1024 * 1024;

const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const path = (id: string, tail = "") => `/admin/users/${encodeURIComponent(id)}${tail}`;

export async function listUsers(): Promise<AdminUser[]> {
  return (await request("/admin/users")).json();
}

/** La cuenta nace con la contraseña base (la pone el servidor); un límite omitido toma el valor inicial del servidor. */
export async function getUsage(id: string): Promise<UserUsage> {
  return (await request(path(id, "/usage"))).json();
}

export async function createUser(email: string, role: "guest" | "admin", limits: UserLimits): Promise<AdminUser> {
  return (await request("/admin/users", json("POST", { email, role, ...limits }))).json();
}

export async function updateSharing(id: string, canShare: boolean): Promise<AdminUser> {
  return (await request(path(id, "/sharing"), json("PATCH", { can_share_vaults: canShare }))).json();
}

export async function updateLimits(id: string, limits: UserLimits): Promise<AdminUser> {
  return (await request(path(id, "/limits"), json("PATCH", limits))).json();
}

export async function deleteUser(id: string): Promise<AdminUser> {
  return (await request(path(id), json("DELETE"))).json();
}

export async function restoreUser(id: string): Promise<AdminUser> {
  return (await request(path(id, "/restore"), json("POST"))).json();
}

export async function updateRole(id: string, role: "guest" | "admin"): Promise<AdminUser> {
  return (await request(path(id, "/role"), json("PATCH", { role }))).json();
}

const count = new Intl.NumberFormat("es-MX");

export function formatCount(value: number): string {
  return count.format(value);
}

/** «500 MB», «1 GB», «1.5 GB»: el almacenamiento como lo escribe el administrador. */
export function formatBytes(bytes: number): string {
  const mb = bytes / MB;
  if (mb < 1024) return `${count.format(Math.round(mb * 100) / 100)} MB`;
  return `${count.format(Math.round((mb / 1024) * 100) / 100)} GB`;
}

/** Texto de un campo de límite → número, `null` (vacío = sin límite) o `undefined` si no es un entero ≥ 0. */
export function parseLimit(text: string): number | null | undefined {
  const clean = text.trim();
  if (clean === "") return null;
  return /^\d{1,9}$/.test(clean) ? Number(clean) : undefined;
}
