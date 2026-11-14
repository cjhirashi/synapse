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
    "span", "strong", "sub", "summary", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
}
ATTRIBUTES = {
    "*": {"class", "title"},
    "a": {"href"},
    "img": {"src", "alt", "width", "height"},
    "td": {"colspan", "rowspan", "align"}, "th": {"colspan", "rowspan", "align"},
    "ol": {"start"},
}

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
    if tag == "a" and attribute == "href":
        return value if re.match(r"^(https?://|mailto:|#)", value, re.IGNORECASE) else None
    return value


def sanitize(source: str) -> str:
    import nh3

    return nh3.clean(
        source, tags=TAGS, attributes=ATTRIBUTES, attribute_filter=_filter_attribute, clean_content_tags={"script", "style", "iframe", "object", "embed"},
        url_schemes={"http", "https", "mailto", "data"}, link_rel="noopener noreferrer", strip_comments=True)


def _image_data_uri(read_image: ReadImage, file_id: str | None) -> str | None:
    if not file_id:
        return None
    found = read_image(file_id)
    if found is None or found[1] not in IMAGE_TYPES:
        return None
    return f"data:{found[1]};base64,{base64.b64encode(found[0]).decode()}"


def _band(prefix: str, spec: dict, read_image: ReadImage, title: str, attributes: dict, now: datetime, *, with_image: bool = True) -> str | None:
    """Encabezado (`pdfhead`) o pie (`pdffoot`): imagen opcional y tres textos. `None` si no hay nada que imprimir.

    `with_image=False` (encabezado): la imagen no va en la banda, es el fondo de la página (ver `build_document`)."""
    image = _image_data_uri(read_image, spec["imagen"]) if with_image else None
    texts = {slot: pdf_style.expand_text(spec[slot], title=title, attributes=attributes, now=now) for slot in ("izquierda", "centro", "derecha")}
    if image is None and not any(texts.values()):
        return None
    img = f'<img src="{image}" alt="">' if image else ""
    return f'<div id="{prefix}">{img}<div class="band-text"><span>{texts["izquierda"]}</span><span class="c">{texts["centro"]}</span><span class="r">{texts["derecha"]}</span></div></div>'


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
    head = _band("pdfhead", style["encabezado"], read_image, title, attributes, now, with_image=False)
    foot = _band("pdffoot", style["pie"], read_image, title, attributes, now)
    background = _image_data_uri(read_image, style["encabezado"]["imagen"])  # fondo de cada página, tamaño real, desde la esquina superior izquierda
    css = pdf_style.stylesheet(style, has_header=head is not None, has_footer=foot is not None, background=background)
    attrs = _attributes_table(frontmatter) if style["incluir_atributos"] else ""
    return (
        f'<!doctype html><html lang="es"><head><meta charset="utf-8"><title>{html.escape(title)}</title><style>{css}</style></head>'
        f"<body>{head or ''}{foot or ''}{attrs}<article>{sanitize(body)}</article></body></html>")


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


def _render(document: str, read_image: ReadImage) -> bytes:
    from weasyprint import HTML

    try:
        return HTML(string=document, base_url=INTERNAL_BASE, url_fetcher=_fetcher(read_image)).write_pdf()
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
