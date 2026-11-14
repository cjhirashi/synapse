"""Reglas de los proyectos de bóveda (H-058). Puras, sin E/S.

Un proyecto agrupa tareas de su misma bóveda (como en Asana): título, descripción, responsable (la persona o un agente),
estado y color. Una tarea pertenece como máximo a un proyecto y sus subtareas toman el de su raíz. Los permisos por agente
son los de las tareas (`task_rules.decide_task`).
"""

STATUSES = ("active", "on_hold", "completed")
STATUS_ES = {"active": "Activo", "on_hold": "En pausa", "completed": "Completado"}
COLORS = ("gray", "blue", "green", "red", "orange", "yellow", "purple", "pink")
