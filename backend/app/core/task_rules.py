"""Reglas de las tareas de bóveda (H-053). Puras, sin E/S.

Dos niveles (raíz y subtareas), estado de la raíz derivado de sus subtareas, ruta indicativa y permisos de los
agentes. La persona (sesión) y el agente administrador no tienen restricción; un agente registrado y activo
lee todo, crea tareas y subtareas, cambia `status` y `notes` de las que tiene asignadas, y reasigna, edita o
borra solo las que creó. Una clave general o un agente sin registro solo lee.
"""
import re
from collections.abc import Iterable

from app.core.agent_access import Actor, Decision, Registration, identity

STATUSES = ("pending", "in_progress", "done", "cancelled")
CLOSED_STATUSES = ("done", "cancelled")
STATUS_ES = {"pending": "Pendiente", "in_progress": "En progreso", "done": "Hecha", "cancelled": "Cancelada"}
PRIORITIES = ("low", "medium", "high")
ASSIGNEE_TYPES = ("user", "agent")

USER = "user"  # `created_by` / `updated_by` de la persona; un agente es `agent:<id>`

MAX_PATH = 500
# Campos que puede cambiar quien solo tiene la tarea asignada; el resto es del creador.
ASSIGNEE_FIELDS = frozenset({"status", "notes"})

_CONTROL = re.compile(r"[\x00-\x1f\x7f\\]")


def normalize_path(path: str | None) -> str | None:
    """Ruta indicativa de la tarea: sin `/` en los extremos ni niveles vacíos, `.` o `..`. `None` o vacía → `None`.
    Solo se valida la forma: no se comprueba que el documento o la carpeta existan."""
    if path is None or not path.strip():
        return None
    clean = path.strip().strip("/")
    if not clean or len(clean) > MAX_PATH or _CONTROL.search(clean):
        raise ValueError("path")
    if any(level in ("", ".", "..") or level != level.strip() for level in clean.split("/")):
        raise ValueError("path")
    return clean


def derive_parent_status(child_statuses: Iterable[str]) -> str | None:
    """Estado de una raíz con subtareas, o `None` si no tiene (conserva el suyo). Todas cerradas → `done` si alguna
    se hizo, `cancelled` si todas se cancelaron; alguna en curso o hecha → `in_progress`; si no, `pending`."""
    statuses = list(child_statuses)
    if not statuses:
        return None
    if all(s in CLOSED_STATUSES for s in statuses):
        return "done" if "done" in statuses else "cancelled"
    if any(s in ("in_progress", "done") for s in statuses):
        return "in_progress"
    return "pending"


def actor_label(actor: Actor, *, honor_declared: bool = True) -> str:
    """Quién consta como autor: `user` para la persona, `agent:<id>` para un agente (el declarado, en una clave general)."""
    if actor.kind == "human":
        return USER
    agent_id = identity(actor, honor_declared=honor_declared)
    return f"agent:{agent_id}" if agent_id else "agent:general"


def decide_task(
    actor: Actor,
    registry: dict[str, Registration],
    op: str,
    *,
    created_by: str | None,
    assignee_agent_id: str | None,
    changed: frozenset[str] = frozenset(),
    honor_declared: bool,
) -> Decision:
    """¿Puede `actor` hacer `op` (`create` | `update` | `delete`) sobre una tarea? `created_by` y `assignee_agent_id`
    son los de la tarea vigente (ignorados al crear); `changed`, los campos que `update` modifica."""
    if actor.kind == "human" or (actor.kind == "agent" and actor.is_admin):
        return Decision(True)
    agent_id = identity(actor, honor_declared=honor_declared)
    if agent_id is None:
        return Decision(False, "general-key")
    registration = registry.get(agent_id)
    if registration is None:
        return Decision(False, "not-registered")
    if registration.estado != "activo":
        return Decision(False, "suspended")
    if op == "create":
        return Decision(True)
    mine = created_by == f"agent:{agent_id}"
    if mine:
        return Decision(True)
    if op == "update" and assignee_agent_id == agent_id and changed <= ASSIGNEE_FIELDS:
        return Decision(True)
    return Decision(False, "task-not-yours")
