/**
 * Formato del PDF de una plantilla (H-036): `estilo.pdf` como borrador editable y su conversión de ida y vuelta.
 * Los valores por omisión son los mismos que usa el servidor (`backend/app/services/pdf_style.py`).
 */
import { PDF_FONTS, PDF_MARGINS } from "./metaRules";

export type PdfFont = (typeof PDF_FONTS)[number];
export type PdfMargin = (typeof PDF_MARGINS)[number];

export interface PdfType { familia: PdfFont; tamano: string; color: string }
export interface PdfBand { imagen: string; izquierda: string; centro: string; derecha: string }
export interface PdfDraft {
  activo: boolean;
  incluirAtributos: boolean;
  tamano: "carta" | "a4";
  margenes: Record<PdfMargin, string>;
  encabezados: PdfType;
  texto: PdfType;
  encabezado: PdfBand;
  pie: PdfBand;
}

export const DEFAULT_PDF_DRAFT: PdfDraft = {
  activo: false,
  incluirAtributos: false,
  tamano: "carta",
  margenes: { superior: "25", inferior: "20", izquierdo: "20", derecho: "20" },
  encabezados: { familia: "DejaVu Sans", tamano: "18", color: "#111827" },
  texto: { familia: "DejaVu Sans", tamano: "10.5", color: "#1f2937" },
  encabezado: { imagen: "", izquierda: "", centro: "", derecha: "" },
  pie: { imagen: "", izquierda: "", centro: "", derecha: "Página {{pagina}} de {{paginas}}" },
};

type Raw = Record<string, unknown>;
const obj = (value: unknown): Raw => (value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {});
const str = (value: unknown, fallback: string): string => (typeof value === "string" ? value : fallback);
const num = (value: unknown, fallback: string): string => (typeof value === "number" ? String(value) : fallback);

function readType(raw: unknown, base: PdfType): PdfType {
  const r = obj(raw);
  const familia = (PDF_FONTS as readonly string[]).includes(r.familia as string) ? (r.familia as PdfFont) : base.familia;
  return { familia, tamano: num(r.tamano_pt, base.tamano), color: str(r.color, base.color) };
}

function readBand(raw: unknown, base: PdfBand): PdfBand {
  const r = obj(raw);
  return {
    imagen: str(r.imagen, base.imagen),
    izquierda: str(r.izquierda, base.izquierda), centro: str(r.centro, base.centro), derecha: str(r.derecha, base.derecha),
  };
}

/** `estilo.pdf` guardado → borrador del formulario (lo que falta toma el valor por omisión). */
export function pdfDraftFrom(raw: unknown): PdfDraft {
  const r = obj(raw);
  const page = obj(r.pagina);
  const margins = obj(page.margenes_mm);
  const base = DEFAULT_PDF_DRAFT;
  const bare = Object.keys(r).length === 0;
  return {
    activo: r.activo === true,
    incluirAtributos: r.incluir_atributos === true,
    tamano: page.tamano === "a4" ? "a4" : "carta",
    margenes: Object.fromEntries(PDF_MARGINS.map((key) => [key, num(margins[key], base.margenes[key])])) as Record<PdfMargin, string>,
    encabezados: readType(r.encabezados, base.encabezados),
    texto: readType(r.texto, base.texto),
    // Una plantilla sin formato guardado no trae pie: la numeración por omisión solo se ofrece al activar el PDF.
    encabezado: readBand(r.encabezado, base.encabezado),
    pie: readBand(r.pie, bare ? base.pie : { ...base.pie, derecha: "" }),
  };
}

const toNumber = (text: string): number => (text.trim() === "" ? Number.NaN : Number(text));
const typeOut = (t: PdfType) => ({ familia: t.familia, tamano_pt: toNumber(t.tamano), color: t.color.trim() });
const bandOut = (b: PdfBand) => ({
  imagen: b.imagen === "" ? null : b.imagen, izquierda: b.izquierda, centro: b.centro, derecha: b.derecha,
});
/** El pie no lleva imagen: solo sus tres textos. */
const footOut = (b: PdfBand) => ({ izquierda: b.izquierda, centro: b.centro, derecha: b.derecha });

/** Borrador → `estilo.pdf`. Un borrador intacto (PDF apagado y sin tocar) se guarda como `{}`. */
export function pdfDraftTo(draft: PdfDraft): Record<string, unknown> {
  if (JSON.stringify(draft) === JSON.stringify(DEFAULT_PDF_DRAFT)) return {};
  return {
    activo: draft.activo,
    incluir_atributos: draft.incluirAtributos,
    pagina: {
      tamano: draft.tamano,
      margenes_mm: Object.fromEntries(PDF_MARGINS.map((key) => [key, toNumber(draft.margenes[key])])),
    },
    encabezados: typeOut(draft.encabezados),
    texto: typeOut(draft.texto),
    encabezado: bandOut(draft.encabezado),
    pie: footOut(draft.pie),
  };
}
