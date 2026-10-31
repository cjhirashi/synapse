/**
 * Subida de archivos a Synapse (H-015, H-016).
 *
 * Valida el tipo y el tamaño en el cliente para dar feedback inmediato (C-11) y hace
 * `POST /files` multipart con la sesión. El backend vuelve a verificar tipo (por los bytes)
 * y tamaño: el cliente nunca es la única barrera (C-11). Devuelve los metadatos del archivo
 * creado, con su `id`, para construir la URL estable.
 */
import { request } from "../api/auth";

/** Límite por imagen (H-015); límite por documento (H-016) (C-11); el backend aplica el mismo. */
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
export const MAX_FILE_SIZE = 25 * 1024 * 1024;

/** Base de la URL estable y pública de cada archivo (C-1): la sesión de Synapse vive en este dominio. */
export const FILE_URL_BASE = "https://synapse.cjhirashi.com/files";

/** URL absoluta `https` de un archivo por id; pasa `safeImageUrl` sin cambios (C-4). */
export function fileUrl(id: string): string {
  return `${FILE_URL_BASE}/${id}`;
}

/** Tipos de imagen admitidos (H-015): png, jpeg, webp, gif y svg (saneado en el backend, C-5). */
export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
] as const;

/** Tipos de documento admitidos (H-016 C-11): PDF, Office, texto, comprimidos, HTML. */
export const ALLOWED_DOCUMENT_TYPES = [
  "application/pdf",
  // Word
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
  "text/rtf",
  // Excel
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.spreadsheet",
  "text/csv",
  // PowerPoint
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.presentation",
  // Text
  "text/plain",
  "text/markdown",
  "application/json",
  // Compressed
  "application/zip",
  // HTML
  "text/html",
] as const;

/** Metadatos que devuelve `POST /files` (nunca los bytes). */
export interface UploadedFile {
  id: string;
  vault_id: string;
  name: string;
  content_type: string;
  size: number;
  visibility: "private" | "public";
  created_at: string;
}

/** Metadatos de un archivo listado (compatible con UploadedFile pero sin cambios de búsqueda). */
export interface VaultFile extends UploadedFile {
  references_count?: number;
}

/** El archivo supera el límite (validación de cliente, C-11). */
export class UploadTooLargeError extends Error {}

/** El tipo del archivo no está admitido (validación de cliente, C-11). */
export class UploadTypeError extends Error {}

/**
 * Sube `file` a la bóveda `vaultId`. Rechaza en el cliente (sin tocar la red) si el tipo no
 * está admitido o supera su límite; un fallo del servidor llega como `ApiError` (vía `request`).
 */
export async function uploadFile(file: File, vaultId: string): Promise<UploadedFile> {
  const isImage = (ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type);
  const isDocument = (ALLOWED_DOCUMENT_TYPES as readonly string[]).includes(file.type);

  if (!isImage && !isDocument) {
    throw new UploadTypeError(`Tipo no admitido: ${file.type || "desconocido"}`);
  }

  const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_FILE_SIZE;
  if (file.size > maxSize) {
    throw new UploadTooLargeError(`El archivo supera el límite de ${maxSize / (1024 * 1024)} MB (${file.size} bytes)`);
  }

  const form = new FormData();
  form.append("vault_id", vaultId);
  form.append("file", file);
  const res = await request("/files", { method: "POST", body: form, headers: {} });
  return res.json();
}

/**
 * Lista los archivos de una bóveda (GET /vaults/{vaultId}/files, C-4).
 */
export async function listVaultFiles(vaultId: string): Promise<VaultFile[]> {
  const res = await request(`/vaults/${vaultId}/files`);
  return res.json();
}
