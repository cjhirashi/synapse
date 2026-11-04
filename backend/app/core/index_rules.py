"""Reglas puras de los INDICES automáticos (H-031 Paso 2).

Sin E/S: las usa la REST (`services/note_content_service.py`) y la sincronización
(`services/sync_push.py`). Los códigos de rechazo salen de la especificación
`tests/fixtures/indice_cuerpo.json` sección `rules`.
"""
from app.core.note_rules import path_key

INDEX_NAME = "INDICE.md"


def is_index_path(path: str) -> bool:
    """¿La ruta (último segmento) es la de un INDICE?

    Compara la clave NFKC + casefold del último segmento de la ruta
    con la del nombre reservado.
    """
    if not path:
        return False
    last_segment = path.split("/")[-1]
    return path_key(last_segment) == path_key(INDEX_NAME)


def folder_of(path: str) -> str:
    """Carpeta que contiene la nota.

    Para `"A/B/Nota.md"` devuelve `"A/B"`.
    Para `"Nota.md"` (raíz) devuelve `""`.
    """
    parts = path.rsplit("/", 1)
    return parts[0] if len(parts) > 1 else ""


def index_path_for(folder: str) -> str:
    """Ruta del INDICE para una carpeta.

    Para `""` (raíz) devuelve `"INDICE.md"`.
    Para `"A/B"` devuelve `"A/B/INDICE.md"`.
    """
    if folder == "":
        return INDEX_NAME
    return f"{folder}/{INDEX_NAME}"


def ancestor_folders(path: str) -> list[str]:
    """Carpetas ancestro de una nota, de la raíz hacia dentro, incluyendo la raíz.

    Para `"A/B/Nota.md"` devuelve `["", "A", "A/B"]`.
    Para `"Nota.md"` (raíz) devuelve `[""]`.
    """
    folder = folder_of(path)
    ancestors = [""]
    if folder:
        parts = folder.split("/")
        for i in range(len(parts)):
            ancestors.append("/".join(parts[:i+1]))
    return ancestors


def changed_keys(old: dict | None, new: dict | None) -> list[str]:
    """Claves del frontmatter cuyo valor difiere, sin contar fechas.

    Devuelve lista de claves que:
    - Están en uno de los dos pero no en el otro (excluidas `fecha_creacion`/`fecha_actualizacion`)
    - O tienen un valor distinto en ambos

    `fecha_creacion` y `fecha_actualizacion` se ignoran (son selladas por el servidor).
    """
    old = old or {}
    new = new or {}
    excluded = {"fecha_creacion", "fecha_actualizacion"}

    changed = []
    all_keys = set(old.keys()) | set(new.keys())
    for key in all_keys:
        if key in excluded:
            continue
        if old.get(key) != new.get(key):
            changed.append(key)

    return changed


def check_op(
    op: str,
    path: str,
    *,
    to: str | None = None,
    changed: list[str] | tuple[str, ...] = (),
    content_changed: bool = False,
    other_live_below_after: int = 0,
) -> str | None:
    """Valida una operación sobre una nota o INDICE.

    Devuelve el código de rechazo o `None` si pasa.

    Operaciones:
    - `create_user`: creación por un usuario/agente → rechaza si `path` es un INDICE
    - `system_create`: creación automática por el servidor → siempre pasa
    - `rename_or_move`: renombrar/mover
    - `edit`: edición (sólo de INDICES)
    - `delete`: borrado (sólo de INDICES)
    """
    if op == "create_user":
        if is_index_path(path):
            return "reserved-name:path"
        return None

    if op == "system_create":
        return None

    if op == "rename_or_move":
        if is_index_path(path):
            return "index-readonly:path"
        if is_index_path(to or ""):
            return "reserved-name:path"
        return None

    if op == "edit":
        if not is_index_path(path):
            return None

        # La nota actual es un INDICE
        if content_changed:
            return "index-readonly:content"

        # Si `changed` contiene algo distinto de `descripcion`, es readonly:attr
        for key in changed:
            if key != "descripcion":
                return "index-readonly:attr"

        return None

    if op == "delete":
        if not is_index_path(path):
            return None

        # Es un INDICE
        folder = folder_of(path)

        # INDICE de la raíz siempre se rechaza
        if folder == "":
            return "index-root:delete"

        # INDICE de una carpeta no-raíz
        if other_live_below_after > 0:
            return "index-readonly:delete"

        return None

    return None
