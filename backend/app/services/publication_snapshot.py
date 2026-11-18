"""Funciones puras para armar una instantánea de publicación (H-035)."""

import html
import re

import nh3

from app.core import pdf_style
from app.services import pdf_service


def clean_html(source: str) -> str:
    """Limpia el HTML usando el saneo estándar del PDF (nh3)."""
    return pdf_service.sanitize(source)


def number_headings(clean: str) -> tuple[str, list[dict]]:
    """Numera los encabezados (h1-h4) con id único; devuelve (HTML con ids, lista de toc).

    Los encabezados vacíos llevan id pero no entran al toc.
    """
    toc = []
    counter = 1

    def replacer(match: re.Match) -> str:
        nonlocal counter
        tag = match.group(1)
        attrs = match.group(2)
        inner = match.group(3)
        level = int(tag[1])

        # Añadir id="h-N" preservando atributos existentes
        new_attrs = f'{attrs} id="h-{counter}"'
        result = f"<{tag}{new_attrs}>{inner}</{tag}>"

        # Extraer texto plano usando nh3 y agregar al toc si no está vacío
        text_plain = html.unescape(nh3.clean(inner, tags=set())).strip()
        if text_plain:
            toc.append({"level": level, "id": f"h-{counter}", "text": text_plain})

        counter += 1
        return result

    numbered = pdf_service.HEADING_RE.sub(replacer, clean)
    return numbered, toc


def title_of(frontmatter: dict, path: str) -> str:
    """Extrae el título de la nota: `titulo` del frontmatter o el último tramo de la ruta."""
    titulo = frontmatter.get("titulo")
    if isinstance(titulo, str) and titulo.strip():
        result = titulo.strip()
    else:
        # Último tramo de la ruta sin .md
        result = path.rstrip("/").split("/")[-1]
        if result.endswith(".md"):
            result = result[:-3]

    # Máximo 255 caracteres
    return result[:255]


def meta_of(frontmatter: dict, template: dict | None) -> dict:
    """Extrae metadatos: descripcion, creacion, actualizacion, estado, estado_color."""
    meta = {}

    # Descripción
    descripcion = frontmatter.get("descripcion")
    if isinstance(descripcion, str) and descripcion.strip():
        meta["descripcion"] = descripcion.strip()

    # Fechas
    creacion = frontmatter.get("fecha_creacion")
    if isinstance(creacion, str) and creacion.strip():
        meta["creacion"] = creacion.strip()

    actualizacion = frontmatter.get("fecha_actualizacion")
    if isinstance(actualizacion, str) and actualizacion.strip():
        meta["actualizacion"] = actualizacion.strip()

    # Estado
    estado = frontmatter.get("estado")
    if isinstance(estado, str) and estado.strip():
        estado_str = estado.strip()
        meta["estado"] = estado_str

        # Buscar color en la plantilla
        if template and isinstance(template.get("estados"), list):
            for item in template["estados"]:
                if isinstance(item, dict) and item.get("nombre") == estado_str:
                    color = item.get("color")
                    if color:
                        meta["estado_color"] = color
                    break

    return meta


def style_of(template: dict | None) -> dict:
    """Tipografía, tamaño y color de texto y encabezados H1-H4 del PDF de la plantilla (ya con los valores por omisión del PDF) y, si tiene tema de color, los colores de los encabezados para el esquema oscuro.

    Una plantilla sin formato de PDF (`estilo.pdf` ausente o vacío) da `{}`: la página pública conserva su estilo estándar.
    """
    estilo = template.get("estilo") if template else None
    raw = estilo.get("pdf") if isinstance(estilo, dict) else None
    if not isinstance(raw, dict) or not raw:
        return {}
    resolved = pdf_style.resolve(raw)
    style = {"texto": resolved["texto"], "encabezados": resolved["encabezados"]}
    colors = resolved["tema"]["colores"]
    if colors:  # con tema de color, los encabezados del esquema oscuro son los del editor (H1/H2 en 600, H3/H4 en 400)
        style["encabezados_oscuro"] = {"h1": colors["primario_600"], "h2": colors["secundario_600"], "h3": colors["primario_400"], "h4": colors["secundario_400"]}
    return style


_UUID = r"(?i:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"  # mayúsculas solo en los dígitos
_EMBED_FILE = re.compile(rf"https://synapse\.cjhirashi\.com/files/{_UUID}")
_EMBED_FILES_HOST = re.compile(r"https://files-synapse\.cjhirashi\.com/[A-Za-z0-9._~%/-]+")
_EMBED_VIDEO = re.compile(r"https://www\.youtube-nocookie\.com/embed/[A-Za-z0-9_-]{11}(\?start=\d{1,6})?")


def embed_kind(url: str) -> str | None:
    """`"file"` (un archivo de esta Synapse), `"video"` (YouTube sin cookies) o `None`. Lista cerrada de orígenes.

    Misma regla que `frontend/src/editor/htmlSanitizer.ts` (`isAllowedEmbedSrc`). Se valida la cadena ORIGINAL completa (no una reconstruida): solo `https`,
    sin usuario, puerto, consulta ni fragmento (la consulta `?start=N` solo vale en video), sin espacios ni saltos de línea y sin tramos `..` ni `%2e`.
    """
    if re.search(r"\s", url) or "/.." in url or re.search(r"%2e", url, re.IGNORECASE):
        return None
    if _EMBED_FILE.fullmatch(url) or _EMBED_FILES_HOST.fullmatch(url):
        return "file"
    if _EMBED_VIDEO.fullmatch(url):
        return "video"
    return None


def embed_frames(clean: str) -> str:
    """Convierte enlaces pub-embed en iframes si su URL pasa embed_kind.

    Sobre HTML ya limpio por nh3, busca <a ...class="pub-embed"... href="...">...</a> y:
    - Si href pasa embed_kind como 'file': convierte a iframe para archivo.
    - Si href pasa embed_kind como 'video': convierte a iframe para YouTube.
    - Si href no pasa: deja el enlace tal cual.
    - Si class != 'pub-embed' exacto: no toca.
    """
    result = []
    pattern = re.compile(r'<a\b([^>]*)>(.*?)</a>', re.DOTALL)
    last_end = 0

    for match in pattern.finditer(clean):
        result.append(clean[last_end:match.start()])

        attrs_str = match.group(1)
        inner = match.group(2)

        # Extraer class y href de los atributos
        class_match = re.search(r'class="([^"]*)"', attrs_str)
        href_match = re.search(r'href="([^"]*)"', attrs_str)

        css_class = class_match.group(1) if class_match else ""
        href_escaped = href_match.group(1) if href_match else ""

        # Solo procesar si class es exactamente "pub-embed"
        if css_class == "pub-embed" and href_escaped:
            # Unescape href para validar
            href = html.unescape(href_escaped)
            kind = embed_kind(href)

            # Extraer título del contenido
            title = html.unescape(nh3.clean(inner, tags=set())).strip()
            if not title:
                title = "Contenido incrustado"

            if kind == "file":
                # Marco para archivo
                result.append(
                    f'<div class="pub-embed-frame"><iframe src="{html.escape(href, quote=True)}" '
                    f'title="{html.escape(title, quote=True)}" sandbox="allow-scripts" '
                    f'referrerpolicy="no-referrer" loading="lazy"></iframe>'
                    f'<a class="pub-embed-open" href="{html.escape(href, quote=True)}" target="_blank" '
                    f'rel="noopener noreferrer">Abrir en una pestaña nueva</a></div>'
                )
            elif kind == "video":
                # Extraer id de video y start de la URL
                video_match = re.search(r"/embed/([A-Za-z0-9_-]{11})(?:\?start=(\d{1,6}))?", href)
                if video_match:
                    video_id = video_match.group(1)
                    start = video_match.group(2)
                    extra = f"&t={start}" if start else ""
                    youtube_url = f"https://www.youtube.com/watch?v={video_id}{extra}"
                    result.append(
                        f'<div class="pub-embed-frame pub-embed-frame--video"><iframe src="{html.escape(href, quote=True)}" '
                        f'title="{html.escape(title, quote=True)}" sandbox="allow-scripts allow-same-origin allow-presentation" '
                        f'allow="fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" '
                        f'loading="lazy"></iframe>'
                        f'<a class="pub-embed-open" href="{html.escape(youtube_url, quote=True)}" target="_blank" '
                        f'rel="noopener noreferrer">Abrir en YouTube</a></div>'
                    )
                else:
                    # No se pudo extraer; dejar como enlace
                    result.append(match.group(0))
            else:
                # URL no permitida: dejar como enlace normal
                result.append(match.group(0))
        else:
            # Otra clase o sin pub-embed: no tocar
            result.append(match.group(0))

        last_end = match.end()

    result.append(clean[last_end:])
    return "".join(result)


_ATTR_RE = re.compile(r'(?:src|href)="([^"]+)"')
_IMG_SRC_RE = re.compile(r'<img\b[^>]*?\bsrc="([^"]+)"')
_MAX_RESOURCES = 200


def collect_resources(clean: str) -> tuple[list[str], list[str]]:
    """De un HTML ya limpio: (ids de archivos propios `/files/<id>` en `src` o `href`, URLs externas de imágenes http o https).

    Sin repetir, en orden de aparición y con tope de 200 cada lista. El HTML limpio de nh3 usa comillas dobles y escapa `&`.
    También reconoce URLs absolutas a archivos propios mediante pdf_service.own_file_path.
    """
    own: dict[str, None] = {}
    external: dict[str, None] = {}
    for match in _ATTR_RE.finditer(clean):
        url = html.unescape(match.group(1))
        # Intentar como /files/<id>
        found = pdf_service.FILE_PATH_RE.match(url)
        if found and len(own) < _MAX_RESOURCES:
            own.setdefault(found.group(1))
        else:
            # Intentar como URL absoluta a archivo propio
            own_path = pdf_service.own_file_path(url)
            if own_path and len(own) < _MAX_RESOURCES:
                match_path = pdf_service.FILE_PATH_RE.match(own_path)
                if match_path:
                    own.setdefault(match_path.group(1))
    for match in _IMG_SRC_RE.finditer(clean):
        url = html.unescape(match.group(1))
        if url.startswith(("http://", "https://")) and len(external) < _MAX_RESOURCES:
            external.setdefault(url)
    return list(own), list(external)
