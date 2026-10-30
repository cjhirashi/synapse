/**
 * Subida de un archivo a Synapse (H-015).
 *
 * Valida el tipo y el tamaño (≤ 5 MB) en el cliente para dar feedback inmediato (C-6) y hace
 * `POST /files` multipart con la sesión (mismo cliente HTTP, `request`, que el resto de la app).
 * El backend vuelve a verificar tipo (por los bytes) y tamaño: el cliente nunca es la única
 * barrera (C-6). Devuelve los metadatos del archivo creado, con su `id`, para construir la URL
 * `https://synapse.cjhirashi.com/files/<id>` que se inserta en el markdown.
 */
import { request } from "../api/auth";

/** Límite por archivo (C-2/C-6); el backend aplica el mismo. */
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

/** Base de la URL estable y pública de cada archivo (C-1): la sesión de Synapse vive en este dominio. */
export const FILE_URL_BASE = "https://synapse.cjhirashi.com/files";

/** URL absoluta `https` de un archivo por id; pasa `safeImageUrl` sin cambios (C-4). */
export function fileUrl(id: string): string {
  return `${FILE_URL_BASE}/${id}`;
}

/** Tipos de imagen admitidos (C-1): png, jpeg, webp, gif y svg (saneado en el backend, C-5). */
export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
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

/** El archivo supera los 5 MB (validación de cliente, C-6). */
export class UploadTooLargeError extends Error {}

/** El tipo del archivo no está admitido (validación de cliente, C-6). */
export class UploadTypeError extends Error {}

/**
 * Sube `file` a la bóveda `vaultId`. Rechaza en el cliente (sin tocar la red) si el tipo no
 * está admitido o supera 5 MB; un fallo del servidor llega como `ApiError` (vía `request`).
 */
export async function uploadFile(file: File, vaultId: string): Promise<UploadedFile> {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    throw new UploadTypeError(`Tipo no admitido: ${file.type || "desconocido"}`);
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new UploadTooLargeError(`El archivo supera los 5 MB (${file.size} bytes)`);
  }
  const form = new FormData();
  form.append("vault_id", vaultId);
  form.append("file", file);
  // `headers: {}` anula el `Content-Type: application/json` por defecto de `request`: con
  // FormData el navegador fija el `multipart/form-data; boundary=...` correcto.
  const res = await request("/files", { method: "POST", body: form, headers: {} });
  return res.json();
}
