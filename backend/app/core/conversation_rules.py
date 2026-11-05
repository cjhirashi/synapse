"""Conversaciones de `AG - MENSAJES` (H-042). Reglas puras, sin E/S.

Una conversación es una carpeta `AG - MENSAJES/<de> → <para> - <asunto> - <AAAA-MM-DD>/` con tres clases de documento:

- `000-cabecera.md`: la crea el servidor al escribirse el primer mensaje y guarda el `estado` (`abierta`|`cerrada`).
  Los dos agentes solo pueden cambiar `estado`; `cerrada_el` lo sella el servidor.
- `NNN-de-<id>.md` (NNN de 001 a 999): un mensaje, inmutable. `<id>` es `de` o `para` de la carpeta.
- `INDICE.md` (de la carpeta y de `AG - MENSAJES`): los genera el servidor.

Dos clases de reglas, como el resto de H-030/H-041:

- **Siempre activas** (no dependen de quién es el agente): forma de la ruta, participantes del nombre, inmutabilidad,
  la cabecera la crea el sistema y la sesión humana no escribe nada aquí (`check_write`, `check_cabecera`, ...).
- **Bajo `AGENT_ACCESS_MODE`** (dependen de quién es el agente): el remitente del nombre es el agente de la clave, la
  primera palabra la dice quien abre y solo los dos participantes cierran o reabren (`decide_mensaje`).

El sistema no restringe a qué agente se dirige un mensaje ni mira `AG - AGENTES`: eso lo enseña la skill.
"""
import re
from datetime import date
from typing import NamedTuple

from app.core.ag_rules import AG_MENSAJES, meta_folder_of
from app.core.agent_access import Actor, Decision, identity
from app.core.index_rules import changed_keys, is_index_path
from app.core.note_rules import path_key

ARROW = "→"
CABECERA = "000-cabecera.md"
ESTADOS = ("abierta", "cerrada")
ASUNTO_MAX = 100
NUMBER_MAX = 999

_ID = r"[a-z0-9][a-z0-9-]{0,31}"
_ID_RE = re.compile(_ID)
_FOLDER_RE = re.compile(rf"({_ID}) {ARROW} ({_ID}) - (.+) - (\d{{4}}-\d{{2}}-\d{{2}})")
_ASCII_ARROW_RE = re.compile(rf"^({_ID}) -> ({_ID}) - ")
_MSG_RE = re.compile(rf"(\d{{3}})-de-({_ID})\.md")

# Códigos de rechazo de forma (422 en REST; `reason` en `/sync`).
AGENTS_ONLY = "ag-mensajes:agents-only"
PATH = "ag-mensajes:path"
NOT_PARTICIPANT_NAME = "ag-mensajes:not-participant"
FROM_MISMATCH = "ag-mensajes:from-mismatch"
CABECERA_SHAPE = "ag-mensajes:cabecera"
CABECERA_SERVER = "ag-mensajes:cabecera-server"
IMMUTABLE = "ag-mensajes:immutable"

# Motivos de las reglas por agente (`agent_access_log.reason`; en `enforce` el 403 lleva el texto fijo de `PUBLIC_DETAIL`).
NOT_SENDER = "mensaje-not-sender"
NOT_INITIATOR = "mensaje-not-initiator"
NOT_PARTICIPANT = "mensaje-not-participant"

PUBLIC_DETAIL = {
    NOT_SENDER: "A message can only be written by the agent named in its file name",
    NOT_INITIATOR: "Only the requesting agent of a conversation can write its first message",
    NOT_PARTICIPANT: "Only the two agents of a conversation can close or reopen it",
}


class Conversation(NamedTuple):
    de: str
    para: str
    asunto: str
    inicio: str  # AAAA-MM-DD


class MensajePath(NamedTuple):
    kind: str                    # "indice" | "cabecera" | "mensaje"
    conversation: str | None     # nombre de la carpeta de la conversación; None en el INDICE de AG - MENSAJES
    de: str | None               # quien solicita (primer id del nombre de la carpeta)
    para: str | None             # el receptor
    asunto: str | None
    inicio: str | None
    sender: str | None           # solo en mensajes: el `<id>` de `NNN-de-<id>.md`
    number: int | None

    @property
    def folder(self) -> str:
        """Ruta de la carpeta de la conversación (`AG - MENSAJES/<nombre>`)."""
        assert self.conversation is not None
        return f"{AG_MENSAJES}/{self.conversation}"

    @property
    def participants(self) -> tuple[str, str]:
        assert self.de is not None and self.para is not None
        return (self.de, self.para)


def folder_name(de: str, para: str, asunto: str, inicio: str) -> str:
    return f"{de} {ARROW} {para} - {asunto} - {inicio}"


def parse_conversation(name: str) -> Conversation | None:
    """La conversación que describe el nombre de una carpeta de `AG - MENSAJES`, o `None` si no cabe en el formato."""
    match = _FOLDER_RE.fullmatch(name)
    if match is None:
        return None
    de, para, asunto, inicio = match.groups()
    if de == para or not asunto.strip() or len(asunto) > ASUNTO_MAX:
        return None
    try:
        date.fromisoformat(inicio)
    except ValueError:
        return None
    return Conversation(de, para, asunto, inicio)


def canonical_arrow(path: str) -> str:
    """Solo la REST: ` -> ` entre los dos ids del nombre de la carpeta se guarda como ` → ` (un modelo que escribe
    ASCII no choca con el formato). `/sync` y mover carpeta no reescriben: rechazan lo no canónico."""
    parts = path.split("/")
    if len(parts) >= 2 and path_key(parts[0]) == path_key(AG_MENSAJES):
        parts[1] = _ASCII_ARROW_RE.sub(rf"\1 {ARROW} \2 - ", parts[1], count=1)
        return "/".join(parts)
    return path


def parse_mensaje_path(path: str) -> MensajePath | None:
    """Estructura de una ruta bajo `AG - MENSAJES/`, o `None` si no cabe en el formato.

    Admite `AG - MENSAJES/INDICE.md`, `…/<carpeta>/INDICE.md`, `…/<carpeta>/000-cabecera.md` y `…/<carpeta>/NNN-de-<id>.md`.
    """
    parts = path.split("/")
    if len(parts) < 2 or path_key(parts[0]) != path_key(AG_MENSAJES):
        return None
    rest = parts[1:]
    if is_index_path(path) and len(rest) == 1:
        return MensajePath("indice", None, None, None, None, None, None, None)
    if len(rest) != 2:
        return None
    conv = parse_conversation(rest[0])
    if conv is None:
        return None
    base = (rest[0], conv.de, conv.para, conv.asunto, conv.inicio)
    if is_index_path(path):
        return MensajePath("indice", *base, None, None)
    if rest[1] == CABECERA:
        return MensajePath("cabecera", *base, None, None)
    match = _MSG_RE.fullmatch(rest[1])
    if match and 1 <= int(match[1]) <= NUMBER_MAX:
        return MensajePath("mensaje", *base, match[2], int(match[1]))
    return None


def check_mensaje_path(path: str) -> str | None:
    """Toda ruta bajo `AG - MENSAJES/` sigue el formato; si no, `ag-mensajes:path`."""
    if meta_folder_of(path) != AG_MENSAJES:
        return None
    return None if parse_mensaje_path(path) is not None else PATH


def is_conversation_folder(folder: str) -> Conversation | None:
    """La conversación de una ruta de carpeta `AG - MENSAJES/<nombre>`, o `None`."""
    parts = folder.split("/")
    if len(parts) != 2 or path_key(parts[0]) != path_key(AG_MENSAJES):
        return None
    return parse_conversation(parts[1])


def folder_description(folder: str) -> str | None:
    """`descripcion` del INDICE de una carpeta de conversación: la pone el servidor, así el agente no la fija."""
    conv = is_conversation_folder(folder)
    if conv is None:
        return None
    return f"Conversación de {conv.de} para {conv.para}: {conv.asunto}. Iniciada el {conv.inicio}."


# --- Cabecera ---

def normalize_estado(value: object) -> str | None:
    return value if isinstance(value, str) and value in ESTADOS else None


def new_cabecera(info: MensajePath) -> tuple[dict, str]:
    """Metadatos y cuerpo de la cabecera que crea el servidor con el primer mensaje."""
    frontmatter = {
        "titulo": f"{info.de} {ARROW} {info.para} - {info.asunto}",
        "descripcion": "Estado de la conversación (abierta o cerrada) y quiénes participan. La mantiene el servidor; "
                       "los dos agentes solo cambian `estado`.",
        "tags": ["conversacion"],
        "estado": "abierta",
        "de": info.de,
        "para": info.para,
        "asunto": info.asunto,
        "inicio": info.inicio,
    }
    body = (f"Conversación de {info.de} para {info.para}: {info.asunto}. Iniciada el {info.inicio}.\n\n"
            "El estado (`abierta` o `cerrada`) vive en los metadatos de este documento. Lo cambian solo los dos agentes "
            "de la conversación; el servidor sella `cerrada_el` y reabre la conversación cuando alguien escribe en ella.\n")
    return frontmatter, body


def check_cabecera(info: MensajePath, frontmatter: object) -> str | None:
    """Metadatos de `000-cabecera.md`: `de` y `para` iguales a los de la carpeta y `estado` abierta|cerrada."""
    if not isinstance(frontmatter, dict):
        return CABECERA_SHAPE
    if frontmatter.get("de") != info.de or frontmatter.get("para") != info.para:
        return CABECERA_SHAPE
    if normalize_estado(frontmatter.get("estado")) is None:
        return CABECERA_SHAPE
    return None


def check_mensaje_note(info: MensajePath, frontmatter: object) -> str | None:
    """Un mensaje puede traer `de`, y si lo trae es el remitente del nombre."""
    if isinstance(frontmatter, dict) and "de" in frontmatter and frontmatter["de"] != info.sender:
        return FROM_MISMATCH
    return None


def stamp_cabecera(old: dict | None, new: dict, now: str) -> dict:
    """Frontmatter de la cabecera con `cerrada_el` sellado por el servidor: al cerrar, la hora del cierre (se
    conserva si ya estaba cerrada); al reabrir, desaparece. Lo que envíe el cliente en `cerrada_el` se ignora."""
    out = {key: value for key, value in new.items() if key != "cerrada_el"}
    if out.get("estado") == "cerrada":
        was_closed = old is not None and old.get("estado") == "cerrada" and old.get("cerrada_el")
        out["cerrada_el"] = old["cerrada_el"] if was_closed else now
    return out


def merge_cabecera_update(old: dict, requested: dict | None) -> dict:
    """REST: lo único que un agente cambia de la cabecera es `estado`. Se parte de la cabecera vigente y se toma de la
    petición solo `estado` (si lo trae): el resto de lo que envíe se ignora, así `{estado: "cerrada"}` basta."""
    merged = dict(old)
    if isinstance(requested, dict) and "estado" in requested:
        merged["estado"] = requested["estado"]
    return merged


# --- Reglas de forma (siempre activas) ---

def check_write(
    op: str, info: MensajePath, *, old_frontmatter: dict | None = None, new_frontmatter: dict | None = None,
    content_changed: bool = False,
) -> str | None:
    """Código de rechazo de una escritura de un actor que NO es el sistema (agente o clave general; la sesión humana
    ni llega aquí: `AGENTS_ONLY`). `op`: `create`, `update`, `rename_or_move`, `delete` o `restore`; `info`: la ruta del
    documento que se toca (en un renombre, la de origen)."""
    if info.kind == "indice":
        return None  # los INDICES siguen las reglas de H-031; los crea el servidor
    if op == "create":
        if info.kind == "cabecera":
            return CABECERA_SERVER
        if info.sender not in info.participants:
            return NOT_PARTICIPANT_NAME
        return None
    if op != "update" or info.kind == "mensaje":
        return IMMUTABLE
    changed = set(changed_keys(old_frontmatter, new_frontmatter)) - {"cerrada_el", "estado"}
    return IMMUTABLE if changed or content_changed else None


# --- Reglas por agente (modo sombra / enforce) ---

def decide_mensaje(
    actor: Actor, op: str, info: MensajePath, *, first_message: bool, honor_declared: bool,
) -> Decision:
    """¿Puede el agente `actor` hacer `op` (`create` de un mensaje o `update` de la cabecera)? La sesión humana no se evalúa.
    No mira `AG - AGENTES`: un agente de solo lectura puede abrir y responder conversaciones."""
    if actor.kind == "human":
        return Decision(True)
    agent_id = identity(actor, honor_declared=honor_declared)
    if agent_id is None:
        return Decision(False, "general-key")
    if op == "create" and info.kind == "mensaje":
        if agent_id != info.sender:
            return Decision(False, NOT_SENDER)
        if first_message and info.sender != info.de:
            return Decision(False, NOT_INITIATOR)
        return Decision(True)
    if op == "update" and info.kind == "cabecera" and agent_id not in info.participants:
        return Decision(False, NOT_PARTICIPANT)
    return Decision(True)
