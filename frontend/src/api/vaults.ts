/**
 * Cliente de `/vaults/**` (SPEC-0003).
 *
 * Espejo del contrato de 0003. Cada bóveda viaja con su `etag` (la versión que exige
 * `If-Match` al editar, borrar o restaurar): en los listados va en cada elemento
 * (PLAN-0003 §13); en las respuestas de una sola bóveda, en la cabecera `ETag`.
 */
import { request } from "./auth";

export interface Vault {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  owner_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  etag: string;
}

export interface VaultPage {
  items: Vault[];
  next_cursor: string | null;
}

/** Cuerpo de `POST /vaults`; en `PATCH` sólo se envían los campos que cambian. */
export interface VaultInput {
  name: string;
  description: string | null;
  tags: string[];
}

const URN = "urn:synapse:problem:";

/** Tipos de error de bóvedas que la UI distingue (los genéricos están en `problems.ts`). */
export const VAULT_PROBLEM = {
  nameTaken: `${URN}vault-name-taken`,
  preconditionFailed: `${URN}precondition-failed`,
  notFound: `${URN}vault-not-found`,
} as const;

function vaultPath(id: string): string {
  return `/vaults/${encodeURIComponent(id)}`;
}

/** `request` sustituye las cabeceras por defecto si recibe otras: se repite el tipo. */
function conditional(etag: string): HeadersInit {
  return { "Content-Type": "application/json", "If-Match": etag };
}

/** Bóveda de una respuesta individual: el cuerpo más la versión de su cabecera `ETag`. */
async function versioned(res: Response): Promise<Vault> {
  const etag = res.headers.get("ETag");
  if (etag === null) throw new Error(`${res.url || "respuesta"} sin cabecera ETag`);
  return { ...(await res.json()), etag };
}

export async function listVaults({ deleted = false, cursor }: { deleted?: boolean; cursor?: string } = {}): Promise<VaultPage> {
  const params = new URLSearchParams();
  if (deleted) params.set("deleted", "true");
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  return (await request(query ? `/vaults?${query}` : "/vaults")).json();
}

export async function getVault(id: string): Promise<Vault> {
  return versioned(await request(vaultPath(id)));
}

export async function createVault(data: VaultInput): Promise<Vault> {
  return versioned(await request("/vaults", { method: "POST", body: JSON.stringify(data) }));
}

export async function updateVault(id: string, data: Partial<VaultInput>, etag: string): Promise<Vault> {
  const init = { method: "PATCH", headers: conditional(etag), body: JSON.stringify(data) };
  return versioned(await request(vaultPath(id), init));
}

export async function deleteVault(id: string, etag: string): Promise<void> {
  await request(vaultPath(id), { method: "DELETE", headers: conditional(etag) });
}

export async function restoreVault(id: string, etag: string): Promise<Vault> {
  return versioned(await request(`${vaultPath(id)}/restore`, { method: "POST", headers: conditional(etag) }));
}
