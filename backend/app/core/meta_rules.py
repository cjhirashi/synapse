"""Reglas de escritura de las carpetas META con lógica (H-030b) y de los documentos de sistema (H-041).
Puras, sin E/S; las llaman por igual la REST, la sincronización y la carpeta movida por la API.

- `BITACORA` es de solo lectura para todos (usuario y agentes): la escribe únicamente el servidor desde su
  registro de cambios, sin pasar por estas reglas. Sus INDICES siguen las reglas de H-031.
- `AG - MENSAJES` (H-042) es solo para agentes: la sesión humana no escribe ahí (`ag-mensajes:agents-only`).
- `PLANTILLAS` solo admite `plantilla-<nombre>.md` planas con una definición válida (ver `plantilla_rules`).
- Un documento de sistema (`core/system_docs.py`) no lo modifica nadie desde la plataforma: ni agentes, ni el
  usuario, ni por REST ni por sincronización. Solo el publicador, como `actor_kind == "system"`. El atributo
  `sistema` está reservado: una nota que no es de sistema no puede traerlo. Es independiente de shadow/enforce.
"""
from app.core import plantilla_rules, system_docs
from app.core.ag_rules import AG_MENSAJES, BITACORA, meta_folder_of
from app.core.index_rules import is_index_path


def in_mensajes(path: str | None) -> bool:
    """¿La ruta está dentro de `AG - MENSAJES/` (INDICES incluidos)? El buzón es solo para agentes (H-042)."""
    return path is not None and meta_folder_of(path) == AG_MENSAJES


def _in_bitacora(path: str | None) -> bool:
    return path is not None and meta_folder_of(path) == BITACORA and not is_index_path(path)


def check_system_write(
    *, path: str, prev_path: str | None = None, deleted: bool = False, frontmatter: object = None,
    actor_kind: str = "human",
) -> str | None:
    """Código de rechazo por tocar un documento de sistema o usar su atributo reservado, o `None` (H-041).
    Aplica a todo actor menos al publicador (`system`) y a todo modo (`off`, shadow, enforce)."""
    if actor_kind == "system":
        return None
    if system_docs.is_system_path(path) or system_docs.is_system_path(prev_path):
        return "sistema:readonly"
    if not deleted and isinstance(frontmatter, dict) and system_docs.ATTR in frontmatter:
        return "sistema:reserved"
    return None


def check_note_write(
    *, path: str, prev_path: str | None = None, deleted: bool = False, frontmatter: object = None,
    actor_kind: str = "human",
) -> str | None:
    """Código de rechazo de escribir una nota (crear, editar, mover, borrar o restaurar) o `None`.

    `path`: ruta tras la escritura; `prev_path`: ruta antes (`None` al crear). `actor_kind`: `human` (sesión
    de la app), `agent` o `general` (clave de API) o `system` (el publicador, solo dentro del proceso). No valida lo
    que depende de otros documentos (plantilla en uso, plantilla inexistente): eso lo hace el servicio con acceso a
    los datos.
    """
    # H-042: la sesión humana no escribe nada en el buzón entre agentes (el formato y la inmutabilidad de lo que escriben los
    # agentes los gobierna `conversation_rules`).
    if actor_kind == "human" and (in_mensajes(path) or in_mensajes(prev_path)):
        return "ag-mensajes:agents-only"
    if _in_bitacora(path) or _in_bitacora(prev_path):
        return "bitacora:readonly"
    if (code := check_system_write(
            path=path, prev_path=prev_path, deleted=deleted, frontmatter=frontmatter, actor_kind=actor_kind)) is not None:
        return code
    if not deleted and plantilla_rules.is_template_zone(path):
        if (code := plantilla_rules.check_path(path)) is not None:
            return code
        if (code := plantilla_rules.check_definition(frontmatter)) is not None:
            return code
    return None
