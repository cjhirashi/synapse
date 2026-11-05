"""Nombres canónicos de skills y plantillas (H-041 E2). Reglas puras, sin E/S.

Todo documento de `AG - SKILLS` lleva el prefijo `skill-` y todo documento de `PLANTILLAS` el prefijo `plantilla-`, con
el nombre en minúsculas, sin acentos, sin espacios y solo con letras, dígitos y guiones: quien asigna un nombre
(«gestión de variables») no lo estructura, lo hace el sistema (`skill-gestion-de-variables.md`).

- La REST **transforma** el nombre al crear o renombrar (`canonical_path`) y devuelve la ruta final.
- `/sync` y los movimientos de carpeta **rechazan** lo que no sea canónico (`is_canonical`): el cliente ya lo normalizó.

Especificación compartida con el cliente: `tests/fixtures/nombres_reglas.json` (`frontend/src/notes/docNames.ts`).
"""
import re
import unicodedata

from app.core.ag_rules import AG_SKILLS, PLANTILLAS, meta_folder_of
from app.core.attribute_rules import PLANTILLA_NAME_MAX
from app.core.index_rules import is_index_path

SKILL_PREFIX = "skill-"
PLANTILLA_PREFIX = "plantilla-"
SKILL_BASE_MAX = 64  # nombre completo, con prefijo: el de una skill de OpenClaw
EXT = ".md"

# Letras que NFKD no descompone: se transliteran a mano. Lo que no esté aquí ni sea ASCII se vuelve un guion.
_TRANSLIT = str.maketrans({"ß": "ss", "æ": "ae", "œ": "oe", "ø": "o", "ł": "l", "đ": "d", "ð": "d", "þ": "th", "ı": "i",
                           "Æ": "ae", "Œ": "oe", "Ø": "o", "Ł": "l", "Đ": "d", "Ð": "d", "Þ": "th"})
_NOT_ALNUM = re.compile(r"[^a-z0-9]+")

SKILL_NAME = "skill:name"
SKILL_PATH = "skill:path"
PLANTILLA_PATH = "plantilla:path"

# (carpeta, prefijo, máximo del nombre sin prefijo, código de rechazo de un nombre inválido, código de ruta inválida)
_KINDS = {
    AG_SKILLS: (SKILL_PREFIX, SKILL_BASE_MAX - len(SKILL_PREFIX), SKILL_NAME, SKILL_PATH),
    PLANTILLAS: (PLANTILLA_PREFIX, PLANTILLA_NAME_MAX, PLANTILLA_PATH, PLANTILLA_PATH),
}


def slugify(raw: str) -> str:
    """Minúsculas, sin acentos, sin espacios: cualquier otra cosa pasa a guion y los guiones se colapsan y recortan."""
    text = unicodedata.normalize("NFKD", raw)
    text = "".join(c for c in text if not unicodedata.combining(c)).translate(_TRANSLIT).lower()
    return _NOT_ALNUM.sub("-", text).strip("-")


def canonical_base(raw: str, prefix: str, max_rest: int) -> str | None:
    """Nombre canónico (con prefijo, sin `.md`) de lo que escribió quien lo asignó, o `None` si no hay nombre válido.

    Si el nombre ya empieza por el prefijo no se duplica. El nombre sin prefijo debe tener de 1 a `max_rest` caracteres;
    una cadena sin letras ni dígitos (`!!!`, `漢字`) o el prefijo solo (`skill`) no es un nombre.
    """
    slug = slugify(raw)
    rest = slug[len(prefix):] if slug.startswith(prefix) else slug
    if rest == prefix.rstrip("-") and slug == rest:
        return None  # «skill» a secas: el prefijo no es un nombre
    return prefix + rest if 1 <= len(rest) <= max_rest else None


def _strip_ext(name: str) -> str:
    return name[: -len(EXT)] if name.lower().endswith(EXT) else name


def _zone(path: str) -> tuple[str, tuple[str, int, str, str]] | None:
    """`(primer segmento tal como se escribió, tipo)` si `path` es una nota directa de `AG - SKILLS` o `PLANTILLAS`
    (no un INDICE); `None` si las reglas de nombre no aplican."""
    zone = meta_folder_of(path)
    if zone not in _KINDS or is_index_path(path):
        return None
    return path.split("/", 1)[0], _KINDS[zone]


def canonical_path(path: str) -> tuple[str, str | None]:
    """`(ruta canónica, código de rechazo)`. Fuera de `AG - SKILLS` y `PLANTILLAS` devuelve la ruta tal cual.

    Una skill vive directamente en `AG - SKILLS` (`skill:path` si hay subcarpetas); en `PLANTILLAS` las subcarpetas
    las rechaza la regla de plantillas (`plantilla:path`). Un nombre sin letras ni dígitos da `skill:name` o `plantilla:path`.
    """
    target = _zone(path)
    if target is None:
        return path, None
    first, (prefix, max_rest, bad_name, bad_path) = target
    rest = path.split("/")[1:]
    if len(rest) != 1:
        return path, bad_path
    base = canonical_base(_strip_ext(rest[0]), prefix, max_rest)
    if base is None:
        return path, bad_name
    return f"{first}/{base}{EXT}", None


def is_canonical(path: str) -> str | None:
    """Código de rechazo si la nota de `AG - SKILLS` no está en forma canónica (sync y carpetas movidas); `None` si sí.
    En `PLANTILLAS` lo comprueban `plantilla_rules.check_path`."""
    target = _zone(path)
    if target is None or meta_folder_of(path) != AG_SKILLS:
        return None
    canonical, code = canonical_path(path)
    return code if code is not None else (None if canonical == path else SKILL_NAME)
