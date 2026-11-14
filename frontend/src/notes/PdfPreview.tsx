/**
 * Vista previa a escala de la hoja del PDF (H-036 rediseño): márgenes, imagen de fondo, textos de encabezado y pie, tipografías y colores
 * de la plantilla. Es una aproximación para decidir el diseño (las tipografías del navegador pueden diferir de las del PDF), no el PDF.
 * Todo se mide en `cqw` (porcentaje del ancho de la hoja), así que escala con el panel sin JavaScript.
 */
import type { CSSProperties } from "react";
import { PDF_PAGE_PX } from "./metaRules";
import type { PdfDraft, PdfFont } from "./pdfStyle";

const FAMILY: Record<PdfFont, string> = {
  "DejaVu Sans": '"DejaVu Sans", Verdana, sans-serif',
  "DejaVu Serif": '"DejaVu Serif", Georgia, serif',
  "Liberation Sans": '"Liberation Sans", Arial, sans-serif',
  "Liberation Serif": '"Liberation Serif", "Times New Roman", serif',
  "Liberation Mono": '"Liberation Mono", "Courier New", monospace',
};

/** Texto de encabezado o pie con valores de ejemplo en lugar de los campos especiales. */
export function sampleText(text: string): string {
  return text
    .replace(/\{\{titulo\}\}/g, "Título del documento")
    .replace(/\{\{fecha\}\}/g, "14 nov 2026")
    .replace(/\{\{paginas\}\}/g, "3")
    .replace(/\{\{pagina\}\}/g, "1")
    .replace(/\{\{atributo:([^}]*)\}\}/g, "‹$1›");
}

const num = (text: string, fallback: number): number => {
  const value = Number(text);
  return text.trim() !== "" && Number.isFinite(value) ? value : fallback;
};

export default function PdfPreview({ draft }: { draft: PdfDraft }) {
  const [width, height] = PDF_PAGE_PX[draft.tamano];
  const px = (value: number) => `${(value / width) * 100}cqw`;
  const mm = (value: number) => px((value * 96) / 25.4);
  const pt = (value: number) => px((value * 96) / 72);
  const top = num(draft.margenes.superior, 25);
  const bottom = num(draft.margenes.inferior, 20);
  const left = num(draft.margenes.izquierdo, 20);
  const right = num(draft.margenes.derecho, 20);
  const headSize = num(draft.encabezados.tamano, 18);
  const textSize = num(draft.texto.tamano, 10.5);
  const band = (spec: { izquierda: string; centro: string; derecha: string }, edge: "top" | "bottom"): CSSProperties => ({
    [edge]: 0, height: mm(edge === "top" ? top : bottom), left: mm(left), right: mm(right), fontSize: pt(textSize * 0.82), fontFamily: FAMILY[draft.texto.familia],
    visibility: spec.izquierda || spec.centro || spec.derecha ? "visible" : "hidden",
  });
  const bar = (widthPercent: number): CSSProperties => ({ width: `${widthPercent}%`, height: pt(textSize * 0.55), background: draft.texto.color });

  return (
    <figure className="pdfp" aria-label="Vista previa de la hoja">
      <div className="pdfp-wrap">
        <div className="pdfp-page" style={{ aspectRatio: `${width} / ${height}` }}>
          {draft.encabezado.imagen !== "" && (
            <div className="pdfp-bg" data-testid="pdf-preview-bg" style={{ backgroundImage: `url("/files/${encodeURIComponent(draft.encabezado.imagen)}")` }} />
          )}
          <div className="pdfp-band" style={band(draft.encabezado, "top")}>
            <span>{sampleText(draft.encabezado.izquierda)}</span><span>{sampleText(draft.encabezado.centro)}</span><span>{sampleText(draft.encabezado.derecha)}</span>
          </div>
          <div className="pdfp-body" style={{ top: mm(top), bottom: mm(bottom), left: mm(left), right: mm(right) }}>
            <div className="pdfp-h" style={{ fontFamily: FAMILY[draft.encabezados.familia], color: draft.encabezados.color, fontSize: pt(headSize) }}>Título del documento</div>
            <div className="pdfp-lines" style={{ gap: pt(textSize * 0.55) }}>
              {[100, 96, 100, 62, 100, 98, 100, 80, 40].map((percent, index) => <i key={index} style={bar(percent)} />)}
            </div>
          </div>
          <div className="pdfp-band" style={band(draft.pie, "bottom")}>
            <span>{sampleText(draft.pie.izquierda)}</span><span>{sampleText(draft.pie.centro)}</span><span>{sampleText(draft.pie.derecha)}</span>
          </div>
        </div>
      </div>
      <figcaption>{draft.tamano === "a4" ? "A4" : "Carta"} · {width} × {height} px · los recuadros punteados son los márgenes</figcaption>
    </figure>
  );
}
