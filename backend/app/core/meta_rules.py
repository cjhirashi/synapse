"""Reglas de escritura de las carpetas META con lógica (H-030b): BITACORA, PLANTILLAS y la skill de cajón.
Puras, sin E/S; las llaman por igual la REST, la sincronización y la carpeta movida por la API.

- `BITACORA` es de solo lectura para todos (usuario y agentes): la escribe únicamente el servidor desde su
  registro de cambios, sin pasar por estas reglas. Sus INDICES siguen las reglas de H-031.
- `PLANTILLAS` solo admite `plantilla-<nombre>.md` planas con una definición válida (ver `plantilla_rules`).
- La skill de cajón (`AG - SKILLS/skill-bovedas-synapse.md`) solo la modifica una sesión humana, nunca una
  clave de API (aunque sea del dueño).
"""
from app.core import plantilla_rules
from app.core.ag_rules import AG_SKILLS, BITACORA, meta_folder_of
from app.core.index_rules import is_index_path
from app.core.note_rules import path_key

SKILL_CAJON = f"{AG_SKILLS}/skill-bovedas-synapse.md"
_CAJON_KEY = path_key(SKILL_CAJON)


def is_skill_cajon(path: str | None) -> bool:
    return path is not None and path_key(path) == _CAJON_KEY


def _in_bitacora(path: str | None) -> bool:
    return path is not None and meta_folder_of(path) == BITACORA and not is_index_path(path)


def check_note_write(
    *, path: str, prev_path: str | None = None, deleted: bool = False, frontmatter: object = None,
    actor_kind: str = "human",
) -> str | None:
    """Código de rechazo de escribir una nota (crear, editar, mover, borrar o restaurar) o `None`.

    `path`: ruta tras la escritura; `prev_path`: ruta antes (`None` al crear). `actor_kind`: `human` (sesión
    de la app), `agent` o `general` (clave de API). No valida lo que depende de otros documentos (plantilla en
    uso, plantilla inexistente): eso lo hace el servicio con acceso a los datos.
    """
    if _in_bitacora(path) or _in_bitacora(prev_path):
        return "bitacora:readonly"
    if actor_kind != "human" and (is_skill_cajon(path) or is_skill_cajon(prev_path)):
        return "skill-cajon:human-only"
    if not deleted and plantilla_rules.is_template_zone(path):
        if (code := plantilla_rules.check_path(path)) is not None:
            return code
        if (code := plantilla_rules.check_definition(frontmatter)) is not None:
            return code
    return None
