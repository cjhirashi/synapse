/**
 * Vista previa a escala de la hoja del PDF (H-036 rediseño): márgenes, imagen de fondo, textos de encabezado y pie, tipografías y colores
 * de la plantilla. Es una aproximación para decidir el diseño (las tipografías del navegador pueden diferir de las del PDF), no el PDF.
 * Todo se mide en `cqw` (porcentaje del ancho de la hoja), así que escala con el panel sin JavaScript.
 */
import type { CSSProperties } from "react";
import { PDF_PAGE_PX } from "./metaRules";
import { headingColor, themeColors, type HeadingLevel, type PdfBand, type PdfDraft, type PdfFont, type PdfType } from "./pdfStyle";

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
  const textSize = num(draft.texto.tamano, 10.5);
  const typeStyle = (font: PdfType, fallbackSize: number): CSSProperties => ({ fontFamily: FAMILY[font.familia], color: font.color, fontSize: pt(num(font.tamano, fallbackSize)) });
  const band = (spec: PdfBand, edge: "top" | "bottom"): CSSProperties => {
    const line = spec.linea.activa ? `${Math.max(1, Math.round(((num(spec.linea.grosor, 0.6) * 96) / 72) * 100) / 100)}px solid ${spec.linea.color}` : "none";
    const lineSide = edge === "top" ? { borderBottom: line, paddingBottom: line === "none" ? 0 : mm(1.5) } : { borderTop: line, paddingTop: line === "none" ? 0 : mm(1.5) };
    return {
      [edge]: mm(num(spec.distancia, 10)), left: mm(left), right: mm(right), paddingInline: mm(num(spec.sangria, 0)), boxSizing: "border-box",
      ...typeStyle(spec.fuente, 8.6), ...lineSide,
      visibility: spec.izquierda || spec.centro || spec.derecha || spec.linea.activa ? "visible" : "hidden",
    };
  };
  const bar = (widthPercent: number): CSSProperties => ({ width: `${widthPercent}%`, height: pt(textSize * 0.55), background: draft.texto.color });
  const theme = themeColors(draft);
  const inline = (color: string | undefined, extra?: CSSProperties): CSSProperties => ({ ...(color ? { color } : {}), ...extra });
  const heads: Array<[HeadingLevel, string]> = [["h1", "Título del documento"], ["h2", "Subtítulo de sección"], ["h3", "Apartado"], ["h4", "Detalle"]];

  return (
    <figure className="pdfp" aria-label="Vista previa de la hoja">
      <div className="pdfp-wrap">
        <div className="pdfp-page" style={{ aspectRatio: `${width} / ${height}` }}>
          {draft.encabezado.imagen !== "" && (
            <div className="pdfp-bg" data-testid="pdf-preview-bg" style={{ backgroundImage: `url("/files/${encodeURIComponent(draft.encabezado.imagen)}")` }} />
          )}
          <div className="pdfp-band" data-testid="pdf-preview-head" style={band(draft.encabezado, "top")}>
            <span>{sampleText(draft.encabezado.izquierda)}</span><span>{sampleText(draft.encabezado.centro)}</span><span>{sampleText(draft.encabezado.derecha)}</span>
          </div>
          <div className="pdfp-body" style={{ top: mm(top), bottom: mm(bottom), left: mm(left), right: mm(right) }}>
            {heads.map(([level, text], index) => (
              <div key={level}>
                <div className="pdfp-h" style={{ ...typeStyle(draft.encabezados[level], 18), color: headingColor(draft, level) }}>{text}</div>
                <div className="pdfp-lines" style={{ gap: pt(textSize * 0.55) }}>
                  {(index === 0 ? [100, 96, 62] : [100, 70]).map((percent, i) => <i key={i} style={bar(percent)} />)}
                </div>
              </div>
            ))}
            <p className="pdfp-sample" data-testid="pdf-preview-sample" style={{ fontFamily: FAMILY[draft.texto.familia], fontSize: pt(textSize), color: draft.texto.color }}>
              Texto con <b style={inline(theme?.negrita)}>negrita</b>, <i style={inline(theme?.cursiva)}>cursiva</i>, un <u style={inline(theme?.enlace)}>enlace</u> y <code style={inline(theme?.codigo, theme ? { background: theme.codigo_fondo } : undefined)}>código</code>.
            </p>
          </div>
          <div className="pdfp-band" data-testid="pdf-preview-foot" style={band(draft.pie, "bottom")}>
            <span>{sampleText(draft.pie.izquierda)}</span><span>{sampleText(draft.pie.centro)}</span><span>{sampleText(draft.pie.derecha)}</span>
          </div>
        </div>
      </div>
      <figcaption>{draft.tamano === "a4" ? "A4" : "Carta"} · {width} × {height} px · los recuadros punteados son los márgenes</figcaption>
    </figure>
  );
}
