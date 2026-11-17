/** Cliente de publicación de un documento (H-035): rutas de `/publication` con sesión para controlar el acceso público. */
import { request } from "../api/auth";
import { ApiError } from "../api/problems";
import { restNoteId } from "./pdfApi";

export interface PublicationStatus {
  enabled: boolean;
  published: boolean;
  token: string | null;
  path: string | null;
  published_at: string | null;
  republished_at: string | null;
  stale: boolean;
}

export interface PublicationResource {
  id: string;
  name: string | null;
  content_type: string | null;
  visibility: "public" | "private" | "missing";
}

export interface PublicationCheck {
  resources: PublicationResource[];
  external: string[];
  has_private: boolean;
}

function base(vaultId: string, noteId: string): string {
  return `/vaults/${encodeURIComponent(vaultId)}/notes/${encodeURIComponent(restNoteId(noteId))}/publication`;
}

export async function getPublication(vaultId: string, noteId: string): Promise<PublicationStatus> {
  const res = await request(base(vaultId, noteId));
  return await res.json() as PublicationStatus;
}

export async function checkPublication(vaultId: string, noteId: string, html: string): Promise<PublicationCheck> {
  const res = await request(`${base(vaultId, noteId)}/check`, { method: "POST", body: JSON.stringify({ html }) });
  return await res.json() as PublicationCheck;
}

export async function publishNote(vaultId: string, noteId: string, html: string): Promise<PublicationStatus> {
  const res = await request(base(vaultId, noteId), { method: "POST", body: JSON.stringify({ html }) });
  return await res.json() as PublicationStatus;
}

export async function republishNote(vaultId: string, noteId: string, html: string): Promise<PublicationStatus> {
  const res = await request(base(vaultId, noteId), { method: "PUT", body: JSON.stringify({ html }) });
  return await res.json() as PublicationStatus;
}

export async function unpublishNote(vaultId: string, noteId: string): Promise<void> {
  await request(base(vaultId, noteId), { method: "DELETE" });
}

export function publicUrl(path: string): string {
  return new URL(path, window.location.origin).href;
}

export function publicationErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.type.endsWith("publish-not-enabled")) return "La plantilla de este documento ya no permite publicarlo.";
    if (err.type.endsWith("already-published")) return "Este documento ya está publicado. Recarga para ver su enlace.";
    if (err.type.endsWith("not-published")) return "Este documento ya no está publicado.";
    if (err.status === 404) return "No se encontró el documento en el servidor. ¿Se sincronizó?";
    if (err.status === 413 || err.status === 422) return "El documento es demasiado grande para publicarlo.";
    if (err.status === 401) return "Tu sesión terminó. Vuelve a entrar.";
    return "No se pudo completar la acción. Inténtalo de nuevo.";
  }
  return "Para publicar necesitas conexión con el servidor.";
}
