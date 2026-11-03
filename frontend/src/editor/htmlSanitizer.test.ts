// H-019: saneador de HTML del markdown con lista blanca, validador de URLs embebidas.
import { describe, expect, it } from "vitest";
import { isAllowedEmbedSrc, sanitizeHtmlFragment } from "./htmlSanitizer";

// Helper para acceder a innerHTML de un DocumentFragment.
function fragmentHTML(frag: DocumentFragment): string {
  const temp = document.createElement("div");
  temp.appendChild(frag.cloneNode(true));
  return temp.innerHTML;
}

describe("isAllowedEmbedSrc", () => {
  // Patrón a): synapse.cjhirashi.com/files/<uuid v4>
  it("admite https://synapse.cjhirashi.com/files/550e8400-e29b-41d4-a716-446655440000", () => {
    expect(isAllowedEmbedSrc("https://synapse.cjhirashi.com/files/550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("admite UUID en mayúsculas", () => {
    expect(isAllowedEmbedSrc("https://synapse.cjhirashi.com/files/550E8400-E29B-41D4-A716-446655440000")).toBe(true);
  });

  it("admite UUID mixto", () => {
    expect(isAllowedEmbedSrc("https://synapse.cjhirashi.com/files/550E8400-e29b-41d4-A716-446655440000")).toBe(true);
  });

  // Patrón b): files-synapse.cjhirashi.com con pathname seguro (sin ..)
  it("admite https://files-synapse.cjhirashi.com/documento.pdf", () => {
    expect(isAllowedEmbedSrc("https://files-synapse.cjhirashi.com/documento.pdf")).toBe(true);
  });

  it("rechaza en la ruta de files-synapse los caracteres ' ( ) * + , &", () => {
    for (const bad of ["'", "(", ")", "*", "+", ",", "&"]) {
      expect(isAllowedEmbedSrc(`https://files-synapse.cjhirashi.com/a${bad}b.html`)).toBe(false);
    }
  });

  it("admite https://files-synapse.cjhirashi.com/carpeta/archivo.txt", () => {
    expect(isAllowedEmbedSrc("https://files-synapse.cjhirashi.com/carpeta/archivo.txt")).toBe(true);
  });

  it("admite caracteres RFC3986 seguros en pathname", () => {
    expect(isAllowedEmbedSrc("https://files-synapse.cjhirashi.com/file-name_2.0~v1.pdf")).toBe(true);
  });

  it("admite pathname con porcentaje-encoded", () => {
    expect(isAllowedEmbedSrc("https://files-synapse.cjhirashi.com/file%20name.pdf")).toBe(true);
  });

  // Rechazos: protocolo, host, puertos, usuario/contraseña, query, hash, pathname inválido
  it("rechaza http:// (no https)", () => {
    expect(isAllowedEmbedSrc("http://synapse.cjhirashi.com/files/550e8400-e29b-41d4-a716-446655440000")).toBe(false);
  });

  it("rechaza otro host", () => {
    expect(isAllowedEmbedSrc("https://evil.com/files/550e8400-e29b-41d4-a716-446655440000")).toBe(false);
  });

  it("rechaza synapse.cjhirashi.com con puerto", () => {
    expect(isAllowedEmbedSrc("https://synapse.cjhirashi.com:8080/files/550e8400-e29b-41d4-a716-446655440000")).toBe(false);
  });

  it("rechaza files-synapse.cjhirashi.com con puerto", () => {
    expect(isAllowedEmbedSrc("https://files-synapse.cjhirashi.com:443/documento.pdf")).toBe(false);
  });

  it("rechaza usuario:contraseña en la URL", () => {
    expect(isAllowedEmbedSrc("https://user:pass@synapse.cjhirashi.com/files/550e8400-e29b-41d4-a716-446655440000")).toBe(false);
  });

  it("rechaza synapse.cjhirashi.com con pathname incorrecto", () => {
    expect(isAllowedEmbedSrc("https://synapse.cjhirashi.com/uploads/550e8400-e29b-41d4-a716-446655440000")).toBe(false);
  });

  it("rechaza synapse.cjhirashi.com/files/ con UUID incorrecto (no v4)", () => {
    expect(isAllowedEmbedSrc("https://synapse.cjhirashi.com/files/not-a-uuid")).toBe(false);
  });

  it("rechaza synapse.cjhirashi.com/files con query string", () => {
    expect(isAllowedEmbedSrc("https://synapse.cjhirashi.com/files/550e8400-e29b-41d4-a716-446655440000?v=1")).toBe(false);
  });

  it("rechaza synapse.cjhirashi.com/files con hash", () => {
    expect(isAllowedEmbedSrc("https://synapse.cjhirashi.com/files/550e8400-e29b-41d4-a716-446655440000#section")).toBe(false);
  });

  it("rechaza files-synapse.cjhirashi.com con query string", () => {
    expect(isAllowedEmbedSrc("https://files-synapse.cjhirashi.com/documento.pdf?download=true")).toBe(false);
  });

  it("rechaza files-synapse.cjhirashi.com con hash", () => {
    expect(isAllowedEmbedSrc("https://files-synapse.cjhirashi.com/documento.pdf#page=1")).toBe(false);
  });

  it("rechaza files-synapse.cjhirashi.com con .. en pathname", () => {
    expect(isAllowedEmbedSrc("https://files-synapse.cjhirashi.com/carpeta/../etc/passwd")).toBe(false);
  });

  it("rechaza javascript:", () => {
    expect(isAllowedEmbedSrc("javascript:alert(1)")).toBe(false);
  });

  it("rechaza data:", () => {
    expect(isAllowedEmbedSrc("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("rechaza synapse.cjhirashi.com.evil.com (subdomain spoofing)", () => {
    expect(isAllowedEmbedSrc("https://synapse.cjhirashi.com.evil.com/files/550e8400-e29b-41d4-a716-446655440000")).toBe(false);
  });

  it("rechaza ?https://synapse.cjhirashi.com (query parameter smuggling)", () => {
    expect(isAllowedEmbedSrc("https://evil.com/?https://synapse.cjhirashi.com/files/550e8400-e29b-41d4-a716-446655440000")).toBe(false);
  });

  it("no lanza excepción con URL inválida", () => {
    expect(() => isAllowedEmbedSrc(":::invalid-url")).not.toThrow();
    expect(isAllowedEmbedSrc(":::invalid-url")).toBe(false);
  });

  it("no lanza excepción con string vacío", () => {
    expect(() => isAllowedEmbedSrc("")).not.toThrow();
    expect(isAllowedEmbedSrc("")).toBe(false);
  });
});

describe("sanitizeHtmlFragment", () => {
  it("quita los atributos data-* y aria-* (solo open, title y el src del iframe sobreviven)", () => {
    const frag = sanitizeHtmlFragment('<span data-x="1" aria-label="a" title="t">hola</span>');
    const span = frag.querySelector("span");
    expect(span?.getAttributeNames()).toEqual(["title"]);
  });

  // Etiquetas permitidas pasan
  it("preserva <br>", () => {
    const result = sanitizeHtmlFragment("Línea 1<br>Línea 2");
    expect(result.textContent).toContain("Línea 1");
    expect(result.textContent).toContain("Línea 2");
    expect(fragmentHTML(result)).toContain("<br");
  });

  it("preserva <sub> y <sup>", () => {
    const result = sanitizeHtmlFragment("H<sub>2</sub>O y E=mc<sup>2</sup>");
    expect(fragmentHTML(result)).toContain("<sub>");
    expect(fragmentHTML(result)).toContain("<sup>");
  });

  it("preserva <mark>", () => {
    const result = sanitizeHtmlFragment("texto <mark>resaltado</mark>");
    expect(fragmentHTML(result)).toContain("<mark>");
  });

  it("preserva <kbd>", () => {
    const result = sanitizeHtmlFragment("presiona <kbd>Enter</kbd>");
    expect(fragmentHTML(result)).toContain("<kbd>");
  });

  it("preserva <small>", () => {
    const result = sanitizeHtmlFragment("<small>nota al pie</small>");
    expect(fragmentHTML(result)).toContain("<small>");
  });

  it("preserva <del> e <ins>", () => {
    const result = sanitizeHtmlFragment("Se <del>eliminó</del> <ins>añadió</ins> esto");
    expect(fragmentHTML(result)).toContain("<del>");
    expect(fragmentHTML(result)).toContain("<ins>");
  });

  it("preserva <span>", () => {
    const result = sanitizeHtmlFragment("<span>contenido</span>");
    expect(fragmentHTML(result)).toContain("<span>");
  });

  it("preserva <div>", () => {
    const result = sanitizeHtmlFragment("<div>contenido en bloque</div>");
    expect(fragmentHTML(result)).toContain("<div>");
  });

  it("preserva <details> y <summary>", () => {
    const result = sanitizeHtmlFragment("<details><summary>Expandir</summary>Contenido</details>");
    expect(fragmentHTML(result)).toContain("<details>");
    expect(fragmentHTML(result)).toContain("<summary>");
  });

  it("preserva <iframe> con src válido (patrón a)", () => {
    const result = sanitizeHtmlFragment('<iframe src="https://synapse.cjhirashi.com/files/550e8400-e29b-41d4-a716-446655440000"></iframe>');
    expect(fragmentHTML(result)).toContain('<iframe');
    expect(fragmentHTML(result)).toContain('src=');
  });

  it("preserva <iframe> con src válido (patrón b)", () => {
    const result = sanitizeHtmlFragment('<iframe src="https://files-synapse.cjhirashi.com/documento.pdf"></iframe>');
    expect(fragmentHTML(result)).toContain('<iframe');
    expect(fragmentHTML(result)).toContain('src=');
  });

  // Atributos de iframe
  it("añade sandbox=\"allow-scripts\" al iframe válido", () => {
    const result = sanitizeHtmlFragment('<iframe src="https://synapse.cjhirashi.com/files/550e8400-e29b-41d4-a716-446655440000"></iframe>');
    expect(fragmentHTML(result)).toContain('sandbox="allow-scripts"');
  });

  it("reemplaza sandbox existente con sandbox=\"allow-scripts\"", () => {
    const result = sanitizeHtmlFragment('<iframe src="https://synapse.cjhirashi.com/files/550e8400-e29b-41d4-a716-446655440000" sandbox="allow-same-origin allow-scripts"></iframe>');
    expect(fragmentHTML(result)).toContain('sandbox="allow-scripts"');
    expect(fragmentHTML(result)).not.toContain("allow-same-origin");
  });

  it("añade referrerpolicy=\"no-referrer\" al iframe", () => {
    const result = sanitizeHtmlFragment('<iframe src="https://synapse.cjhirashi.com/files/550e8400-e29b-41d4-a716-446655440000"></iframe>');
    expect(fragmentHTML(result)).toContain('referrerpolicy="no-referrer"');
  });

  it("añade loading=\"lazy\" al iframe", () => {
    const result = sanitizeHtmlFragment('<iframe src="https://synapse.cjhirashi.com/files/550e8400-e29b-41d4-a716-446655440000"></iframe>');
    expect(fragmentHTML(result)).toContain('loading="lazy"');
  });

  it("elimina srcdoc de iframe", () => {
    const result = sanitizeHtmlFragment('<iframe src="https://synapse.cjhirashi.com/files/550e8400-e29b-41d4-a716-446655440000" srcdoc="<h1>Hola</h1>"></iframe>');
    expect(fragmentHTML(result)).not.toContain("srcdoc");
  });

  it("elimina allow de iframe", () => {
    const result = sanitizeHtmlFragment('<iframe src="https://synapse.cjhirashi.com/files/550e8400-e29b-41d4-a716-446655440000" allow="camera"></iframe>');
    expect(fragmentHTML(result)).not.toContain("allow=");
  });

  it("elimina allowfullscreen de iframe", () => {
    const result = sanitizeHtmlFragment('<iframe src="https://synapse.cjhirashi.com/files/550e8400-e29b-41d4-a716-446655440000" allowfullscreen></iframe>');
    expect(fragmentHTML(result)).not.toContain("allowfullscreen");
  });

  // Atributos permitidos en otras etiquetas
  it("permite atributo 'open' en <details>", () => {
    const result = sanitizeHtmlFragment("<details open><summary>Abierto</summary>Contenido</details>");
    expect(fragmentHTML(result)).toContain("open");
  });

  it("permite atributo 'title' en etiquetas", () => {
    const result = sanitizeHtmlFragment('<span title="Tooltip">Texto</span>');
    expect(fragmentHTML(result)).toContain("title");
  });

  // Rechazo: etiquetas prohibidas
  it("elimina <script>", () => {
    const result = sanitizeHtmlFragment('<script>alert(1)</script>texto');
    expect(fragmentHTML(result)).not.toContain("<script");
    expect(result.textContent).toContain("texto");
  });

  it("elimina <style>", () => {
    const result = sanitizeHtmlFragment("<style>body { color: red; }</style>texto");
    expect(fragmentHTML(result)).not.toContain("<style");
    expect(result.textContent).toContain("texto");
  });

  it("elimina <img>", () => {
    const result = sanitizeHtmlFragment('Antes<img src="x">Después');
    expect(fragmentHTML(result)).not.toContain("<img");
    expect(result.textContent).toContain("Antes");
    expect(result.textContent).toContain("Después");
  });

  it("elimina <a>", () => {
    const result = sanitizeHtmlFragment('<a href="https://example.com">enlace</a>');
    expect(fragmentHTML(result)).not.toContain("<a");
    expect(result.textContent).toContain("enlace");
  });

  it("elimina <form>", () => {
    const result = sanitizeHtmlFragment("<form><input type=\"text\"></form>");
    expect(fragmentHTML(result)).not.toContain("<form");
  });

  it("elimina <svg>", () => {
    const result = sanitizeHtmlFragment('<svg><circle r="10"></circle></svg>');
    expect(fragmentHTML(result)).not.toContain("<svg");
  });

  it("elimina <math>", () => {
    const result = sanitizeHtmlFragment("<math><mi>x</mi></math>");
    expect(fragmentHTML(result)).not.toContain("<math");
  });

  // Rechazo: atributos prohibidos
  it("elimina atributos onclick", () => {
    const result = sanitizeHtmlFragment('<div onclick="alert(1)">Click</div>');
    expect(fragmentHTML(result)).not.toContain("onclick");
    expect(result.textContent).toContain("Click");
  });

  it("elimina atributos onerror", () => {
    const result = sanitizeHtmlFragment('<img onerror="alert(1)" src="x">');
    expect(fragmentHTML(result)).not.toContain("onerror");
  });

  it("elimina atributo style", () => {
    const result = sanitizeHtmlFragment('<div style="color: red">Texto</div>');
    expect(fragmentHTML(result)).not.toContain("style");
    expect(result.textContent).toContain("Texto");
  });

  it("elimina atributo class", () => {
    const result = sanitizeHtmlFragment('<div class="danger">Texto</div>');
    expect(fragmentHTML(result)).not.toContain("class");
    expect(result.textContent).toContain("Texto");
  });

  it("elimina javascript: en atributos", () => {
    const result = sanitizeHtmlFragment('<button onclick="javascript:alert(1)">Botón</button>');
    expect(fragmentHTML(result)).not.toContain("javascript:");
  });

  // iframe con src prohibido
  it("elimina iframe con src http://", () => {
    const result = sanitizeHtmlFragment('<iframe src="http://synapse.cjhirashi.com/files/550e8400-e29b-41d4-a716-446655440000"></iframe>');
    expect(fragmentHTML(result)).not.toContain("<iframe");
  });

  it("elimina iframe con src en otro host", () => {
    const result = sanitizeHtmlFragment('<iframe src="https://evil.com/archivo"></iframe>');
    expect(fragmentHTML(result)).not.toContain("<iframe");
  });

  it("elimina iframe con src type javascript:", () => {
    const result = sanitizeHtmlFragment('<iframe src="javascript:alert(1)"></iframe>');
    expect(fragmentHTML(result)).not.toContain("<iframe");
  });

  it("elimina iframe con src type data:", () => {
    const result = sanitizeHtmlFragment('<iframe src="data:text/html,<script>alert(1)</script>"></iframe>');
    expect(fragmentHTML(result)).not.toContain("<iframe");
  });

  it("elimina iframe con src con query string", () => {
    const result = sanitizeHtmlFragment('<iframe src="https://synapse.cjhirashi.com/files/550e8400-e29b-41d4-a716-446655440000?v=1"></iframe>');
    expect(fragmentHTML(result)).not.toContain("<iframe");
  });

  it("elimina iframe con src con puerto", () => {
    const result = sanitizeHtmlFragment('<iframe src="https://synapse.cjhirashi.com:8080/files/550e8400-e29b-41d4-a716-446655440000"></iframe>');
    expect(fragmentHTML(result)).not.toContain("<iframe");
  });

  it("elimina iframe con src con usuario:contraseña", () => {
    const result = sanitizeHtmlFragment('<iframe src="https://user:pass@synapse.cjhirashi.com/files/550e8400-e29b-41d4-a716-446655440000"></iframe>');
    expect(fragmentHTML(result)).not.toContain("<iframe");
  });

  // Características de DOMPurify
  it("devuelve un DocumentFragment", () => {
    const result = sanitizeHtmlFragment("<p>Texto</p>");
    expect(result).toBeInstanceOf(DocumentFragment);
  });

  it("es idempotente: sanitizar dos veces da el mismo resultado", () => {
    const html = '<div onclick="alert(1)"><span title="ok">Texto</span></div>';
    const once = sanitizeHtmlFragment(html);
    const html2 = fragmentHTML(once);
    const twice = sanitizeHtmlFragment(html2);
    expect(fragmentHTML(once)).toBe(fragmentHTML(twice));
  });

  it("mezcla de etiquetas permitidas y prohibidas", () => {
    const result = sanitizeHtmlFragment("<p><b>Negrita</b> <script>alert(1)</script> <mark>marca</mark></p>");
    expect(result.textContent).toContain("Negrita");
    expect(result.textContent).toContain("marca");
    expect(fragmentHTML(result)).not.toContain("<script");
    expect(fragmentHTML(result)).not.toContain("<b>");
  });

  // H-025 PASO 3: YouTube embeds
  it("conserva iframe de YouTube nocookie con src válido", () => {
    const result = sanitizeHtmlFragment('<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"></iframe>');
    expect(fragmentHTML(result)).toContain('<iframe');
    expect(fragmentHTML(result)).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
  });

  it("normaliza iframe de YouTube nocookie a atributos exactos (sandbox, allow, allowfullscreen)", () => {
    const result = sanitizeHtmlFragment('<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"></iframe>');
    const html = fragmentHTML(result);
    expect(html).toContain('sandbox="allow-scripts allow-same-origin allow-presentation"');
    expect(html).toContain('allow="fullscreen"');
    expect(html).toContain('allowfullscreen');
    expect(html).toContain('referrerpolicy="strict-origin-when-cross-origin"');
    expect(html).not.toContain('no-referrer');
    expect(html).toContain('loading="lazy"');
  });

  it("los iframes que no son de YouTube siguen con referrerpolicy=\"no-referrer\"", () => {
    const html = fragmentHTML(sanitizeHtmlFragment('<iframe src="https://synapse.cjhirashi.com/files/550e8400-e29b-41d4-a716-446655440000" referrerpolicy="unsafe-url"></iframe>'));
    expect(html).toContain('referrerpolicy="no-referrer"');
    expect(html).not.toContain("unsafe-url");
  });

  it("conserva parámetro start= en YouTube", () => {
    const result = sanitizeHtmlFragment('<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90"></iframe>');
    const html = fragmentHTML(result);
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90"');
  });

  it("elimina iframe con src youtube.com/embed (no nocookie)", () => {
    const result = sanitizeHtmlFragment('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>');
    expect(fragmentHTML(result)).not.toContain("<iframe");
  });

  it("elimina iframe con parámetros extra en YouTube", () => {
    const result = sanitizeHtmlFragment('<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90&rel=0"></iframe>');
    expect(fragmentHTML(result)).not.toContain("<iframe");
  });

  it("elimina iframe con dominio parecido a YouTube (youtube-nocookie.com.evil.com)", () => {
    const result = sanitizeHtmlFragment('<iframe src="https://youtube-nocookie.com.evil.com/embed/dQw4w9WgXcQ"></iframe>');
    expect(fragmentHTML(result)).not.toContain("<iframe");
  });

  it("iframe de Synapse sigue con sandbox=\"allow-scripts\" solo (sin allow-same-origin)", () => {
    const result = sanitizeHtmlFragment('<iframe src="https://synapse.cjhirashi.com/files/550e8400-e29b-41d4-a716-446655440000" sandbox="allow-same-origin allow-scripts" allow="fullscreen" allowfullscreen></iframe>');
    const html = fragmentHTML(result);
    expect(html).toContain('sandbox="allow-scripts"');
    expect(html).not.toContain('allow-same-origin');
    expect(html).not.toContain('allow=');
    expect(html).not.toContain('allowfullscreen');
  });

  it("no acepta <script> junto a iframe de YouTube", () => {
    const result = sanitizeHtmlFragment('<script>alert(1)</script><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"></iframe>');
    const html = fragmentHTML(result);
    expect(html).not.toContain("<script");
    expect(html).toContain("<iframe");
  });
});
