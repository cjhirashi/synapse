"""PDF de un documento (H-036): el HTML que la app ya dibuja en Lectura + el formato de la plantilla → PDF con WeasyPrint.

El servidor no confía en el HTML que recibe: lo vuelve a limpiar con una lista cerrada de etiquetas y atributos (`nh3`) y WeasyPrint solo
puede cargar imágenes `data:`, archivos propios de la persona (`/files/<id>`) e imágenes públicas de la web (la persona responde de lo que pone en su documento);
nunca una dirección interna (ver `external_image`), así el servidor no sirve para leer su red. Los SVG animados se imprimen en su último fotograma. Los estilos salen siempre de la plantilla, nunca del cliente. `weasyprint` se importa al usarlo: carga Pango.
"""
import base64
import html
import re
import threading
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from datetime import UTC, datetime
from typing import Callable
from urllib.parse import urlsplit

from app.core import pdf_style, svg_freeze
from app.core.html_style import clean_style
from app.core.config import settings
from app.core.errors import PdfBusy, PdfRenderFailed, PdfTimeout
from app.services import external_image

MAX_CONCURRENT = 2
WAIT_FOR_SLOT_SECONDS = 5
RENDER_TIMEOUT_SECONDS = 60
# Base de las URL relativas (`/files/<id>`). Esquema http(s) porque `urljoin` no resuelve relativas en esquemas desconocidos; `.invalid` nunca resuelve en DNS
# y de todos modos el fetcher no abre la red: solo atiende lo que reconoce.
INTERNAL_BASE = "https://synapse.invalid/"
IMAGE_TYPES = ("image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml")
FILE_PATH_RE = re.compile(r"^/files/([A-Za-z0-9_-]{1,64})$")
_DATA_RE = re.compile(r"^data:(image/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$", re.IGNORECASE)

TAGS = {
    "a", "abbr", "b", "blockquote", "br", "caption", "code", "col", "colgroup", "dd", "del", "details", "div", "dl", "dt", "em", "figcaption",
    "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "ins", "kbd", "li", "mark", "ol", "p", "pre", "q", "s", "samp", "small",
    "section", "span", "strong", "sub", "summary", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
}
ATTRIBUTES = {
    "*": {"class", "title"},
    "a": {"href"},
    "img": {"src", "alt", "width", "height", "style"},
    "td": {"colspan", "rowspan", "align"}, "th": {"colspan", "rowspan", "align"},
    "ol": {"start"},
    "div": {"align", "style"}, "span": {"style"},
}
ALIGNMENTS = ("left", "center", "right", "justify")

ReadImage = Callable[[str], "tuple[bytes, str] | None"]  # id de archivo → (bytes, tipo) si es una imagen de la persona

_SLOTS = threading.BoundedSemaphore(MAX_CONCURRENT)
_POOL = ThreadPoolExecutor(max_workers=MAX_CONCURRENT, thread_name_prefix="pdf")


_OWN_URL_RE = re.compile(r"^https?://([^/@:\s]+)(?::\d+)?(/files/[A-Za-z0-9_-]{1,64})(?:[?#].*)?$", re.IGNORECASE)


def own_file_path(url: str) -> str | None:
    """`/files/<id>` si `url` es un enlace a un archivo de esta misma Synapse (por cualquiera de sus nombres), si no `None`."""
    match = _OWN_URL_RE.match(url)
    hosts = {host.strip().lower() for host in settings.OWN_HOSTS.split(",") if host.strip()}
    return match.group(2) if match and match.group(1).lower() in hosts else None


EXTERNAL_IMAGE_RE = re.compile(r"^https?://[^/@\s]+(/|$)", re.IGNORECASE)  # sin credenciales en la URL
MAX_EXTERNAL_IMAGES = 60
MAX_EXTERNAL_BYTES = 40 * 1024 * 1024


def _filter_attribute(tag: str, attribute: str, value: str) -> str | None:
    """`img src`: `data:image/...;base64`, `/files/<id>` o una imagen http(s) de la web; `a href` solo http(s), mailto o ancla; todo lo demás se quita."""
    if tag == "img" and attribute == "src":
        own = own_file_path(value)
        if own is not None:  # el enlace «Copiar link» de Archivos: se lee directo, con la sesión, no por internet
            return own
        return value if _DATA_RE.match(value) or FILE_PATH_RE.match(value) or EXTERNAL_IMAGE_RE.match(value) else None
    if attribute == "style":  # cajas de color y detalles de maquetación: solo las propiedades y valores de la lista cerrada (`core/html_style.py`)
        return clean_style(value) or None
    if tag == "div" and attribute == "align":
        return value if value in ALIGNMENTS else None
    if tag == "a" and attribute == "href":
        return value if re.match(r"^(https?://|mailto:|#)", value, re.IGNORECASE) else None
    return value


def sanitize(source: str) -> str:
    import nh3

    return nh3.clean(
        source, tags=TAGS, attributes=ATTRIBUTES, attribute_filter=_filter_attribute, clean_content_tags={"script", "style", "iframe", "object", "embed"},
        url_schemes={"http", "https", "mailto", "data"}, link_rel="noopener noreferrer", strip_comments=True)


HEADING_RE = re.compile(r"<(h[1-4])((?:\s[^>]*)?)>(.*?)</\1>", re.DOTALL)
COVER_RE = re.compile(r'<section class="pdf-portada">.*?</section>', re.DOTALL)
INDEX_MARK_RE = re.compile(r'<div class="pdf-indice">\s*</div>')


def add_index(sanitized: str, spec: dict) -> str:
    """Si hay marca de índice, pone un `id` a cada encabezado (H1 a H4) y la sustituye por la lista de los que están hasta el nivel de la plantilla.

    El índice no incluye los encabezados de la portada. Sin encabezados que listar, la marca se quita. Los números de página los dibuja WeasyPrint."""
    import nh3

    if INDEX_MARK_RE.search(sanitized) is None:
        return sanitized
    covers = [match.span() for match in COVER_RE.finditer(sanitized)]
    entries: list[tuple[int, str, str]] = []
    counter = 0

    def number(match: re.Match) -> str:
        nonlocal counter
        counter += 1
        level, anchor = int(match.group(1)[1]), f"pdf-h{counter}"
        if level <= spec["niveles"] and not any(start <= match.start() < end for start, end in covers):
            entries.append((level, anchor, nh3.clean(match.group(3), tags=set())))
        return f'<{match.group(1)} id="{anchor}"{match.group(2)}>{match.group(3)}</{match.group(1)}>'

    out = HEADING_RE.sub(number, sanitized)
    marks = list(INDEX_MARK_RE.finditer(out))
    items = "".join(f'<li class="lv{level}"><a href="#{anchor}">{text}</a></li>' for level, anchor, text in entries)
    index = f'<nav class="pdf-indice"><h2 class="pdf-indice-titulo">{html.escape(spec["titulo"])}</h2><ol>{items}</ol></nav>' if entries else ""
    first = marks[0]
    return INDEX_MARK_RE.sub("", out[:first.start()]) + index + INDEX_MARK_RE.sub("", out[first.end():])


def _image_data_uri(read_image: ReadImage, file_id: str | None) -> str | None:
    if not file_id:
        return None
    found = read_image(file_id)
    if found is None or found[1] not in IMAGE_TYPES:
        return None
    return f"data:{found[1]};base64,{base64.b64encode(found[0]).decode()}"


def _band(prefix: str, spec: dict, title: str, attributes: dict, now: datetime) -> str | None:
    """Encabezado (`pdfhead`) o pie (`pdffoot`): tres textos. `None` si no hay nada que imprimir.

    La imagen del encabezado no va en la banda: es el fondo de la página (ver `build_document`). El pie no lleva imagen."""
    texts = {slot: pdf_style.expand_text(spec[slot], title=title, attributes=attributes, now=now) for slot in ("izquierda", "centro", "derecha")}
    if not any(texts.values()) and not spec["linea"]["activa"]:
        return None
    return f'<div id="{prefix}"><div class="band-text"><span>{texts["izquierda"]}</span><span class="c">{texts["centro"]}</span><span class="r">{texts["derecha"]}</span></div></div>'


LABELS = {
    "titulo": "Título", "descripcion": "Descripción", "tags": "Etiquetas", "estado": "Estado",
    "fecha_creacion": "Fecha de creación", "fecha_actualizacion": "Fecha de actualización",
}


def _attributes_table(frontmatter: dict) -> str:
    rows = []
    for key, value in frontmatter.items():
        if key in ("plantilla", "sistema") or value in (None, "", [], {}):
            continue
        label = LABELS.get(key) or key.replace("_", " ").capitalize()
        rows.append(f"<tr><th>{html.escape(label)}</th><td>{html.escape(pdf_style._plain(value))}</td></tr>")
    return f'<table class="pdf-attrs"><tbody>{"".join(rows)}</tbody></table>' if rows else ""


def build_document(
    body: str, style: dict, *, title: str, frontmatter: dict, read_image: ReadImage, now: datetime | None = None,
) -> str:
    now = now or datetime.now(UTC)
    attributes = {key: value for key, value in frontmatter.items()}
    head = _band("pdfhead", style["encabezado"], title, attributes, now)
    foot = _band("pdffoot", style["pie"], title, attributes, now)
    background = _image_data_uri(read_image, style["encabezado"]["imagen"])  # fondo de cada página: ancho de la hoja, alto proporcional, desde la esquina superior izquierda
    css = pdf_style.stylesheet(
        style, has_header=head is not None, has_footer=foot is not None, background=background,
        cover_background=_image_data_uri(read_image, style["portada"]["imagen"]), index_background=_image_data_uri(read_image, style["indice"]["imagen"]))
    attrs = _attributes_table(frontmatter) if style["incluir_atributos"] else ""
    return (
        f'<!doctype html><html lang="es"><head><meta charset="utf-8"><title>{html.escape(title)}</title><style>{css}</style></head>'
        f"<body>{head or ''}{foot or ''}{attrs}<article>{add_index(sanitize(body), style['indice'])}</article></body></html>")


def _fetcher(read_image: ReadImage, *, fetch_external=external_image.fetch):
    from weasyprint.urls import URLFetcher, URLFetcherResponse

    budget = {"count": 0, "bytes": 0}

    def served(url: str, body: bytes, content_type: str):
        if content_type == "image/svg+xml":
            body = svg_freeze.freeze(body)  # el SVG animado se imprime en su último fotograma
        return URLFetcherResponse(url, body, {"Content-Type": content_type})

    class Closed(URLFetcher):
        """Sirve `data:` de imagen, `/files/<id>` de la persona e imágenes públicas de la web; todo lo demás lanza (WeasyPrint lo trata como recurso ausente)."""

        def fetch(self, url, headers=None):
            if url.lower().startswith("data:"):
                match = _DATA_RE.match(url)
                if match is None or match.group(1).lower() not in IMAGE_TYPES:
                    raise ValueError("data: no admitido")
                return served(url, base64.b64decode(re.sub(r"\s", "", match.group(2))), match.group(1).lower())
            parts = urlsplit(url)
            if (parts.scheme, parts.netloc) == ("https", "synapse.invalid"):
                hit = FILE_PATH_RE.match(parts.path)
                found = read_image(hit.group(1)) if hit else None
                if found is None or found[1] not in IMAGE_TYPES:
                    raise ValueError("recurso bloqueado")
                return served(url, found[0], found[1])
            own = own_file_path(url)
            found = read_image(FILE_PATH_RE.match(own).group(1)) if own else None
            if found is not None and found[1] in IMAGE_TYPES:
                return served(url, found[0], found[1])
            if parts.scheme in ("http", "https") and EXTERNAL_IMAGE_RE.match(url):  # no es un archivo de la persona: se trata como imagen de la web
                if budget["count"] >= MAX_EXTERNAL_IMAGES or budget["bytes"] >= MAX_EXTERNAL_BYTES:
                    raise ValueError("demasiadas imágenes externas")
                budget["count"] += 1
                found = fetch_external(url, IMAGE_TYPES)
                if found is None:
                    raise ValueError("imagen externa no disponible")
                budget["bytes"] += len(found[0])
                return served(url, found[0], found[1])
            raise ValueError("recurso bloqueado")

    return Closed()


def _special_pages(rendered) -> int:
    """Hojas de portada e índice del documento ya maquetado (no entran en la numeración ni en el total de «de N»). Si WeasyPrint cambia su interior, 0."""
    try:
        return sum(1 for page in rendered.pages if page._page_box.page_type.name in ("portada", "indice"))
    except AttributeError:
        return 0


def _render(document: str, read_image: ReadImage) -> bytes:
    from weasyprint import CSS, HTML

    try:
        rendered = HTML(string=document, base_url=INTERNAL_BASE, url_fetcher=_fetcher(read_image)).render()
        special = _special_pages(rendered)
        if special and 'class="pt"' in document:
            # `counter(pages)` cuenta también la portada y el índice; con ellos, el total del pie se imprime ya descontado (segunda pasada).
            total = CSS(string=f'.pt::after {{ content: "{len(rendered.pages) - special}" !important; }}')
            return HTML(string=document, base_url=INTERNAL_BASE, url_fetcher=_fetcher(read_image)).write_pdf(stylesheets=[total])
        return rendered.write_pdf()
    finally:
        _SLOTS.release()


def make_pdf(document: str, read_image: ReadImage) -> bytes:
    """Convierte el documento ya armado. Como mucho `MAX_CONCURRENT` a la vez; un PDF que pasa de 60 s se aborta para quien lo pidió."""
    if not _SLOTS.acquire(timeout=WAIT_FOR_SLOT_SECONDS):
        raise PdfBusy()
    try:
        future = _POOL.submit(_render, document, read_image)  # el hilo libera su turno al terminar, aunque nadie lo espere ya
    except Exception:
        _SLOTS.release()
        raise PdfRenderFailed("no se pudo encolar") from None
    try:
        return future.result(timeout=RENDER_TIMEOUT_SECONDS)
    except FutureTimeout:
        raise PdfTimeout() from None
    except Exception as exc:
        raise PdfRenderFailed(f"{type(exc).__name__}: {exc}") from None
