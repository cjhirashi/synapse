// H-019: saneador de HTML del markdown con lista blanca, validador de URLs embebidas.
import DOMPurify from "dompurify";

export function isAllowedEmbedSrc(src: string): boolean {
  try {
    const url = new URL(src);

    // Requiere https, sin usuario/contraseña, sin puerto.
    if (url.protocol !== "https:") return false;
    if (url.username || url.password) return false;
    if (url.port) return false;
    // Detectar puerto explícito en la URL original (incluyendo puertos por defecto como :443).
    // La parte host está entre // y el primer / o fin de la cadena.
    const hostPart = src.split("/").slice(2, 3)[0];
    if (hostPart?.includes(":")) return false;

    // Patrón a): synapse.cjhirashi.com/files/<uuid v4>, sin query ni hash.
    if (url.origin === "https://synapse.cjhirashi.com") {
      if (url.search || url.hash) return false;
      const match = url.pathname.match(/^\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
      return !!match;
    }

    // Patrón b): files-synapse.cjhirashi.com con pathname seguro, sin query ni hash.
    if (url.origin === "https://files-synapse.cjhirashi.com") {
      if (url.search || url.hash) return false;
      // Verificar .. en la URL original (URL.pathname normaliza, eliminando ..).
      if (src.includes("/..")) return false;
      // RFC3986 unreserved + percent-encoded + forward slash (para directorios).
      const validPathPattern = /^\/[A-Za-z0-9._~%/-]+$/;
      return validPathPattern.test(url.pathname);
    }

    return false;
  } catch {
    return false;
  }
}

export function sanitizeHtmlFragment(html: string): DocumentFragment {
  // Instancia propia para no compartir configuración con otros usos de DOMPurify.
  const purifier = DOMPurify(window);

  const fragment = purifier.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    ALLOWED_TAGS: ["br", "sub", "sup", "mark", "kbd", "small", "del", "ins", "span", "div", "details", "summary", "iframe"],
    ALLOWED_ATTR: ["open", "title", "src", "sandbox", "referrerpolicy", "loading"],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    FORCE_BODY: false,
  }) as DocumentFragment;

  // El src se valida aquí, tras DOMPurify: un iframe sin src permitido se elimina y los demás salen con atributos fijos.
  const iframes = fragment.querySelectorAll("iframe");
  Array.from(iframes).forEach((iframe) => {
    const src = iframe.getAttribute("src");
    if (!src || !isAllowedEmbedSrc(src)) {
      iframe.remove();
    } else {
      iframe.setAttribute("sandbox", "allow-scripts");
      iframe.setAttribute("referrerpolicy", "no-referrer");
      iframe.setAttribute("loading", "lazy");
    }
  });

  return fragment;
}
