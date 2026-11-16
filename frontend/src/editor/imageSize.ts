/**
 * Límite de tamaño de una imagen en el propio Markdown (H-036g): `![descripción|50%|alto:300](enlace)`.
 *
 * Tras la descripción van marcas separadas por `|`: `NN%` (de 5 a 100) limita el ANCHO a ese porcentaje del texto y `alto:NNN` (de 40 a 2000) limita el ALTO a esos
 * píxeles. Solo limitan: una imagen más chica no se agranda, y la imagen conserva sus proporciones. El Markdown guardado no cambia; la descripción que se muestra
 * y se lee con lector de pantalla es la de antes de las marcas.
 */
export interface ImageSize { alt: string; widthPct: number | null; heightPx: number | null }

const WIDTH = /^(\d{1,3})%$/;
const HEIGHT = /^alto:(\d{2,4})$/;

export function parseImageSize(alt: string): ImageSize {
  const parts = alt.split("|");
  let widthPct: number | null = null;
  let heightPx: number | null = null;
  while (parts.length > 1) {
    const mark = parts[parts.length - 1].trim();
    const width = WIDTH.exec(mark);
    const height = HEIGHT.exec(mark);
    if (width && widthPct === null && Number(width[1]) >= 5 && Number(width[1]) <= 100) widthPct = Number(width[1]);
    else if (height && heightPx === null && Number(height[1]) >= 40 && Number(height[1]) <= 2000) heightPx = Number(height[1]);
    else break;
    parts.pop();
  }
  return { alt: parts.join("|"), widthPct, heightPx };
}
