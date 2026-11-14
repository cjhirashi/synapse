// H-036: borrador de estilo.pdf ↔ estilo.pdf guardado. Las derivaciones tienen que coincidir con las del servidor (`pdf_style.resolve`).
import { describe, expect, it } from "vitest";
import { checkPdfStyle } from "./metaRules";
import { DEFAULT_PDF_DRAFT, pdfDraftFrom, pdfDraftTo } from "./pdfStyle";

describe("pdfDraftFrom", () => {
  it("una plantilla sin formato da el borrador por omisión (y se guarda como {})", () => {
    const draft = pdfDraftFrom({});
    expect(draft).toEqual(DEFAULT_PDF_DRAFT);
    expect(pdfDraftTo(draft)).toEqual({});
  });

  it("el formato anterior (encabezados planos) es H1 y deriva H2 a H4 como el servidor", () => {
    const draft = pdfDraftFrom({ encabezados: { familia: "Liberation Serif", tamano_pt: 20, color: "#0c3897" }, texto: { familia: "Liberation Serif", tamano_pt: 10.5 } });
    expect(draft.encabezados.h1).toEqual({ familia: "Liberation Serif", tamano: "20", color: "#0c3897" });
    expect(["h2", "h3", "h4"].map((level) => draft.encabezados[level as "h2"].tamano)).toEqual(["16.4", "13.6", "11.6"]);
    expect(draft.encabezados.h4.color).toBe("#0c3897");
  });

  it("H4 no baja del tamaño del texto", () => {
    expect(pdfDraftFrom({ encabezados: { tamano_pt: 12 }, texto: { tamano_pt: 10.5 } }).encabezados.h4.tamano).toBe("10.5");
  });

  it("la fuente del encabezado y del pie parte del texto (a 0,82) y el pie conserva su línea; el encabezado, no", () => {
    const draft = pdfDraftFrom({ activo: true, texto: { familia: "Liberation Serif", tamano_pt: 10 } });
    expect(draft.encabezado.fuente).toEqual({ familia: "Liberation Serif", tamano: "8.2", color: "#475569" });
    expect(draft.encabezado.linea.activa).toBe(false);
    expect(draft.pie.linea.activa).toBe(true);
    expect([draft.encabezado.distancia, draft.encabezado.sangria]).toEqual(["10", "0"]);
  });

  it("lee los valores guardados de las bandas", () => {
    const draft = pdfDraftFrom({ activo: true, encabezado: { fuente: { familia: "DejaVu Serif", tamano_pt: 14, color: "#b91c1c" }, linea: { activa: true, color: "#b91c1c", grosor_pt: 2 }, distancia_mm: 6, sangria_mm: 12 } });
    expect(draft.encabezado).toMatchObject({ fuente: { familia: "DejaVu Serif", tamano: "14", color: "#b91c1c" }, linea: { activa: true, color: "#b91c1c", grosor: "2" }, distancia: "6", sangria: "12" });
  });
});

describe("pdfDraftTo", () => {
  it("escribe los cuatro niveles, la fuente y la línea de cada banda, y el pie sin imagen; el resultado es válido", () => {
    const draft = pdfDraftFrom({ activo: true, encabezado: { imagen: "bg-1", izquierda: "{{titulo}}" } });
    draft.encabezados.h2 = { familia: "Liberation Mono", tamano: "13", color: "#047857" };
    draft.pie.linea = { activa: false, color: "#000000", grosor: "1.5" };
    const out = pdfDraftTo(draft) as Record<string, any>;
    expect(Object.keys(out.encabezados)).toEqual(["h1", "h2", "h3", "h4"]);
    expect(out.encabezados.h2).toEqual({ familia: "Liberation Mono", tamano_pt: 13, color: "#047857" });
    expect(out.encabezado).toMatchObject({ imagen: "bg-1", izquierda: "{{titulo}}", distancia_mm: 10, sangria_mm: 0, linea: { activa: false, grosor_pt: 0.6 } });
    expect(out.pie.linea).toEqual({ activa: false, color: "#000000", grosor_pt: 1.5 });
    expect("imagen" in out.pie).toBe(false);
    expect(checkPdfStyle(out)).toBe(true);
  });

  it("ida y vuelta: lo que se guarda se vuelve a leer igual", () => {
    const first = pdfDraftFrom({ activo: true, pagina: { tamano: "a4" }, encabezados: { familia: "DejaVu Serif", tamano_pt: 22, color: "#112233" } });
    expect(pdfDraftFrom(pdfDraftTo(first))).toEqual(first);
  });
});
