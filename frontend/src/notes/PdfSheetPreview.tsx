/**
 * Miniatura de la portada o del índice del PDF (H-036): fondo (color, imagen propia o imagen principal de las páginas), encabezados y texto con los estilos
 * que se imprimirán (los propios o los heredados del documento). Aproximación para decidir el diseño, no el PDF. Medidas en `cqw` como `PdfPreview`.
 */
import type { CSSProperties } from "react";
import { PDF_PAGE_PX } from "./metaRules";
import { FAMILY } from "./PdfPreview";
import { shownSheetStyle, type PdfDraft, type PdfType } from "./pdfStyle";

const num = (text: string, fallback: number): number => {
  const value = Number(text);
  return text.trim() !== "" && Number.isFinite(value) ? value : fallback;
};

const SAMPLE_ENTRIES: Array<[number, string, number]> = [[1, "Introducción", 3], [2, "Alcance", 3], [2, "Requisitos", 4], [1, "Diseño", 6], [2, "Arquitectura", 6], [3, "Componentes", 7], [1, "Pruebas", 9]];

export default function PdfSheetPreview({ draft, kind }: { draft: PdfDraft; kind: "portada" | "indice" }) {
  const [width, height] = PDF_PAGE_PX[draft.tamano];
  const sheet = draft[kind];
  const { encabezados, texto } = shownSheetStyle(draft, kind);
  const pt = (value: number) => `${((value * 96) / 72 / width) * 100}cqw`;
  const mm = (value: number) => `${((value * 96) / 25.4 / width) * 100}cqw`;
  const typeStyle = (font: PdfType, fallback: number): CSSProperties => ({ fontFamily: FAMILY[font.familia], color: font.color, fontSize: pt(num(font.tamano, fallback)) });
  const borrowed = sheet.imagen === "" && sheet.imagenPrincipal && draft.encabezado.imagen !== "";
  const image = sheet.imagen !== "" ? sheet.imagen : borrowed ? draft.encabezado.imagen : "";
  const background: CSSProperties = {
    backgroundColor: sheet.fondo,
    ...(image !== "" ? { backgroundImage: `url("/files/${encodeURIComponent(image)}")`, backgroundRepeat: "no-repeat", backgroundPosition: "0 0", backgroundSize: sheet.imagen !== "" ? "100% 100%" : "100% auto" } : {}),
  };
  const level = (font: PdfType, scale: number, fallback: number): CSSProperties => ({ ...typeStyle(font, fallback), fontSize: pt(num(font.tamano, fallback) * scale) });

  return (
    <figure className="pdfs" aria-label={`Vista previa de la ${kind === "portada" ? "portada" : "hoja del índice"}`}>
      <div className="pdfp-wrap">
        <div className="pdfs-page" data-testid={`pdf-sheet-${kind}`} style={{ aspectRatio: `${width} / ${height}`, ...background }}>
          <div className="pdfs-body" style={{ inset: `${mm(kind === "portada" ? 60 : num(draft.margenes.superior, 25))} ${mm(num(draft.margenes.derecho, 20))} ${mm(num(draft.margenes.inferior, 20))} ${mm(num(draft.margenes.izquierdo, 20))}` }}>
            {kind === "portada" ? (
              <>
                <div className="pdfs-h" data-testid="pdf-sheet-heading" style={level(encabezados, 1, 30)}>Título del documento</div>
                <div className="pdfs-h" style={level(encabezados, 0.82, 30)}>Subtítulo</div>
                <p className="pdfs-text" data-testid="pdf-sheet-text" style={typeStyle(texto, 12)}>Autor, fecha y una línea que presenta el documento.</p>
              </>
            ) : (
              <>
                <div className="pdfs-h" data-testid="pdf-sheet-heading" style={typeStyle(encabezados, 20)}>{draft.indice.titulo || "Índice"}</div>
                <ul className="pdfs-toc" data-testid="pdf-sheet-text" style={typeStyle(texto, 10.5)}>
                  {SAMPLE_ENTRIES.filter(([depth]) => depth <= num(draft.indice.niveles, 3)).map(([depth, label, page]) => (
                    <li key={label} style={{ marginLeft: `${(depth - 1) * 3}cqw` }}><span>{label}</span><i aria-hidden="true" /><span>{page}</span></li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </figure>
  );
}
