"""Carpetas reservadas de bóveda y formato de `AG - MENSAJES` (H-030 E3/E4). Reglas puras, sin E/S.

Las usan la REST (`services/note_content_service.py`, `folder_service.py`) y la sincronización
(`services/sync_push.py`). Los códigos de rechazo son texto fijo del catálogo (nunca el valor enviado).

Carpetas reservadas, siempre en la raíz de la bóveda: `AG - SKILLS`, `AG - MENSAJES`, `AG - AGENTES`, `BITACORA`
y `PLANTILLAS` (la lógica de las dos últimas es de H-030b: `core/meta_rules.py`). No se renombran, no se mueven
y su INDICE no se borra. La equivalencia de nombres es la de `path_key` (NFKC + casefold), como en `INDICE.md`,
pero siempre se escriben en su forma canónica, en MAYÚSCULAS (`meta-folder:case`).
"""
from app.core.index_rules import folder_of, is_index_path
from app.core.note_rules import path_key

AG_SKILLS = "AG - SKILLS"
AG_MENSAJES = "AG - MENSAJES"
AG_AGENTES = "AG - AGENTES"
BITACORA = "BITACORA"
PLANTILLAS = "PLANTILLAS"

AG_FOLDERS = (AG_SKILLS, AG_MENSAJES, AG_AGENTES)
META_FOLDERS = AG_FOLDERS + (BITACORA, PLANTILLAS)

# Descripción del INDICE de cada carpeta reservada (atributo general `descripcion`).
FOLDER_DESCRIPTIONS = {
    AG_SKILLS: "Skills para los agentes que usan esta bóveda: cómo navegarla y trabajar en cada una de sus secciones.",
    AG_MENSAJES: "Buzón entre agentes: una carpeta por conversación, «de → para - asunto - fecha», con un documento por mensaje. Solo la escriben los agentes; la conversación se borra a los 30 días sin mensajes nuevos.",
    AG_AGENTES: "Registro de los agentes que gestionan esta bóveda y las carpetas en las que pueden escribir.",
    BITACORA: "Bitácora automática: un documento por día con cada cambio de la bóveda (qué, cuándo, quién). Solo lectura.",
    PLANTILLAS: "Plantillas para crear documentos nuevos: dónde se usan, sus atributos, su estilo y su estructura base.",
}

_META_KEYS = {path_key(name): name for name in META_FOLDERS}

def first_segment(path: str) -> str:
    return path.split("/", 1)[0]


def meta_folder_of(path: str) -> str | None:
    """Nombre canónico de la carpeta reservada que contiene `path` (primer segmento), o `None`.

    Una nota suelta en la raíz cuyo nombre coincide no está «dentro» de la carpeta: ver `is_reserved_name`.
    """
    if "/" not in path:
        return None
    return _META_KEYS.get(path_key(first_segment(path)))


def is_reserved_name(path: str) -> bool:
    """¿Una nota de la raíz se llama exactamente como una carpeta reservada? Taparía a la carpeta. Un
    `BITACORA.md` (con extensión) no choca con la carpeta `BITACORA/` y se admite."""
    return "/" not in path and path_key(path) in _META_KEYS


def is_meta_folder(folder: str) -> bool:
    """¿`folder` (sin barra final) es exactamente una carpeta reservada de la raíz?"""
    return path_key(folder) in _META_KEYS


# --- Estructura ---

def check_create(path: str) -> str | None:
    """Creación o destino de un renombre: ninguna nota toma el nombre de una carpeta reservada, y la carpeta
    reservada se escribe siempre en su forma canónica (MAYÚSCULAS: `PLANTILLAS`, nunca `Plantillas`)."""
    if is_reserved_name(path):
        return "reserved-name:path"
    if "/" in path:
        first = first_segment(path)
        canonical = _META_KEYS.get(path_key(first))
        if canonical is not None and first != canonical:
            return "meta-folder:case"
    return None


def check_folder_move(from_: str, to: str | None = None) -> str | None:
    """Mover o renombrar una carpeta: la reservada no se mueve. Mover otra carpeta *hacia* una reservada
    (fusionarla en ella) sí se admite; el formato de lo que cae dentro lo validan las reglas de cada nota.
    Única excepción: una carpeta reservada escrita con otras mayúsculas (`Plantillas`) puede pasar a su forma
    canónica (`PLANTILLAS`)."""
    if not is_meta_folder(from_):
        return None
    canonical = _META_KEYS[path_key(from_)]
    return None if from_ != canonical and to == canonical else "meta-folder:rename"


def check_index_delete(path: str) -> str | None:
    """El INDICE de una carpeta reservada nunca se borra (el resto de INDICES siguen las reglas de H-031)."""
    if is_index_path(path) and folder_of(path) and is_meta_folder(folder_of(path)):
        return "meta-folder:index-delete"
    return None
