import { describe, expect, it } from "vitest";
import { blockTags, groupBlocks, markTag, parseOpening } from "./pdfBlocks";

type N = { type: string; value?: string; children?: N[]; kind?: string };
const html = (value: string): N => ({ type: "html", value });
const text = (value: string): N => ({ type: "paragraph", children: [{ type: "text", value }] });
const wrapped = (value: string): N => ({ type: "paragraph", children: [html(value)] });

describe("marcas de formato del documento", () => {
  it("reconoce las aperturas y escribe de vuelta las mismas etiquetas", () => {
    for (const [open, kind, value] of [['<div align="justify">', "align", "justify"], ['<div class="cols-3">', "cols", "3"], ["<!--pdf:portada-->", "cover", ""]] as const) {
      expect(parseOpening(open)).toEqual({ kind, value });
    }
    expect(parseOpening('<div align="evil">')).toBeNull();
    expect(parseOpening('<div class="cols-5">')).toBeNull();
    expect(blockTags("align", "center")).toEqual(['<div align="center">', "</div>"]);
    expect(blockTags("cols", "2")).toEqual(['<div class="cols-2">', "</div>"]);
    expect(blockTags("cover", "")).toEqual(["<!-- pdf:portada -->", "<!-- /pdf:portada -->"]);
    expect(markTag("indice")).toBe("<!-- pdf:indice -->");
  });

  it("agrupa lo que hay entre la apertura y el cierre, con HTML suelto o envuelto en párrafo, y anida", () => {
    const out = groupBlocks([html('<div align="center">'), text("a"), wrapped('<div class="cols-2">'), text("b"), wrapped("</div>"), html("</div>"), text("fuera")]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ type: "pdfBlock", kind: "align", value: "center" });
    expect(out[0].children?.[1]).toMatchObject({ type: "pdfBlock", kind: "cols", value: "2" });
    expect(out[1]).toEqual(text("fuera"));
  });

  it("la portada cierra con su comentario y las marcas de una línea quedan como marca", () => {
    const out = groupBlocks([html("<!-- pdf:portada -->"), text("t"), html("<!-- /pdf:portada -->"), html("<!-- pdf:indice -->"), wrapped("<!--pdf:salto-->")]);
    expect(out[0]).toMatchObject({ type: "pdfBlock", kind: "cover" });
    expect(out.slice(1)).toEqual([{ type: "pdfMark", kind: "indice" }, { type: "pdfMark", kind: "salto" }]);
  });

  it("una apertura sin cierre se deja como HTML y un contenedor vacío conserva un párrafo", () => {
    expect(groupBlocks([html('<div align="right">'), text("x")])).toEqual([html('<div align="right">'), text("x")]);
    expect(groupBlocks([html('<div align="right">'), html("</div>")])[0].children).toEqual([{ type: "paragraph", children: [] }]);
  });

  it("el comentario lleva autor y fecha opcionales, valida su forma y se escribe de vuelta igual", () => {
    expect(parseOpening('<div class="comentario" data-autor="aira" data-fecha="2026-11-15">')).toEqual({ kind: "comment", value: "aira", date: "2026-11-15" });
    expect(parseOpening('<div class="comentario" data-autor="usuario">')).toEqual({ kind: "comment", value: "usuario", date: "" });
    expect(parseOpening('<div class="comentario">')).toEqual({ kind: "comment", value: "", date: "" });
    for (const bad of ['<div class="comentario" data-autor="A b">', '<div class="comentario" data-autor="x" onclick="y">', '<div class="comentario" data-fecha="15/11/2026">', '<div class="comentarios">']) {
      expect(parseOpening(bad)).toBeNull();
    }
    expect(blockTags("comment", "aira", "2026-11-15")).toEqual(['<div class="comentario" data-autor="aira" data-fecha="2026-11-15">', "</div>"]);
    expect(blockTags("comment", "usuario")).toEqual(['<div class="comentario" data-autor="usuario">', "</div>"]);
    const out = groupBlocks([html('<div class="comentario" data-autor="aira" data-fecha="2026-11-15">'), text("revisa la sección 3"), wrapped('<div align="center">'), text("x"), html("</div>"), html("</div>"), text("fuera")]);
    expect(out[0]).toMatchObject({ type: "pdfBlock", kind: "comment", value: "aira", date: "2026-11-15" });
    expect(out[0].children?.[1]).toMatchObject({ type: "pdfBlock", kind: "align", value: "center" });
    expect(out[1]).toEqual(text("fuera"));
  });
});
