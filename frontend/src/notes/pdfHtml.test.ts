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
