"""Reglas de los atributos META de una nota (H-029).

La especificación vive en `tests/fixtures/attribute_rules.json` y la comparte el frontend
(`frontend/src/editor/attributeRules.ts`): ambos deben pasar los mismos casos.
"""
import re
import unicodedata

TITULO_MAX = 200
DESCRIPCION_MAX = 1000
TAGS_MAX = 20
TAG_MAX_LEN = 32
ESTADOS = ("borrador", "en_revision", "vigente", "archivado")
RESERVED_KEYS = ("ruta", "fecha_creacion", "fecha_actualizacion")

# Valor de estado ya normalizado (ver `_estado_lookup`) -> código estándar.
ESTADO_SYNONYMS = {
    "active": "vigente", "activo": "vigente", "vigente": "vigente",
    "draft": "borrador", "borrador": "borrador",
    "en revision": "en_revision", "revision": "en_revision",
    "archived": "archivado", "archivado": "archivado", "superseded": "archivado",
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


def estado_of(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    return ESTADO_SYNONYMS.get(re.sub(r"[-_\s]+", " ", _strip_accents(value.strip().lower())))


def validate_general(frontmatter: dict) -> str | None:
    """Código del primer error de los siete generales, o `None`. Las claves libres no se validan."""
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
    if "estado" in frontmatter and frontmatter["estado"] not in ESTADOS:
        return "estado"
    return None


def migrate_frontmatter(frontmatter: dict) -> dict:
    """Pasa las claves conocidas al conjunto nuevo y deja intactas las demás (ver la especificación)."""
    out: dict = {}

    def put(target: str, value: object, original: object) -> bool:
        if target not in out:
            out[target] = value
            return True
        if out[target] == value:
            return True
        if target + "_original" not in out:
            out[target + "_original"] = original
            return True
        return False

    for key, value in frontmatter.items():
        name = normalize_key(key)
        if name in ("titulo", "descripcion"):
            if isinstance(value, str):
                put(name, value, value)
            elif value is None:
                continue
            elif isinstance(value, (int, float)) and not isinstance(value, bool):
                put(name, str(value), value)
            else:
                out.setdefault(name + "_original", value)
        elif name == "tags":
            if isinstance(value, str):
                value = value.split(",")
            if not isinstance(value, list) or any(
                    isinstance(t, bool) or not isinstance(t, (str, int, float)) for t in value):
                out["tags_original"] = value
                continue
            tags: list[str] = []
            for item in value:
                tag = normalize_tag(str(item))
                if tag and tag not in tags:
                    tags.append(tag)
            if len(tags) > TAGS_MAX or len(value) > TAGS_MAX:
                out["tags_original"] = value
                tags = tags[:TAGS_MAX]
            put("tags", tags, value)
        elif name in ("status", "estado"):
            code = estado_of(value)
            if not (put("estado", code, value) if code else put("estado_original", value, value)):
                out[key] = value
        elif name == "fecha_creacion":
            if not put("fecha_creacion_original", value, value):
                out[key] = value
        elif name in ("ultima_actualizacion", "fecha_actualizacion"):
            if not put("fecha_actualizacion_original", value, value):
                out[key] = value
        elif name == "ruta":
            if not put("ruta_original", value, value):
                out[key] = value
        else:
            out[key] = value
    return out
