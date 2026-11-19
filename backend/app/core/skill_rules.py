"""Skills de bóveda: propietario, invitados y estado (H-041 E3). Reglas puras, sin E/S.

Una skill es una nota `AG - SKILLS/skill-<nombre>.md` (plana, no de sistema). Sus atributos:

- `propietario`: lista de ids de agente (gestores de la bóveda) que la poseen; todos la editan, mueven y borran, y la
  usan. Al crear lo fija el servidor (`[agente de la clave]`); un agente no cambia la lista (se la cambia el usuario).
  El texto antiguo (`"paulina"`) se sigue aceptando como lista de un elemento y se normaliza a lista en cuanto se
  escribe la skill. Falta solo si `estado` es `archivado`.
- `agentes`: ids de los agentes invitados, que solo pueden *usarla* (eso lo validan las instrucciones de cada agente,
  no el servidor). Por defecto vacía; nunca incluye a un propietario; solo gestores de la bóveda.
- `estado: archivado`: skill inactiva, sin propietario y sin invitados, hasta que el usuario le asigne un gestor.

Se separan dos clases de reglas, igual que el resto de H-030:

- **Forma y coherencia de los datos** (`check_shape`, `check_people`): siempre activas. Una skill activa nunca queda sin
  propietario, y quien escribe desde la sesión humana no puede dejar propietarios ni invitados que no sean gestores.
- **Reglas por agente** (`decide_skill`): las gobierna `AGENT_ACCESS_MODE` (sombra solo registra; `enforce` rechaza con 403).
"""
import re

from app.core.agent_access import Actor, Decision, Registration, identity
from app.core.ag_rules import AG_SKILLS, meta_folder_of
from app.core.index_rules import is_index_path
from app.core.system_docs import is_system_path

OWNER = "propietario"
GUESTS = "agentes"
ESTADO = "estado"
ARCHIVED = "archivado"
# Estado con el que vuelve a la vida una skill archivada al asignarle propietario: el nuevo la revisa antes de darla por buena.
REACTIVATED = "en revisión"
GUESTS_MAX = 20
OWNERS_MAX = 10
_AGENT_ID = re.compile(r"[a-z0-9][a-z0-9-]{0,31}")

# Códigos de rechazo de forma (422 en REST; `reason` en `/sync`).
SKILL_OWNER = "skill:propietario"
SKILL_GUESTS = "skill:agentes"
SKILL_STATE = "skill:estado"

# Motivos de las reglas por agente (`agent_access_log.reason`; en `enforce` el 403 lleva el texto fijo de `PUBLIC_DETAIL`).
NOT_OWNER = "skill-not-owner"
OWNER_IMMUTABLE = "skill-owner-immutable"
INVITEE_NOT_MANAGER = "skill-invitee-not-manager"

PUBLIC_DETAIL = {
    NOT_OWNER: "Only the owner of a skill may edit or delete it",
    OWNER_IMMUTABLE: "The owner of a skill is set by the system and an agent cannot change it",
    INVITEE_NOT_MANAGER: "Only managers of the vault can be invited to a skill",
}


def is_skill_path(path: str | None) -> bool:
    """¿Es una skill de bóveda? Nota directa de `AG - SKILLS`, que no sea un INDICE ni un documento de sistema.
    Lo anterior a H-041 (skills en subcarpetas) no cuenta: se tolera mientras no se renombre."""
    if path is None or meta_folder_of(path) != AG_SKILLS or is_index_path(path) or is_system_path(path):
        return False
    return len(path.split("/")) == 2


def is_archived(frontmatter: dict | None) -> bool:
    return (frontmatter or {}).get(ESTADO) == ARCHIVED


def owners_of(frontmatter: dict | None) -> list[str]:
    """Los propietarios (ids sin repetir), con el texto antiguo como lista de un elemento. Ausente o mal formado = `[]`."""
    value = (frontmatter or {}).get(OWNER)
    if isinstance(value, str):
        return [value] if value else []
    if isinstance(value, list):
        return list(dict.fromkeys(o for o in value if isinstance(o, str) and o))
    return []


def owner_of(frontmatter: dict | None) -> str | None:
    """El primer propietario (el «principal» de las vistas que muestran uno solo), o `None`."""
    owners = owners_of(frontmatter)
    return owners[0] if owners else None


def guests_of(frontmatter: dict | None) -> list[str]:
    value = (frontmatter or {}).get(GUESTS)
    return [g for g in value if isinstance(g, str)] if isinstance(value, list) else []


def is_manager(registry: dict[str, Registration], agent_id: str) -> bool:
    registration = registry.get(agent_id)
    return registration is not None and registration.estado == "activo"


# --- Forma y coherencia (siempre activas) ---

def check_shape(frontmatter: dict) -> str | None:
    """`skill:propietario|agentes|estado` o `None`. Una skill activa tiene al menos un propietario (lista de ids sin
    repetir, hasta 10; el texto de un id también vale); una archivada, ni propietarios ni invitados; los invitados son
    ids sin repetir, hasta 20, y ninguno es propietario."""
    if OWNER in frontmatter:
        raw = frontmatter[OWNER]
        owners = [raw] if isinstance(raw, str) else raw
        if (not isinstance(owners, list) or not 0 < len(owners) <= OWNERS_MAX or len(set(map(str, owners))) != len(owners)
                or not all(isinstance(o, str) and _AGENT_ID.fullmatch(o) for o in owners)):
            return SKILL_OWNER
    owners = owners_of(frontmatter)
    if GUESTS in frontmatter:
        guests = frontmatter[GUESTS]
        if (not isinstance(guests, list) or len(guests) > GUESTS_MAX or len(set(map(str, guests))) != len(guests)
                or not all(isinstance(g, str) and _AGENT_ID.fullmatch(g) for g in guests) or any(g in owners for g in guests)):
            return SKILL_GUESTS
    if is_archived(frontmatter):
        return SKILL_STATE if OWNER in frontmatter or guests_of(frontmatter) else None
    return None if OWNER in frontmatter else SKILL_OWNER


def check_people(frontmatter: dict, registry: dict[str, Registration], old: dict | None = None) -> str | None:
    """Propietarios e invitados que se **introducen** deben ser gestores (registrados y activos) de la bóveda. Lo que ya
    estaba (`old`) no se vuelve a exigir: editar otra cosa de una skill cuyo propietario salió no se bloquea; de eso
    se ocupa el flujo del gestor que sale."""
    if any(not is_manager(registry, owner) for owner in owners_of(frontmatter) if owner not in owners_of(old)):
        return SKILL_OWNER
    if any(not is_manager(registry, guest) for guest in guests_of(frontmatter) if guest not in guests_of(old)):
        return SKILL_GUESTS
    return None


# --- Quién escribe: el propietario lo fija el servidor ---

def seal_owner(frontmatter: dict, agent_id: str | None) -> dict:
    """Metadatos con los propietarios fijados por el servidor: `[agente que crea]`. Sin identidad no se fija (y
    `check_shape` rechaza una skill activa sin propietario)."""
    sealed = {k: v for k, v in frontmatter.items() if k != OWNER}
    if agent_id is not None:
        sealed[OWNER] = [agent_id]
    return sealed


def keep_owner(frontmatter: dict, old: dict | None) -> dict:
    """Un agente no cambia los propietarios: si no los reenvía (los metadatos se reemplazan completos), conserva los
    actuales."""
    if OWNER in frontmatter or not owners_of(old):
        return frontmatter
    return {**frontmatter, OWNER: owners_of(old)}


def normalize_owner(frontmatter: dict) -> dict:
    """El texto antiguo de `propietario` pasa a lista de un elemento (al escribir la skill)."""
    if isinstance(frontmatter.get(OWNER), str) and frontmatter[OWNER]:
        return {**frontmatter, OWNER: [frontmatter[OWNER]]}
    return frontmatter


# --- Reglas por agente (modo sombra / enforce) ---

def decide_skill(
    actor: Actor, registry: dict[str, Registration], op: str, old: dict | None, new: dict | None, *,
    honor_declared: bool,
) -> Decision:
    """¿Puede el agente `actor` hacer `op` (`create|update|move|delete|restore`) sobre una skill? `old`: los metadatos
    antes (`None` al crear); `new`: después (`None` al borrar). La sesión humana no se evalúa."""
    if actor.kind == "human":
        return Decision(True)
    agent_id = identity(actor, honor_declared=honor_declared)
    if agent_id is None:
        return Decision(False, "general-key")
    registration = registry.get(agent_id)
    if registration is None:
        return Decision(False, "not-registered")
    if registration.estado != "activo":
        return Decision(False, "suspended")
    if op != "create":
        if agent_id not in owners_of(old):
            return Decision(False, NOT_OWNER)
        if new is not None and set(owners_of(new)) != set(owners_of(old)):
            return Decision(False, OWNER_IMMUTABLE)
    if new is not None and any(
            not is_manager(registry, guest) for guest in guests_of(new) if guest not in guests_of(old)):
        return Decision(False, INVITEE_NOT_MANAGER)
    return Decision(True)


def assign_owner(frontmatter: dict, owner: str) -> dict:
    """Asigna `owner` como único propietario: sale de `agentes` si estaba, y una skill archivada vuelve a la vida."""
    out = {k: v for k, v in frontmatter.items() if k not in (OWNER, GUESTS)}
    out[OWNER] = [owner]
    out[GUESTS] = [g for g in guests_of(frontmatter) if g != owner]
    if is_archived(frontmatter):
        out[ESTADO] = REACTIVATED
    return out


def archive(frontmatter: dict) -> dict:
    """Metadatos de una skill archivada: inactiva, sin propietario y sin invitados."""
    out = {k: v for k, v in frontmatter.items() if k not in (OWNER, GUESTS)}
    out[ESTADO] = ARCHIVED
    return out


def drop_owner(frontmatter: dict, agent_id: str) -> dict:
    """Quita `agent_id` de los propietarios (un gestor que sale); la skill conserva a los demás."""
    return {**frontmatter, OWNER: [o for o in owners_of(frontmatter) if o != agent_id]}


def drop_guest(frontmatter: dict, agent_id: str) -> dict:
    """Quita `agent_id` de los invitados (un gestor que sale)."""
    return {**frontmatter, GUESTS: [g for g in guests_of(frontmatter) if g != agent_id]}
