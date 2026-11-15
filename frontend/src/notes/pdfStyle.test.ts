// H-036: borrador de estilo.pdf ↔ estilo.pdf guardado. Las derivaciones tienen que coincidir con las del servidor (`pdf_style.resolve`).
import { describe, expect, it } from "vitest";
import { palette } from "./colorTheme";
import { checkPdfStyle } from "./metaRules";
import { DEFAULT_PDF_DRAFT, headingColor, inheritedSheetStyle, pdfDraftFrom, pdfDraftTo, shownSheetStyle, themeColors } from "./pdfStyle";

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

describe("tema de color", () => {
  it("sin tema los encabezados son planos como antes y no hay colores de tema", () => {
    const draft = pdfDraftFrom({ activo: true, encabezados: { familia: "DejaVu Sans", tamano_pt: 18, color: "#111827" } });
    expect(draft.tema.activo).toBe(false);
    expect(themeColors(draft)).toBeNull();
    expect(["h1", "h2", "h3", "h4"].map((level) => draft.encabezados[level as "h1"].color)).toEqual(["#111827", "#111827", "#111827", "#111827"]);
    expect(pdfDraftTo(draft)).not.toHaveProperty("tema");
  });

  it("con tema, el color de los encabezados es siempre automático (uno fijado antes se ignora) y sale del tema", () => {
    const draft = pdfDraftFrom({ activo: true, tema: { primario: "#0c3897" }, encabezados: { h2: { familia: "DejaVu Sans", tamano_pt: 14, color: "#ff0000" } } });
    expect(draft.tema).toEqual({ activo: true, primario: "#0c3897" });
    expect(draft.encabezados.h1.color).toBe("");
    expect(draft.encabezados.h2.color).toBe(""); // uno fijado a mano antes se ignora
    const colors = palette("#0c3897", draft.texto.color);
    expect(headingColor(draft, "h1")).toBe(colors.h1);
    expect(headingColor(draft, "h2")).toBe(colors.h2);
    expect(headingColor(draft, "h3")).toBe(colors.h3);
  });

  it("guarda el tema y omite el color automático de los encabezados; el resultado es válido", () => {
    const draft = pdfDraftFrom({ activo: true, tema: { primario: "#7c3aed" } });
    const out = pdfDraftTo(draft) as Record<string, any>;
    expect(out.tema).toEqual({ primario: "#7c3aed" });
    for (const level of ["h1", "h2", "h3", "h4"]) expect(out.encabezados[level]).not.toHaveProperty("color");
    expect(checkPdfStyle(out)).toBe(true);
    expect(pdfDraftFrom(out)).toEqual(draft);
  });

  it("un primario guardado inválido se ignora", () => {
    expect(pdfDraftFrom({ tema: { primario: "azul" } }).tema.activo).toBe(false);
  });
});

describe("portada e índice (marcas pdf:portada y pdf:indice)", () => {
  it("el borrador los lee y los guarda con sus valores por omisión, y el servidor los acepta", () => {
    const draft = pdfDraftFrom({ activo: true, portada: { fondo: "#112233", imagen: "img-1" }, indice: { titulo: "Contenido", niveles: 2 } });
    expect(draft.portada).toEqual({ ...DEFAULT_PDF_DRAFT.portada, fondo: "#112233", imagen: "img-1" });
    expect(draft.indice).toEqual({ ...DEFAULT_PDF_DRAFT.indice, titulo: "Contenido", niveles: "2" });
    expect(draft.portada.personalizar).toBe(false);
    expect(draft.portada.imagenPrincipal).toBe(false);
    const saved = pdfDraftTo(draft) as Record<string, any>;
    expect(saved.portada).toEqual({
      fondo: "#112233", imagen: "img-1", imagen_principal: false, personalizar: false,
      encabezados: { familia: "DejaVu Sans", tamano_pt: 30, color: "#111827" }, texto: { familia: "DejaVu Sans", tamano_pt: 12, color: "#1f2937" },
    });
    expect(saved.indice).toMatchObject({ fondo: "#f1f5f9", imagen: null, titulo: "Contenido", niveles: 2 });
    expect(checkPdfStyle(saved)).toBe(true);
  });

  it("ida y vuelta con estilos propios y la imagen principal de las páginas", () => {
    const first = pdfDraftFrom({ activo: true });
    first.portada = { ...first.portada, imagenPrincipal: true, personalizar: true, encabezados: { familia: "Liberation Serif", tamano: "40", color: "#ff0000" }, texto: { familia: "Liberation Mono", tamano: "14", color: "#00ff00" } };
    const saved = pdfDraftTo(first) as Record<string, any>;
    expect(saved.portada).toMatchObject({ imagen_principal: true, personalizar: true, encabezados: { familia: "Liberation Serif", tamano_pt: 40, color: "#ff0000" } });
    expect(checkPdfStyle(saved)).toBe(true);
    expect(pdfDraftFrom(saved)).toEqual(first);
  });

  it("el formato anterior (un solo color) se lee como «personalizar» encendido con la tipografía del documento, igual que el servidor", () => {
    const draft = pdfDraftFrom({ texto: { familia: "Liberation Serif", tamano_pt: 11 }, encabezados: { h1: { familia: "Liberation Serif", tamano_pt: 20 } }, portada: { fondo: "#0f172a", color: "#f8fafc" }, indice: { color: "#1f2937" } });
    expect(draft.portada.personalizar).toBe(true);
    expect(draft.portada.encabezados).toEqual({ familia: "Liberation Serif", tamano: "20", color: "#f8fafc" });
    expect(draft.portada.texto).toEqual({ familia: "Liberation Serif", tamano: "11", color: "#f8fafc" });
    expect(draft.indice.personalizar).toBe(true);
    expect(pdfDraftFrom({ portada: { color: "#000000", personalizar: false } }).portada.personalizar).toBe(false);
    expect(checkPdfStyle({ portada: { fondo: "#000000", color: "#ffffff" } })).toBe(true);
  });

  it("sin personalizar, la hoja muestra los estilos del documento (H1 en la portada, H2 en el índice) y con ellos parte al personalizar", () => {
    const draft = pdfDraftFrom({ tema: { primario: "#0c3897" }, encabezados: { h1: { tamano_pt: 22 } } });
    expect(shownSheetStyle(draft, "portada").encabezados).toEqual({ ...draft.encabezados.h1, color: headingColor(draft, "h1") });
    expect(shownSheetStyle(draft, "indice").encabezados.tamano).toBe(draft.encabezados.h2.tamano);
    expect(inheritedSheetStyle(draft, "portada").texto).toEqual(draft.texto);
    const own = { ...draft, portada: { ...draft.portada, personalizar: true, encabezados: { familia: "Liberation Mono" as const, tamano: "9", color: "#123456" } } };
    expect(shownSheetStyle(own, "portada").encabezados.color).toBe("#123456");
  });

  it("el validador rechaza colores, niveles, títulos e interruptores fuera de regla", () => {
    expect(checkPdfStyle({ portada: { fondo: "rojo" } })).toBe(false);
    expect(checkPdfStyle({ portada: { otra: 1 } })).toBe(false);
    expect(checkPdfStyle({ portada: { personalizar: "si" } })).toBe(false);
    expect(checkPdfStyle({ portada: { imagen_principal: 1 } })).toBe(false);
    expect(checkPdfStyle({ portada: { encabezados: { familia: "Comic Sans" } } })).toBe(false);
    expect(checkPdfStyle({ portada: { texto: { tamano_pt: 200 } } })).toBe(false);
    expect(checkPdfStyle({ indice: { niveles: 0 } })).toBe(false);
    expect(checkPdfStyle({ indice: { niveles: 5 } })).toBe(false);
    expect(checkPdfStyle({ indice: { titulo: "x".repeat(81) } })).toBe(false);
    expect(checkPdfStyle({ indice: { titulo: "Índice", niveles: 4 }, portada: { imagen: null, imagen_principal: true, personalizar: true } })).toBe(true);
  });
});
