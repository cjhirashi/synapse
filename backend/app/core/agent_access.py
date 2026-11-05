"""Permisos de escritura de los agentes por bóveda (H-030 E6). Reglas puras, sin E/S.

Quién escribe dónde sale del registro `AG - AGENTES/<id>.md` de cada bóveda (frontmatter `carpetas` y
`estado`). La sesión humana (cookie) no tiene restricción. Un agente administrador (flag `is_admin` de su
clave, que vive en la base de control y no en notas) tampoco. Un agente registrado y activo escribe en las
carpetas de su registro, en `AG - SKILLS/<su-id>/` y en `AG - MENSAJES`; uno no registrado o suspendido solo
en `AG - MENSAJES`. Leer no se restringe. `*` en `carpetas` = toda la bóveda salvo las carpetas reservadas.
"""
from typing import NamedTuple

from app.core.ag_rules import AG_AGENTES, AG_MENSAJES, AG_SKILLS, meta_folder_of
from app.core.note_prefix import check_prefix
from app.core.note_rules import path_key

ESTADOS_REGISTRO = ("activo", "suspendido")
ALL_FOLDERS = "*"


class Actor(NamedTuple):
    """Quién hace una petición de datos. `kind`: human (cookie), agent (clave con agente) o general (clave
    sin agente, la compartida de antes de H-030)."""

    kind: str
    agent_id: str | None = None
    is_admin: bool = False
    key_label: str | None = None
    declared: str | None = None  # `X-Agent-Id` de una clave general: solo para el modo sombra


class Registration(NamedTuple):
    agent_id: str
    carpetas: tuple[str, ...]
    estado: str


class Decision(NamedTuple):
    allowed: bool
    reason: str | None = None


def actor_of(principal) -> Actor:
    """El `Actor` de un `TokenPayload`."""
    if not principal.via_key:
        return Actor("human")
    if principal.agent_id:
        return Actor("agent", principal.agent_id, principal.agent_admin, principal.key_label)
    return Actor("general", None, False, principal.key_label, principal.declared_agent)


def registration_path(agent_id: str) -> str:
    return f"{AG_AGENTES}/{agent_id}.md"


def parse_registration(path: str, frontmatter: object) -> Registration | None:
    """El registro de una nota `AG - AGENTES/<id>.md`, o `None` si no es un registro válido (una nota mal
    formada no da permisos)."""
    parts = path.split("/")
    if len(parts) != 2 or path_key(parts[0]) != path_key(AG_AGENTES) or not parts[1].endswith(".md"):
        return None
    agent_id = parts[1][:-3]
    if not isinstance(frontmatter, dict) or frontmatter.get("estado") not in ESTADOS_REGISTRO:
        return None
    carpetas = frontmatter.get("carpetas")
    if not isinstance(carpetas, list) or not all(
            isinstance(c, str) and (c == ALL_FOLDERS or check_prefix(c) is None) for c in carpetas):
        return None
    return Registration(agent_id, tuple(carpetas), frontmatter["estado"])


def check_registration_frontmatter(path: str, frontmatter: object) -> str | None:
    """Rechazo (`ag-agentes:registro`) de una nota de `AG - AGENTES/` que no es un registro válido. Los
    INDICES quedan fuera: los llama el servidor."""
    if parse_registration(path, frontmatter) is None:
        return "ag-agentes:registro"
    return None


def _covers(carpeta: str, path: str) -> bool:
    return path_key(path).startswith(path_key(carpeta) + "/")


def _decide_path(actor_id: str, registration: Registration | None, path: str) -> Decision:
    zone = meta_folder_of(path)
    if zone not in (AG_MENSAJES, AG_AGENTES, AG_SKILLS):
        zone = None  # BITACORA y PLANTILLAS solo reservan su nombre hasta H-030b: se escriben como cualquier carpeta
    if zone == AG_MENSAJES:
        return Decision(True)
    if registration is None:
        return Decision(False, "not-registered")
    if registration.estado != "activo":
        return Decision(False, "suspended")
    if zone == AG_AGENTES:
        return Decision(False, "registry-readonly")
    if zone == AG_SKILLS:
        return Decision(True) if _covers(f"{AG_SKILLS}/{actor_id}", path) else Decision(False, "skills-own-folder")
    if ALL_FOLDERS in registration.carpetas or any(_covers(c, path) for c in registration.carpetas):
        return Decision(True)
    return Decision(False, "folder-not-assigned")


def decide(actor: Actor, registry: dict[str, Registration], paths: list[str], *, honor_declared: bool) -> Decision:
    """¿Puede `actor` escribir en todas las `paths`? (rutas de notas o `carpeta/x.md` representativas).

    `honor_declared`: en modo sombra se evalúa la clave general como el agente que declara `X-Agent-Id`;
    con cumplimiento activo una clave general no tiene identidad y cuenta como no registrada.
    """
    if actor.kind == "human" or (actor.kind == "agent" and actor.is_admin):
        return Decision(True)
    agent_id = actor.agent_id if actor.kind == "agent" else (actor.declared if honor_declared else None)
    if agent_id is None:
        registration = None
        who = "general-key"
    else:
        registration = registry.get(agent_id)
        who = agent_id
    for path in paths:
        verdict = _decide_path(who, registration, path)
        if not verdict.allowed:
            return verdict if agent_id is not None else Decision(False, "general-key")
    return Decision(True)


def decide_files(actor: Actor, registry: dict[str, Registration], *, honor_declared: bool) -> Decision:
    """Escribir un archivo (`/files`): su carpeta es una etiqueta lógica de una sola pieza, no una ruta de la
    bóveda, así que no se ata a `carpetas`; basta ser un agente registrado y activo en la bóveda."""
    if actor.kind == "human" or (actor.kind == "agent" and actor.is_admin):
        return Decision(True)
    agent_id = actor.agent_id if actor.kind == "agent" else (actor.declared if honor_declared else None)
    if agent_id is None:
        return Decision(False, "general-key")
    registration = registry.get(agent_id)
    if registration is None:
        return Decision(False, "not-registered")
    return Decision(registration.estado == "activo", None if registration.estado == "activo" else "suspended")
