/** Cliente del PDF de un documento (H-036): `POST /vaults/{vault}/notes/{id}/pdf` con el HTML de Lectura; devuelve el archivo. */
import { request } from "../api/auth";
import { ApiError } from "../api/problems";

export interface PdfFile { blob: Blob; filename: string }

const FALLBACK_NAME = "documento.pdf";

export async function fetchNotePdf(vaultId: string, noteId: string, html: string): Promise<PdfFile> {
  const res = await request(`/vaults/${encodeURIComponent(vaultId)}/notes/${encodeURIComponent(noteId)}/pdf`, { method: "POST", body: JSON.stringify({ html }) });
  const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "");
  return { blob: await res.blob(), filename: match?.[1] ?? FALLBACK_NAME };
}

/** Descarga el archivo en el navegador (enlace temporal; funciona igual en escritorio y móvil). */
export function saveBlob({ blob, filename }: PdfFile): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Texto para la persona cuando falla la generación. */
export function pdfErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.type.endsWith("pdf-not-enabled")) return "La plantilla de este documento ya no permite descargarlo como PDF.";
    if (err.type.endsWith("pdf-busy")) return "Hay otros PDF generándose. Inténtalo de nuevo en unos segundos.";
    if (err.type.endsWith("pdf-timeout")) return "El PDF tardó demasiado en generarse. Inténtalo de nuevo o divide el documento.";
    if (err.status === 413 || err.status === 422) return "El documento es demasiado grande para convertirlo en PDF.";
    if (err.status === 404) return "No se encontró el documento en el servidor. ¿Se sincronizó?";
    return "No se pudo generar el PDF. Inténtalo de nuevo.";
  }
  return "Para generar el PDF necesitas conexión con el servidor.";
}
