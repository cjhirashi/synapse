/**
 * HTML de un documento para convertirlo en PDF (H-036): toma lo que la app dibuja en Lectura y lo deja imprimible.
 * Los iframes (YouTube, diagramas Archify, Plotly), los videos y el audio no se pueden imprimir: se sustituyen por un recuadro con el
 * título y el enlace (P2 de la slice). Las figuras SVG (p. ej. Mermaid) pasan a imagen `data:`; los controles de la interfaz se quitan.
 * El servidor vuelve a limpiar todo esto: aquí solo se arma, no se confía.
 */
import { parseYoutubeEmbedSrc, youtubeWatchUrl } from "../editor/classifyUrl";
import { FILE_URL_BASE } from "../files/uploadFile";

const CONTROLS = "button, input, textarea, select, script, style, link, .md-embed-open, .md-embed-link, [contenteditable='false'] > .md-embed-open-wrap > a";

/** Ruta de la app de un archivo propio (`/files/<id>`), o la URL sin tocar. Así el servidor puede reconocer sus imágenes. */
export function normalizeImageSrc(src: string, origin: string): string {
  // El enlace «Copiar link» de Archivos es absoluto (`FILE_URL_BASE`) aunque la app se abra por otro nombre.
  for (const base of [`${origin}/files/`, `${FILE_URL_BASE}/`]) if (src.startsWith(base)) return `/files/${src.slice(base.length).split(/[?#]/)[0]}`;
  if (src.startsWith("/files/")) return src.split(/[?#]/)[0];
  return src;
}

/** Enlace legible de un recurso incrustado, o `null` si no tiene (contenido en línea). */
export function embedLink(src: string | null, origin: string): string | null {
  if (!src) return null;
  const youtube = parseYoutubeEmbedSrc(src);
  if (youtube) return youtubeWatchUrl(youtube.id, youtube.start);
  if (src.startsWith("/")) return `${origin}${src}`;
  return /^https?:\/\//i.test(src) ? src : null;
}

function placeholder(doc: Document, title: string, link: string | null): HTMLElement {
  const box = doc.createElement("div");
  box.className = "pdf-embed";
  const strong = doc.createElement("strong");
  strong.textContent = title;
  box.append(strong);
  if (link) {
    box.append(doc.createElement("br"));
    const anchor = doc.createElement("a");
    anchor.href = link;
    anchor.textContent = link;
    box.append(anchor);
  } else {
    box.append(doc.createElement("br"), doc.createTextNode("Contenido interactivo: ábrelo en Synapse para verlo."));
  }
  return box;
}

function svgToImage(doc: Document, svg: SVGElement): HTMLImageElement | null {
  try {
    if (!svg.getAttribute("xmlns")) svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const text = new XMLSerializer().serializeToString(svg);
    const img = doc.createElement("img");
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`;
    img.alt = svg.getAttribute("aria-label") ?? "Diagrama";
    return img;
  } catch {
    return null;
  }
}

/** HTML imprimible del contenido de Lectura (`root` es el `.ProseMirror` de solo lectura). No modifica el DOM de la página. */
export function buildPdfHtml(root: Element, origin = window.location.origin): string {
  const copy = root.cloneNode(true) as Element;
  const doc = copy.ownerDocument;

  // Incrustados: el contenedor completo se cambia por un recuadro (si no, quedaría el envoltorio vacío).
  const handled = new Set<Element>();
  for (const iframe of Array.from(copy.querySelectorAll("iframe"))) {
    if (handled.has(iframe)) continue;
    const container = iframe.closest(".md-embed") ?? iframe;
    container.querySelectorAll("iframe").forEach((other) => handled.add(other));
    const src = iframe.getAttribute("src");
    const isVideo = src !== null && parseYoutubeEmbedSrc(src) !== null;
    const title = iframe.getAttribute("title")?.trim() || (isVideo ? "Video de YouTube" : "Contenido incrustado");
    container.replaceWith(placeholder(doc, title, embedLink(src, origin)));
  }
  for (const media of Array.from(copy.querySelectorAll("video, audio"))) {
    const src = media.getAttribute("src") ?? media.querySelector("source")?.getAttribute("src") ?? null;
    media.replaceWith(placeholder(doc, media.tagName === "VIDEO" ? "Video" : "Audio", embedLink(src, origin)));
  }

  for (const svg of Array.from(copy.querySelectorAll("svg"))) {
    if (svg.closest("button")) continue; // íconos de controles: se quitan abajo
    const img = svgToImage(doc, svg as unknown as SVGElement);
    if (img) svg.replaceWith(img);
    else svg.remove();
  }
  // Listas de tareas: en Lectura la casilla es un `span` dibujado con CSS (el estado va en `data-checked` del `li`); en el PDF pasa a ☑ o ☐ al inicio de la tarea.
  for (const item of Array.from(copy.querySelectorAll("li.note-task"))) {
    const done = item.getAttribute("data-checked") === "true";
    const body = item.querySelector(".note-task-body");
    item.querySelector(".note-task-slot")?.remove();
    item.querySelectorAll(".sr-only").forEach((node) => node.remove());
    (body?.firstElementChild ?? body)?.prepend(doc.createTextNode(done ? "☑ " : "☐ "));
    body?.replaceWith(...Array.from(body.childNodes));
  }
  copy.querySelectorAll(CONTROLS).forEach((node) => node.remove());
  for (const img of Array.from(copy.querySelectorAll("img"))) {
    const src = img.getAttribute("src");
    if (src) img.setAttribute("src", normalizeImageSrc(src, origin));
  }
  // Se serializa cada hijo (no se lee el marcado con APIs de cadena: RNF-003); el servidor lo analiza como HTML y lo limpia.
  const serializer = new XMLSerializer();
  return Array.from(copy.childNodes, (node) => serializer.serializeToString(node)).join("").split(' xmlns="http://www.w3.org/1999/xhtml"').join("");
}
