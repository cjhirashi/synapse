"""Plantillas de documento (H-030b). Reglas puras, sin E/S.

Una plantilla es una nota `PLANTILLAS/plantilla-<nombre>.md` (plana, sin subcarpetas). Su frontmatter guarda la
definición y su cuerpo es la estructura Markdown de partida:

- `alcance`: lista de carpetas donde se puede usar (`["*"]` = toda la bóveda).
- `atributos`: atributos opcionales extra, cada uno `{nombre, tipo, valor?}`.
- `estilo`: reservado para publicar en la web y para PDF (H-035/H-036): `{publicar: {}, pdf: {}}`, vacíos.

Cada documento creado desde una plantilla guarda su nombre (sin el prefijo) en el atributo general `plantilla`.
La especificación compartida con el cliente vive en `tests/fixtures/plantilla_reglas.json`.
"""
import re

from app.core.ag_rules import PLANTILLAS, meta_folder_of
from app.core.attribute_rules import PLANTILLA_NAME_MAX, PLANTILLA_NAME_RE, RESERVED_KEYS, normalize_key
from app.core.index_rules import is_index_path
from app.core.note_prefix import check_prefix

PREFIX = "plantilla-"
ALL_FOLDERS = "*"
ALCANCE_MAX = 50
ATRIBUTOS_MAX = 30
TIPOS = ("texto", "numero", "fecha", "lista", "booleano")
ESTILO_KEYS = ("publicar", "pdf")
# Claves que ya son atributos generales (o del sistema): una plantilla no las redefine como extra.
NOT_EXTRA = {
    "titulo", "descripcion", "tags", "estado", "fecha_creacion", "fecha_actualizacion", "plantilla", "sistema",
    *RESERVED_KEYS,
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
    estilo = frontmatter.get("estilo", {})
    if not isinstance(estilo, dict) or not set(estilo) <= set(ESTILO_KEYS):
        return "plantilla:estilo"
    if any(not isinstance(v, dict) or v for v in estilo.values()):
        return "plantilla:estilo"
    return None


def applies_to(alcance: list[str], folder: str) -> bool:
    """¿Una plantilla con este `alcance` se ofrece al crear un documento en `folder` (`""` = raíz)?"""
    from app.core.note_rules import path_key

    if ALL_FOLDERS in alcance:
        return True
    key = path_key(folder)
    return any(key == path_key(a) or key.startswith(path_key(a) + "/") for a in alcance)
