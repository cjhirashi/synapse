"""Reglas de los atributos META de una nota (H-029).

La especificación vive en `tests/fixtures/attribute_rules.json` y la comparte el frontend
(`frontend/src/editor/attributeRules.ts`): ambos deben pasar los mismos casos.
"""
import re
import unicodedata
from datetime import date

TITULO_MAX = 200
DESCRIPCION_MAX = 1000
TAGS_MAX = 20
TAG_MAX_LEN = 32
ESTADO_MAX_LEN = 32
# Estados de partida; el usuario puede añadir otros (cada bóveda guarda los suyos en su catálogo).
ESTADOS_ESTANDAR = ("borrador", "en proceso", "en revisión", "aprobado", "en implementación", "implementado")
# `ruta` es del sistema (se calcula desde la ubicación de la nota): no se guarda en el frontmatter.
RESERVED_KEYS = ("ruta",)

# Valor de estado ya normalizado para comparar (ver `_estado_lookup`) -> estado estándar o traducción.
ESTADO_SYNONYMS = {
    "borrador": "borrador", "draft": "borrador",
    "en revision": "en revisión",
    "aprobado": "aprobado", "aprobada": "aprobado", "active": "aprobado", "activo": "aprobado", "vigente": "aprobado",
    "en implementacion": "en implementación", "en desarrollo": "en implementación",
    "en proceso": "en proceso", "en progreso": "en proceso",
    "implementado": "implementado", "implementada": "implementado", "completado": "implementado",
    "completada": "implementado", "completo": "implementado", "completa": "implementado", "aplicada": "implementado",
    "archived": "archivado",
}


def _strip_accents(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text) if not unicodedata.combining(c))


def normalize_key(key: str) -> str | None:
    value = re.sub(r"[^a-z0-9]+", "_", _strip_accents(key).lower()).strip("_")
    return value or None


def normalize_tag(tag: str) -> str | None:
    text = unicodedata.normalize("NFC", tag).strip().lower()
    text = "".join(c if (c.isalpha() or c.isdigit() or c in "-_") else "_" for c in text)
    text = re.sub(r"_+", "_", text).strip("_-")[:TAG_MAX_LEN].rstrip("_-")
    return text or None


def normalize_estado(value: object) -> str | None:
    """Forma guardada de un estado: minúsculas, espacios simples (`-` y `_` pasan a espacio), con acentos,
    de 1 a 32 caracteres. `None` si no es texto o queda vacío o demasiado largo."""
    if not isinstance(value, str):
        return None
    text = re.sub(r"[-_\s]+", " ", unicodedata.normalize("NFC", value).strip().lower()).strip()
    return text if text and len(text) <= ESTADO_MAX_LEN else None


def legacy_estado(value: object) -> str | None:
    """Estado de un valor ANTIGUO al migrar: si está en la tabla de sinónimos, su estado estándar; si no, el
    propio valor normalizado (pasa a ser un estado nuevo de la bóveda)."""
    text = normalize_estado(value)
    if text is None or text == "estado":  # «estado» literal: valor de plantilla, no un estado
        return None
    return ESTADO_SYNONYMS.get(re.sub(r"[-_\s]+", " ", _strip_accents(text)), text)


def normalize_date(value: object) -> str | None:
    """`AAAA-MM-DD` de un valor que empieza por una fecha válida (se descarta el texto que sigue); si no, `None`."""
    if not isinstance(value, str):
        return None
    match = re.match(r"\d{4}-\d{2}-\d{2}", value.strip())
    if not match:
        return None
    try:
        date.fromisoformat(match.group())
    except ValueError:
        return None
    return match.group()


def validate_general(frontmatter: dict) -> str | None:
    """Código del primer error de los generales, o `None`. Las claves libres no se validan."""
    for key in RESERVED_KEYS:
        if key in frontmatter:
            return f"reservada:{key}"
    titulo = frontmatter.get("titulo")
    if "titulo" in frontmatter and (not isinstance(titulo, str) or len(titulo) > TITULO_MAX):
        return "titulo"
    descripcion = frontmatter.get("descripcion")
    if "descripcion" in frontmatter and (not isinstance(descripcion, str) or len(descripcion) > DESCRIPCION_MAX):
        return "descripcion"
    if "tags" in frontmatter:
        tags = frontmatter["tags"]
        if (not isinstance(tags, list) or len(tags) > TAGS_MAX
                or any(not isinstance(t, str) or normalize_tag(t) != t for t in tags)):
            return "tags"
    for key in ("fecha_creacion", "fecha_actualizacion"):
        if key in frontmatter and (not isinstance(frontmatter[key], str) or normalize_date(frontmatter[key]) != frontmatter[key]):
            return key
    if "estado" in frontmatter and (
            not isinstance(frontmatter["estado"], str) or normalize_estado(frontmatter["estado"]) != frontmatter["estado"]):
        return "estado"
    return None


def migrate_frontmatter_detailed(frontmatter: dict) -> tuple[dict, list[dict]]:
    """Pasa las claves conocidas a los nombres nuevos, con el MISMO valor (limpio), y deja intactas las demás.

    Devuelve `(nuevo, descartados)`; cada descartado es `{"key", "value", "reason"}`: un valor que no cabe en
    su atributo (fecha no válida, estado que no es texto, `ruta` que ahora es del sistema…) no se guarda con
    otro nombre; queda en este informe para que se revise.
    """
    out: dict = {}
    dropped: list[dict] = []

    def drop(key: str, value: object, reason: str) -> None:
        dropped.append({"key": key, "value": value, "reason": reason})

    def put(key: str, target: str, value: object) -> None:
        if target not in out:
            out[target] = value
        elif out[target] != value:
            drop(key, value, f"duplica a «{target}» con otro valor; se conserva el primero")

    for key, value in frontmatter.items():
        name = normalize_key(key)
        if name in ("titulo", "descripcion"):
            if isinstance(value, list) and value and all(isinstance(x, str) for x in value):
                value = ", ".join(value)
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                value = str(value)
            if isinstance(value, str):
                put(key, name, value)
            elif value is not None:
                drop(key, value, "no es texto")
        elif name == "tags":
            if isinstance(value, str):
                value = value.split(",")
            if not isinstance(value, list):
                drop(key, value, "no es una lista")
                continue
            tags: list[str] = []
            for item in value:
                tag = normalize_tag(str(item)) if isinstance(item, (str, int, float)) and not isinstance(item, bool) else None
                if tag and tag not in tags:
                    tags.append(tag)
            put(key, "tags", tags[:TAGS_MAX])
        elif name in ("status", "estado"):
            estado = legacy_estado(value)
            if estado is None:
                drop(key, value, "no es un estado válido (texto de 1 a 32 caracteres, y no el valor de plantilla «estado»)")
            else:
                put(key, "estado", estado)
        elif name in ("fecha_creacion", "ultima_actualizacion", "fecha_actualizacion"):
            fecha = normalize_date(value)
            if fecha is None:
                drop(key, value, "no es una fecha AAAA-MM-DD")
            else:
                put(key, "fecha_creacion" if name == "fecha_creacion" else "fecha_actualizacion", fecha)
        elif name == "ruta":
            drop(key, value, "la ruta ahora la calcula el sistema desde la ubicación de la nota")
        else:
            out[key] = value
    return out, dropped


def migrate_frontmatter(frontmatter: dict) -> dict:
    return migrate_frontmatter_detailed(frontmatter)[0]
