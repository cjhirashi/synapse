// H-036: HTML imprimible de Lectura — recuadros para lo interactivo, SVG a imagen, controles fuera, imágenes propias reconocibles.
import { describe, expect, it } from "vitest";
import { buildPdfHtml, embedLink, normalizeImageSrc } from "./pdfHtml";

const ORIGIN = "https://synapse.test";

function html(inner: string): string {
  const root = document.createElement("div");
  root.innerHTML = inner;
  return buildPdfHtml(root, ORIGIN);
}

describe("buildPdfHtml", () => {
  it("pasa la fila de encabezados de cada tabla a thead (el PDF la repite al seguir en otra página), detrás del colgroup", () => {
    const out = html('<div class="note-table-scroll"><table><colgroup><col><col></colgroup><tbody><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></tbody></table></div>'
      + "<table><tbody><tr><td>sin</td><td>cabecera</td></tr></tbody></table><table><thead><tr><th>X</th></tr></thead><tbody><tr><td>y</td></tr></tbody></table>");
    expect(out).toContain("<colgroup><col /><col /></colgroup><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody>");
    expect(out).toContain("<table><tbody><tr><td>sin</td><td>cabecera</td></tr></tbody></table>");
    expect(out.match(/<thead>/g)).toHaveLength(2);
  });

  it("convierte las marcas de índice y de salto en los marcadores que el servidor reconoce y deja la portada, la alineación y las columnas", () => {
    const out = html('<section class="pdf-portada" data-pdf-label="Portada"><h1>T</h1></section><div class="pdf-mark" data-pdf-mark="indice" data-pdf-label="Índice"></div>'
      + '<div align="center" data-pdf-label="x"><p>a</p></div><div class="cols-2" data-pdf-label="2 columnas"><p>b</p></div><div class="pdf-mark" data-pdf-mark="salto"></div>');
    expect(out).toContain('<div class="pdf-indice"></div>');
    expect(out).toContain('<div class="pdf-salto"></div>');
    expect(out).toContain('<section class="pdf-portada"');
    expect(out).toContain('align="center"');
    expect(out).toContain('class="cols-2"');
    expect(out).not.toContain("pdf-mark");
  });

  it("sustituye un iframe de YouTube por un recuadro con el enlace del video", () => {
    const out = html('<p>antes</p><div class="md-embed md-embed-video"><div class="md-embed-frame"><iframe title="Mi video" src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=30"></iframe></div><a class="md-embed-link" href="x">Abrir en YouTube</a></div>');
    expect(out).not.toContain("iframe");
    expect(out).toContain('class="pdf-embed"');
    expect(out).toContain("Mi video");
    expect(out).toContain("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(out).toContain("<p>antes</p>");
  });

  it("un diagrama incrustado con ruta propia lleva el enlace absoluto; uno en línea avisa que es interactivo", () => {
    const out = html('<div class="md-embed"><div class="md-embed-open-wrap"><iframe src="/files/abc-1"></iframe><a class="md-embed-open" href="/files/abc-1">abrir</a></div></div><div class="md-embed"><iframe srcdoc="<b>x</b>"></iframe></div>');
    expect(out).toContain(`${ORIGIN}/files/abc-1`);
    expect(out).toContain("Contenido interactivo");
    expect(out.match(/pdf-embed/g)).toHaveLength(2);
    expect(out).not.toContain("md-embed-open");
  });

  it("video y audio pasan a recuadro", () => {
    const out = html('<video src="https://cdn.test/v.mp4"></video><audio><source src="/files/au-1"></audio>');
    expect(out).toContain("https://cdn.test/v.mp4");
    expect(out).toContain(`${ORIGIN}/files/au-1`);
    expect(out).not.toMatch(/<video|<audio/);
  });

  it("convierte un SVG (Mermaid) en imagen y quita los controles de la interfaz", () => {
    const out = html('<div><svg viewBox="0 0 10 10" aria-label="Flujo"><rect width="5" height="5"/></svg><button>Copiar</button><input type="checkbox"><script>x()</script></div>');
    expect(out).toContain('<img src="data:image/svg+xml;base64,');
    expect(out).toContain('alt="Flujo"');
    expect(out).not.toMatch(/<svg|<button|<input|<script/);
  });

  it("deja las imágenes propias como /files/<id> y no toca el DOM original", () => {
    const root = document.createElement("div");
    root.innerHTML = `<img src="${ORIGIN}/files/img-9?v=2"><iframe src="https://x.test"></iframe>`;
    const out = buildPdfHtml(root, ORIGIN);
    expect(out).toContain('src="/files/img-9"');
    expect(root.querySelector("iframe")).not.toBeNull();
  });
});

describe("listas de tareas", () => {
  it("la casilla de Lectura pasa a ☑ o ☐ al inicio de la tarea y el elemento no duplica la viñeta", () => {
    const out = html(
      '<ul><li class="note-task" data-checked="true"><span class="note-task-slot"><span class="note-task-mark" role="img" aria-label="Completada"></span></span><div class="note-task-body"><p>Revisar el plan</p></div><span class="sr-only" role="status"></span></li>'
      + '<li class="note-task" data-checked="false"><span class="note-task-slot"><span class="note-task-mark" role="img" aria-label="Pendiente"></span></span><div class="note-task-body"><p>Confirmar accesos</p></div></li>'
      + "<li>Elemento normal</li></ul>");
    expect(out).toContain("<p>☑ Revisar el plan</p>");
    expect(out).toContain("<p>☐ Confirmar accesos</p>");
    expect(out).toContain("<li>Elemento normal</li>");
    expect(out).not.toMatch(/note-task-slot|note-task-body|sr-only|role="img"/);
  });
});

describe("enlaces e imágenes", () => {
  it("normalizeImageSrc y embedLink", () => {
    expect(normalizeImageSrc("/files/a?x=1", ORIGIN)).toBe("/files/a");
    expect(normalizeImageSrc("https://otro.test/p.png", ORIGIN)).toBe("https://otro.test/p.png");
    // «Copiar link» de Archivos: absoluto con el dominio de producción, aunque la app se abra por otro nombre.
    expect(normalizeImageSrc("https://synapse.cjhirashi.com/files/abc-1?x=1", "http://localhost:5173")).toBe("/files/abc-1");
    expect(embedLink(null, ORIGIN)).toBeNull();
    expect(embedLink("javascript:alert(1)", ORIGIN)).toBeNull();
    expect(embedLink("data:text/html,x", ORIGIN)).toBeNull();
    expect(embedLink("https://a.test/d", ORIGIN)).toBe("https://a.test/d");
  });
});
