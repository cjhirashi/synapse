/**
 * Formato del PDF de una plantilla (H-036): `estilo.pdf` como borrador editable y su conversión de ida y vuelta.
 * Los valores por omisión y las derivaciones son los mismos que usa el servidor (`backend/app/core/pdf_style.py`), para que la vista previa
 * del formulario y el PDF coincidan, también con plantillas guardadas con el formato anterior (encabezados en forma plana).
 */
import { palette, type ThemeColors } from "./colorTheme";
import { PDF_FONTS, PDF_HEADING_LEVELS, PDF_MARGINS } from "./metaRules";

export type PdfFont = (typeof PDF_FONTS)[number];
export type PdfMargin = (typeof PDF_MARGINS)[number];
export type HeadingLevel = (typeof PDF_HEADING_LEVELS)[number];

/** En los encabezados, `color: ""` significa «automático»: lo da el tema de color (solo con el tema activo). */
export interface PdfType { familia: PdfFont; tamano: string; color: string }
export interface PdfLine { activa: boolean; color: string; grosor: string }
export interface PdfBand {
  imagen: string;
  izquierda: string;
  centro: string;
  derecha: string;
  fuente: PdfType;
  linea: PdfLine;
  /** Distancia del borde de la hoja al encabezado (o al pie), en mm. */
  distancia: string;
  /** Sangría lateral respecto a los márgenes de la página, en mm. */
  sangria: string;
}
/** Tema de color: con `activo`, el secundario, el terciario y los colores de cada elemento salen del primario (`colorTheme.ts`). */
export interface PdfTheme { activo: boolean; primario: string }
/** Hoja de portada o de índice (marcas `pdf:portada` y `pdf:indice`): fondo, imagen de fondo (id de archivo) y color del texto. */
export interface PdfSheet { fondo: string; imagen: string; color: string }
export interface PdfIndex extends PdfSheet { titulo: string; niveles: string }
export interface PdfDraft {
  activo: boolean;
  tema: PdfTheme;
  incluirAtributos: boolean;
  tamano: "carta" | "a4";
  margenes: Record<PdfMargin, string>;
  encabezados: Record<HeadingLevel, PdfType>;
  texto: PdfType;
  encabezado: PdfBand;
  pie: PdfBand;
  portada: PdfSheet;
  indice: PdfIndex;
}

const BAND_TEXT_COLOR = "#475569";
const LINE_COLOR = "#cbd5e1";
const HEADING_SCALE = { h2: 0.82, h3: 0.68, h4: 0.58 } as const;

export const DEFAULT_PDF_DRAFT: PdfDraft = {
  activo: false,
  tema: { activo: false, primario: "#0891b2" },
  incluirAtributos: false,
  tamano: "carta",
  margenes: { superior: "25", inferior: "20", izquierdo: "20", derecho: "20" },
  encabezados: {
    h1: { familia: "DejaVu Sans", tamano: "18", color: "#111827" },
    h2: { familia: "DejaVu Sans", tamano: "14.8", color: "#111827" },
    h3: { familia: "DejaVu Sans", tamano: "12.2", color: "#111827" },
    h4: { familia: "DejaVu Sans", tamano: "10.5", color: "#111827" },
  },
  texto: { familia: "DejaVu Sans", tamano: "10.5", color: "#1f2937" },
  encabezado: {
    imagen: "", izquierda: "", centro: "", derecha: "",
    fuente: { familia: "DejaVu Sans", tamano: "8.6", color: BAND_TEXT_COLOR },
    linea: { activa: false, color: LINE_COLOR, grosor: "0.6" }, distancia: "10", sangria: "0",
  },
  pie: {
    imagen: "", izquierda: "", centro: "", derecha: "Página {{pagina}} de {{paginas}}",
    fuente: { familia: "DejaVu Sans", tamano: "8.6", color: BAND_TEXT_COLOR },
    linea: { activa: true, color: LINE_COLOR, grosor: "0.6" }, distancia: "10", sangria: "0",
  },
  portada: { fondo: "#0f172a", imagen: "", color: "#f8fafc" },
  indice: { fondo: "#f1f5f9", imagen: "", color: "#1f2937", titulo: "Índice", niveles: "3" },
};

type Raw = Record<string, unknown>;
const obj = (value: unknown): Raw => (value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {});
const str = (value: unknown, fallback: string): string => (typeof value === "string" ? value : fallback);
const num = (value: unknown, fallback: string): string => (typeof value === "number" ? String(value) : fallback);
const round1 = (value: number): string => String(Math.round(value * 10) / 10);

function readType(raw: unknown, base: PdfType): PdfType {
  const r = obj(raw);
  const familia = (PDF_FONTS as readonly string[]).includes(r.familia as string) ? (r.familia as PdfFont) : base.familia;
  return { familia, tamano: num(r.tamano_pt, base.tamano), color: str(r.color, base.color) };
}

/** Los cuatro niveles: nivel a nivel, o, con la forma plana anterior, H1 con esos valores y el resto derivado de él. Con el tema activo el color de los encabezados es siempre «automático» ("") y no se edita. */
function readHeadings(raw: unknown, text: PdfType, themed: boolean): Record<HeadingLevel, PdfType> {
  const r = obj(raw);
  const source = "h1" in r ? obj(r.h1) : r;
  const h1 = readType(source, DEFAULT_PDF_DRAFT.encabezados.h1);
  if (themed) h1.color = "";
  const size = Number(h1.tamano);
  const derived = (level: "h2" | "h3" | "h4"): PdfType => {
    const scaled = size * HEADING_SCALE[level];
    return { familia: h1.familia, color: themed ? "" : h1.color, tamano: Number.isFinite(scaled) ? round1(level === "h4" ? Math.max(Number(text.tamano), scaled) : scaled) : DEFAULT_PDF_DRAFT.encabezados[level].tamano };
  };
  const level = (key: "h2" | "h3" | "h4"): PdfType => {
    const base = derived(key);
    const one = readType(r[key], base);
    if (themed) one.color = "";
    return one;
  };
  return { h1, h2: level("h2"), h3: level("h3"), h4: level("h4") };
}

function readBand(raw: unknown, text: PdfType, base: PdfBand): PdfBand {
  const r = obj(raw);
  const line = obj(r.linea);
  const bodySize = Number(text.tamano);
  const fuenteBase: PdfType = { familia: text.familia, tamano: Number.isFinite(bodySize) ? round1(bodySize * 0.82) : base.fuente.tamano, color: BAND_TEXT_COLOR };
  return {
    imagen: str(r.imagen, base.imagen),
    izquierda: str(r.izquierda, base.izquierda), centro: str(r.centro, base.centro), derecha: str(r.derecha, base.derecha),
    fuente: readType(r.fuente, fuenteBase),
    linea: { activa: typeof line.activa === "boolean" ? line.activa : base.linea.activa, color: str(line.color, base.linea.color), grosor: num(line.grosor_pt, base.linea.grosor) },
    distancia: num(r.distancia_mm, base.distancia), sangria: num(r.sangria_mm, base.sangria),
  };
}

function readSheet<T extends PdfSheet>(raw: unknown, base: T): T {
  const r = obj(raw);
  return { ...base, fondo: str(r.fondo, base.fondo), imagen: str(r.imagen, base.imagen), color: str(r.color, base.color) };
}

/** `estilo.pdf` guardado → borrador del formulario (lo que falta toma el valor por omisión). */
export function pdfDraftFrom(raw: unknown): PdfDraft {
  const r = obj(raw);
  const page = obj(r.pagina);
  const margins = obj(page.margenes_mm);
  const base = DEFAULT_PDF_DRAFT;
  const bare = Object.keys(r).length === 0;
  const texto = readType(r.texto, base.texto);
  const primary = typeof obj(r.tema).primario === "string" && /^#[0-9a-fA-F]{6}$/.test(obj(r.tema).primario as string) ? (obj(r.tema).primario as string) : null;
  // Una plantilla sin formato guardado no trae pie: la numeración por omisión solo se ofrece al activar el PDF.
  const footBase: PdfBand = bare ? base.pie : { ...base.pie, derecha: "" };
  return {
    activo: r.activo === true,
    tema: { activo: primary !== null, primario: primary ?? base.tema.primario },
    incluirAtributos: r.incluir_atributos === true,
    tamano: page.tamano === "a4" ? "a4" : "carta",
    margenes: Object.fromEntries(PDF_MARGINS.map((key) => [key, num(margins[key], base.margenes[key])])) as Record<PdfMargin, string>,
    encabezados: readHeadings(r.encabezados, texto, primary !== null),
    texto,
    encabezado: readBand(r.encabezado, texto, base.encabezado),
    pie: readBand(r.pie, texto, footBase),
    portada: readSheet(r.portada, base.portada),
    indice: { ...readSheet(r.indice, base.indice), titulo: str(obj(r.indice).titulo, base.indice.titulo), niveles: num(obj(r.indice).niveles, base.indice.niveles) },
  };
}

const toNumber = (text: string): number => (text.trim() === "" ? Number.NaN : Number(text));
const typeOut = (t: PdfType) => ({ familia: t.familia, tamano_pt: toNumber(t.tamano), color: t.color.trim() });
/** Encabezado de un nivel: el color "automático" no se guarda (lo da el tema). */
const headingOut = (t: PdfType) => ({ familia: t.familia, tamano_pt: toNumber(t.tamano), ...(t.color.trim() === "" ? {} : { color: t.color.trim() }) });
const lineOut = (l: PdfLine) => ({ activa: l.activa, color: l.color.trim(), grosor_pt: toNumber(l.grosor) });
const bandOut = (b: PdfBand) => ({
  izquierda: b.izquierda, centro: b.centro, derecha: b.derecha,
  fuente: typeOut(b.fuente), linea: lineOut(b.linea), distancia_mm: toNumber(b.distancia), sangria_mm: toNumber(b.sangria),
});

const sheetOut = (sheet: PdfSheet) => ({ fondo: sheet.fondo.trim(), imagen: sheet.imagen === "" ? null : sheet.imagen, color: sheet.color.trim() });

/** Borrador → `estilo.pdf`. Un borrador intacto (PDF apagado y sin tocar) se guarda como `{}`. El pie no lleva imagen. */
export function pdfDraftTo(draft: PdfDraft): Record<string, unknown> {
  if (JSON.stringify(draft) === JSON.stringify(DEFAULT_PDF_DRAFT)) return {};
  return {
    activo: draft.activo,
    ...(draft.tema.activo ? { tema: { primario: draft.tema.primario } } : {}),
    incluir_atributos: draft.incluirAtributos,
    pagina: {
      tamano: draft.tamano,
      margenes_mm: Object.fromEntries(PDF_MARGINS.map((key) => [key, toNumber(draft.margenes[key])])),
    },
    encabezados: Object.fromEntries(PDF_HEADING_LEVELS.map((level) => [level, headingOut(draft.encabezados[level])])),
    texto: typeOut(draft.texto),
    encabezado: { imagen: draft.encabezado.imagen === "" ? null : draft.encabezado.imagen, ...bandOut(draft.encabezado) },
    pie: bandOut(draft.pie),
    portada: sheetOut(draft.portada),
    indice: { ...sheetOut(draft.indice), titulo: draft.indice.titulo, niveles: toNumber(draft.indice.niveles) },
  };
}

/** Colores del tema del borrador, o `null` si no usa tema. Los mismos que imprime el servidor. */
export function themeColors(draft: PdfDraft): ThemeColors | null {
  return draft.tema.activo ? palette(draft.tema.primario, draft.texto.color) : null;
}

/** Color con el que se ve (y se imprime) un nivel de encabezado: el fijado a mano o, en automático, el del tema. */
export function headingColor(draft: PdfDraft, level: HeadingLevel): string {
  return draft.encabezados[level].color || themeColors(draft)?.[level] || DEFAULT_PDF_DRAFT.encabezados[level].color;
}
