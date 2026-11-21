"""Autoría de lo que escribe un invitado de una bóveda compartida (H-064 F4). Reglas puras, sin E/S.

Una persona invitada y sus agentes de IA escriben en la base del propietario, pero no son el propietario: lo que escriben consta
a nombre de la persona y, si fue un agente suyo, también del agente (autoría doble). Sin esto, una tarea de un invitado
se leería como del propietario (`user`).
"""


def task_author(user_id: str, agent_id: str | None) -> str:
    """`created_by` / `updated_by` de una tarea: `guest:<usuario>` o `guest:<usuario>/agent:<agente>`."""
    return f"guest:{user_id}" if agent_id is None else f"guest:{user_id}/agent:{agent_id}"


def log_author(email: str, agent_id: str | None) -> tuple[str, str]:
    """`(tipo, nombre)` del autor de un cambio en la BITACORA: la persona (`human`) o su agente (`agent`, con el correo de la persona)."""
    if agent_id is None:
        return "human", email
    return "agent", f"{agent_id} (de {email})"
