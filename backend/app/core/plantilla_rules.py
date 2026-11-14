"""Plantillas de documento (H-030b). Reglas puras, sin E/S.

Una plantilla es una nota `PLANTILLAS/plantilla-<nombre>.md` (plana, sin subcarpetas). Su frontmatter guarda la
definición y su cuerpo es la estructura Markdown de partida:

- `alcance`: lista de carpetas donde se puede usar (`["*"]` = toda la bóveda).
- `atributos`: atributos opcionales extra, cada uno `{nombre, tipo, valor?}`.
- `estados` (H-054, opcional): los estados que puede tener un documento con esta plantilla, cada uno `{nombre, color}` (`gris|azul|verde|rojo`).
  Una plantilla no trae estados de serie: sin `estados`, sus documentos no tienen estado que elegir.
- `instrucciones` (H-054, opcional): texto de uso de la plantilla (para personas y agentes); no se copia al documento. El cuerpo es solo la estructura.
- `estilo`: `publicar` (reservado para H-035, vacío) y `pdf` (H-036: formato del PDF del documento, ver `check_pdf_style`).

Cada documento creado desde una plantilla guarda su nombre (sin el prefijo) en el atributo general `plantilla`.
La especificación compartida con el cliente vive en `tests/fixtures/plantilla_reglas.json`.
"""
import re

from app.core.ag_rules import PLANTILLAS, meta_folder_of
from app.core.attribute_rules import HIDDEN_KEY, PLANTILLA_NAME_MAX, PLANTILLA_NAME_RE, RESERVED_KEYS, normalize_estado, normalize_key
from app.core.index_rules import is_index_path
from app.core.note_prefix import check_prefix

PREFIX = "plantilla-"
ALL_FOLDERS = "*"
ALCANCE_MAX = 50
ATRIBUTOS_MAX = 30
ESTADOS_MAX = 20
ESTADO_COLORES = ("gris", "azul", "verde", "rojo")
INSTRUCCIONES_MAX = 20000
TIPOS = ("texto", "numero", "fecha", "lista", "booleano")
ESTILO_KEYS = ("publicar", "pdf")

# H-036: formato del PDF. Todo opcional; lo que falta toma el valor de `pdf_service.DEFAULTS`.
PDF_FONTS = ("DejaVu Sans", "DejaVu Serif", "Liberation Sans", "Liberation Serif", "Liberation Mono")
PDF_PAGE_SIZES = ("carta", "a4")
PDF_MARGINS = ("superior", "inferior", "izquierdo", "derecho")
PDF_MARGIN_MAX_MM = 60
PDF_FONT_PT = (6, 48)
PDF_HEADING_LEVELS = ("h1", "h2", "h3", "h4")  # H5 y H6 usan el estilo de H4
PDF_LINE_PT = (0.25, 6)  # grosor de la línea del encabezado y del pie
PDF_BAND_MM = (0, 60)  # distancia al borde de la hoja y sangría lateral del encabezado y del pie
PDF_TEXT_MAX = 200
PDF_SPECIALS = ("titulo", "fecha", "pagina", "paginas")
PDF_FILE_ID_RE = re.compile(r"[A-Za-z0-9_-]{1,64}")
PDF_COLOR_RE = re.compile(r"#[0-9a-fA-F]{6}")
_PDF_FIELD_RE = re.compile(r"\{\{([^{}]*)\}\}")
# Claves que ya son atributos generales (o del sistema): una plantilla no las redefine como extra.
NOT_EXTRA = {
    "titulo", "descripcion", "tags", "estado", "fecha_creacion", "fecha_actualizacion", "plantilla", "sistema",
    HIDDEN_KEY, *RESERVED_KEYS,
}


def is_valid_name(name: object) -> bool:
    return isinstance(name, str) and len(name) <= PLANTILLA_NAME_MAX and PLANTILLA_NAME_RE.fullmatch(name) is not None


def check_ref(value: object) -> str | None:
    """Valor del atributo general `plantilla` de un documento: el nombre de una plantilla (sin el prefijo)."""
    return None if is_valid_name(value) else "plantilla"


def template_name(path: str) -> str | None:
    """Nombre de la plantilla de `PLANTILLAS/plantilla-<nombre>.md`, o `None` si la ruta no es de una plantilla."""
    parts = path.split("/")
    if len(parts) != 2 or meta_folder_of(path) != PLANTILLAS:
        return None
    base = parts[1]
    if not base.endswith(".md") or not base.startswith(PREFIX):
        return None
    name = base[len(PREFIX):-3]
    return name if is_valid_name(name) else None


def template_path(name: str) -> str:
    return f"{PLANTILLAS}/{PREFIX}{name}.md"


def is_template_zone(path: str) -> bool:
    """¿La nota está dentro de `PLANTILLAS/` y no es un INDICE? Ahí todo debe ser una plantilla válida."""
    return meta_folder_of(path) == PLANTILLAS and not is_index_path(path)


def check_path(path: str) -> str | None:
    return None if template_name(path) is not None else "plantilla:path"


def _type_ok(tipo: str, value: object) -> bool:
    if tipo == "texto":
        return isinstance(value, str)
    if tipo == "numero":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if tipo == "fecha":
        return isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value) is not None
    if tipo == "lista":
        return isinstance(value, list) and all(isinstance(x, str) for x in value)
    return isinstance(value, bool)


def estado_names(estados: object) -> list[str]:
    """Nombres de los `estados` de una plantilla (acepta también el texto suelto de la primera versión)."""
    if not isinstance(estados, list):
        return []
    return [e["nombre"] if isinstance(e, dict) else e
            for e in estados if isinstance(e, str) or (isinstance(e, dict) and isinstance(e.get("nombre"), str))]


def check_estados(estados: object) -> str | None:
    """`estados` de una plantilla: `[{nombre, color}]`, `nombre` como se guarda un estado y sin repetir, `color` de la paleta."""
    if not isinstance(estados, list) or len(estados) > ESTADOS_MAX:
        return "plantilla:estados"
    seen: set[str] = set()
    for item in estados:
        if not isinstance(item, dict) or set(item) != {"nombre", "color"}:
            return "plantilla:estados"
        nombre = item["nombre"]
        if normalize_estado(nombre) != nombre or nombre in seen or item["color"] not in ESTADO_COLORES:
            return "plantilla:estados"
        seen.add(nombre)
    return None


def check_definition(frontmatter: object) -> str | None:
    """Forma de la definición de una plantilla. Devuelve `plantilla:<campo>` o `None`."""
    if not isinstance(frontmatter, dict):
        return "plantilla:alcance"
    alcance = frontmatter.get("alcance")
    if (not isinstance(alcance, list) or not 1 <= len(alcance) <= ALCANCE_MAX
            or len(set(alcance)) != len(alcance)
            or not all(isinstance(a, str) and (a == ALL_FOLDERS or check_prefix(a) is None) for a in alcance)
            or (ALL_FOLDERS in alcance and len(alcance) > 1)):
        return "plantilla:alcance"
    atributos = frontmatter.get("atributos", [])
    if not isinstance(atributos, list) or len(atributos) > ATRIBUTOS_MAX:
        return "plantilla:atributos"
    seen: set[str] = set()
    for item in atributos:
        if not isinstance(item, dict) or not set(item) <= {"nombre", "tipo", "valor"}:
            return "plantilla:atributos"
        nombre, tipo = item.get("nombre"), item.get("tipo")
        if (not isinstance(nombre, str) or normalize_key(nombre) != nombre or nombre in NOT_EXTRA
                or nombre in seen or tipo not in TIPOS):
            return "plantilla:atributos"
        if "valor" in item and item["valor"] is not None and not _type_ok(tipo, item["valor"]):
            return "plantilla:atributos"
        seen.add(nombre)
    if check_estados(frontmatter.get("estados", [])) is not None:
        return "plantilla:estados"
    instrucciones = frontmatter.get("instrucciones", "")
    if not isinstance(instrucciones, str) or len(instrucciones) > INSTRUCCIONES_MAX:
        return "plantilla:instrucciones"
    estilo = frontmatter.get("estilo", {})
    if not isinstance(estilo, dict) or not set(estilo) <= set(ESTILO_KEYS):
        return "plantilla:estilo"
    if estilo.get("publicar", {}) != {} or not check_pdf_style(estilo.get("pdf", {})):
        return "plantilla:estilo"
    return None


def _is_num(value: object, low: float, high: float) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and low <= value <= high


def check_pdf_text(value: object) -> bool:
    """Texto de encabezado o pie: hasta 200 caracteres y solo con los campos especiales conocidos."""
    if not isinstance(value, str) or len(value) > PDF_TEXT_MAX:
        return False
    if value.count("{{") != len(_PDF_FIELD_RE.findall(value)) or value.count("}}") != value.count("{{"):
        return False
    for field in _PDF_FIELD_RE.findall(value):
        if field in PDF_SPECIALS:
            continue
        name = field.removeprefix("atributo:") if field.startswith("atributo:") else None
        if name is None or not name or normalize_key(name) != name:
            return False
    return True


def _check_pdf_block(block: object, allowed: dict) -> bool:
    if not isinstance(block, dict) or not set(block) <= set(allowed):
        return False
    return all(allowed[key](value) for key, value in block.items())


def check_pdf_style(pdf: object) -> bool:
    """Forma de `estilo.pdf` (H-036). `{}` es válido y significa «sin PDF»; todo lo demás es opcional dentro de su bloque."""
    color = lambda v: isinstance(v, str) and PDF_COLOR_RE.fullmatch(v) is not None  # noqa: E731
    font = {"familia": lambda v: v in PDF_FONTS, "tamano_pt": lambda v: _is_num(v, *PDF_FONT_PT), "color": color}
    # `encabezados` admite los cuatro niveles (`h1` a `h4`, cada uno con su fuente) y, por compatibilidad con plantillas guardadas antes, la forma
    # plana (`familia`, `tamano_pt`, `color`) que vale para H1 y de la que se derivan los demás niveles.
    headings = {**font, **{level: (lambda v: _check_pdf_block(v, font)) for level in PDF_HEADING_LEVELS}}
    margins = {key: (lambda v: _is_num(v, 0, PDF_MARGIN_MAX_MM)) for key in PDF_MARGINS}
    line = {"activa": lambda v: isinstance(v, bool), "color": color, "grosor_pt": lambda v: _is_num(v, *PDF_LINE_PT)}
    band = {
        "imagen": lambda v: v is None or (isinstance(v, str) and PDF_FILE_ID_RE.fullmatch(v) is not None),
        "izquierda": check_pdf_text, "centro": check_pdf_text, "derecha": check_pdf_text,
        "fuente": lambda v: _check_pdf_block(v, font),
        "linea": lambda v: _check_pdf_block(v, line),
        "distancia_mm": lambda v: _is_num(v, *PDF_BAND_MM),
        "sangria_mm": lambda v: _is_num(v, *PDF_BAND_MM),
    }
    spec = {
        "activo": lambda v: isinstance(v, bool),
        "incluir_atributos": lambda v: isinstance(v, bool),
        "pagina": lambda v: _check_pdf_block(v, {"tamano": lambda t: t in PDF_PAGE_SIZES, "margenes_mm": lambda m: _check_pdf_block(m, margins)}),
        "tema": lambda v: _check_pdf_block(v, {"primario": color}),  # color primario: de él se derivan el secundario, el terciario y los colores del documento
        "encabezados": lambda v: _check_pdf_block(v, headings),
        "texto": lambda v: _check_pdf_block(v, font),
        "encabezado": lambda v: _check_pdf_block(v, band),
        "pie": lambda v: _check_pdf_block(v, {**band, "imagen": lambda image: image is None}),  # el pie no lleva imagen (solo `null` por compatibilidad)
    }
    return _check_pdf_block(pdf, spec)


def applies_to(alcance: list[str], folder: str) -> bool:
    """¿Una plantilla con este `alcance` se ofrece al crear un documento en `folder` (`""` = raíz)?"""
    from app.core.note_rules import path_key

    if ALL_FOLDERS in alcance:
        return True
    key = path_key(folder)
    return any(key == path_key(a) or key.startswith(path_key(a) + "/") for a in alcance)
