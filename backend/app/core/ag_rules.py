"""Carpetas reservadas de bóveda y formato de `AG - MENSAJES` (H-030 E3/E4). Reglas puras, sin E/S.

Las usan la REST (`services/note_content_service.py`, `folder_service.py`) y la sincronización
(`services/sync_push.py`). Los códigos de rechazo son texto fijo del catálogo (nunca el valor enviado).

Carpetas reservadas, siempre en la raíz de la bóveda: `AG - SKILLS`, `AG - MENSAJES`, `AG - AGENTES` y, solo
como nombre (su lógica es de H-030b), `BITACORA` y `PLANTILLAS`. No se renombran, no se mueven y su INDICE no
se borra. La equivalencia de nombres es la de `path_key` (NFKC + casefold), como en `INDICE.md`.
"""
import re
from datetime import datetime
from typing import NamedTuple

from app.core.index_rules import changed_keys, folder_of, is_index_path
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
    AG_MENSAJES: "Buzón entre agentes: una carpeta por destinatario y conversación, con una nota por mensaje.",
    AG_AGENTES: "Registro de los agentes que gestionan esta bóveda y las carpetas en las que pueden escribir.",
    BITACORA: "Bitácora diaria de cambios de la bóveda (reservada; su lógica llega con H-030b).",
    PLANTILLAS: "Plantillas para crear documentos nuevos en la bóveda (reservada; su lógica llega con H-030b).",
}

_META_KEYS = {path_key(name): name for name in META_FOLDERS}

CABECERA = "000-cabecera.md"
_AGENT_ID = r"[a-z0-9][a-z0-9-]{0,31}"
_AGENT_ID_RE = re.compile(_AGENT_ID)
_CONV_RE = re.compile(r"^(\d{8})-(\d{4})-(.+)$")
_MSG_RE = re.compile(rf"^(\d{{3}})-de-({_AGENT_ID})\.md$")
ESTADOS_CONVERSACION = ("abierta", "cerrada")


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


# --- Estructura (E3) ---

def check_create(path: str) -> str | None:
    """Creación o destino de un renombre: ninguna nota toma el nombre de una carpeta reservada."""
    return "reserved-name:path" if is_reserved_name(path) else None


def check_folder_move(from_: str) -> str | None:
    """Mover o renombrar una carpeta: la reservada no se mueve. Mover otra carpeta *hacia* una reservada
    (fusionarla en ella) sí se admite; el formato de lo que cae dentro lo validan las reglas de cada nota."""
    return "meta-folder:rename" if is_meta_folder(from_) else None


def check_index_delete(path: str) -> str | None:
    """El INDICE de una carpeta reservada nunca se borra (el resto de INDICES siguen las reglas de H-031)."""
    if is_index_path(path) and folder_of(path) and is_meta_folder(folder_of(path)):
        return "meta-folder:index-delete"
    return None


# --- AG - MENSAJES (E4) ---

class MensajePath(NamedTuple):
    kind: str            # "indice" | "cabecera" | "mensaje"
    para: str | None
    conversation: str | None
    de: str | None       # solo en mensajes: el remitente del nombre `NNN-de-<id>.md`


def conversation_folder(para: str, conversation: str) -> str:
    return f"{AG_MENSAJES}/{para}/{conversation}"


def _valid_conversation(name: str) -> bool:
    match = _CONV_RE.fullmatch(name)
    if match is None:
        return False
    try:
        datetime.strptime(match[1] + match[2], "%Y%m%d%H%M")
    except ValueError:
        return False
    return bool(match[3].strip())


def parse_mensaje_path(path: str) -> MensajePath | None:
    """Estructura de una ruta bajo `AG - MENSAJES/`, o `None` si no cabe en el formato.

    `AG - MENSAJES/<para>/<AAAAMMDD-HHMM>-<asunto>/000-cabecera.md` y `.../NNN-de-<id>.md` (NNN ≥ 001);
    los INDICES de cada nivel los genera el servidor.
    """
    parts = path.split("/")
    if len(parts) < 2 or path_key(parts[0]) != path_key(AG_MENSAJES):
        return None
    rest = parts[1:]
    if is_index_path(path) and len(rest) <= 3:
        folders = rest[:-1]
        if len(folders) >= 1 and not _AGENT_ID_RE.fullmatch(folders[0]):
            return None
        if len(folders) == 2 and not _valid_conversation(folders[1]):
            return None
        return MensajePath("indice", folders[0] if folders else None, folders[1] if len(folders) == 2 else None, None)
    if len(rest) != 3 or not _AGENT_ID_RE.fullmatch(rest[0]) or not _valid_conversation(rest[1]):
        return None
    if rest[2] == CABECERA:
        return MensajePath("cabecera", rest[0], rest[1], None)
    match = _MSG_RE.fullmatch(rest[2])
    if match and match[1] != "000":
        return MensajePath("mensaje", rest[0], rest[1], match[2])
    return None


def check_mensaje_path(path: str) -> str | None:
    """Toda ruta bajo `AG - MENSAJES/` sigue el formato; si no, `ag-mensajes:path`."""
    if meta_folder_of(path) != AG_MENSAJES:
        return None
    return None if parse_mensaje_path(path) is not None else "ag-mensajes:path"


def normalize_conversation_estado(value: object) -> str | None:
    return value if isinstance(value, str) and value in ESTADOS_CONVERSACION else None


def check_cabecera(path_info: MensajePath, frontmatter: object) -> str | None:
    """Metadatos de `000-cabecera.md`: `de` y `para` (este igual al de la ruta) y `estado` abierta|cerrada."""
    if not isinstance(frontmatter, dict):
        return "ag-mensajes:cabecera"
    de, para = frontmatter.get("de"), frontmatter.get("para")
    if not (isinstance(de, str) and _AGENT_ID_RE.fullmatch(de) and para == path_info.para):
        return "ag-mensajes:cabecera"
    if normalize_conversation_estado(frontmatter.get("estado")) is None:
        return "ag-mensajes:cabecera"
    return None


def check_mensaje_note(path_info: MensajePath, frontmatter: object) -> str | None:
    """Un mensaje puede traer `de`, y si lo trae es el remitente del nombre."""
    if isinstance(frontmatter, dict) and "de" in frontmatter and frontmatter["de"] != path_info.de:
        return "ag-mensajes:from-mismatch"
    return None


def stamp_cabecera(old: dict | None, new: dict, now: str) -> dict:
    """Frontmatter de la cabecera con `cerrada_el` sellado por el servidor: al cerrar, la hora del cierre (se
    conserva si ya estaba cerrada); al reabrir, desaparece. Lo que envíe el cliente en `cerrada_el` se ignora."""
    out = {key: value for key, value in new.items() if key != "cerrada_el"}
    if out.get("estado") == "cerrada":
        was_closed = old is not None and old.get("estado") == "cerrada" and old.get("cerrada_el")
        out["cerrada_el"] = old["cerrada_el"] if was_closed else now
    return out


def check_agent_mensaje_op(
    op: str, path_info: MensajePath, *, agent_id: str, is_admin: bool,
    old_frontmatter: dict | None = None, new_frontmatter: dict | None = None,
) -> str | None:
    """Reglas que solo valen para una clave con identidad de agente (la sesión humana no las sufre).

    - Los mensajes son inmutables: no se editan, mueven ni borran. Tampoco la cabecera, salvo `estado`.
    - Crear: el remitente (`de` de la cabecera o del nombre) es el agente de la clave.
    - Cerrar o reabrir (cambiar `estado`): solo `de`, `para` o un administrador.
    """
    if op == "create":
        if path_info.kind == "cabecera" and (new_frontmatter or {}).get("de") != agent_id:
            return "ag-mensajes:from-mismatch"
        if path_info.kind == "mensaje" and path_info.de != agent_id:
            return "ag-mensajes:from-mismatch"
        return None
    if path_info.kind == "indice":
        return None
    if op in ("delete", "rename_or_move") or path_info.kind == "mensaje":
        return "ag-mensajes:immutable"
    # update de la cabecera
    changed = set(changed_keys(old_frontmatter, new_frontmatter)) - {"cerrada_el"}
    if changed - {"estado"}:
        return "ag-mensajes:immutable"
    participants = {(old_frontmatter or {}).get("de"), (old_frontmatter or {}).get("para")}
    if "estado" in changed and not (is_admin or agent_id in participants):
        return "ag-mensajes:forbidden"
    return None
