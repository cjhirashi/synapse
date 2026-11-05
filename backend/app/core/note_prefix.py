"""Filtro por carpeta del listado de notas (H-030 E1). Reglas puras, sin E/S.

La vista `by_path` de CouchDB indexa la ruta con `NFKC` + minúsculas (lo que sabe hacer JavaScript);
`path_key` usa `casefold`. Por eso el rango de la vista es un superconjunto y el servicio filtra
siempre con `path_key`, la equivalencia de unicidad de rutas.
"""
import unicodedata

from app.core.note_rules import check_path, path_key


def view_key(text: str) -> str:
    """Clave que emite la vista `by_path` para una ruta o carpeta."""
    return unicodedata.normalize("NFKC", text).lower()


def check_prefix(prefix: object) -> str | None:
    """Código de rechazo de `prefix` (una carpeta, sin barra final) o `None`. Mismas reglas que una ruta."""
    if not isinstance(prefix, str) or not prefix:
        return "validation-error:prefix"
    # Una carpeta es válida si lo es la ruta de una nota dentro de ella.
    return None if check_path(f"{prefix}/x.md") is None else "validation-error:prefix"


def in_folder(path: str, prefix: str) -> bool:
    """¿`path` está bajo la carpeta `prefix`, comparando por segmentos con la equivalencia `path_key`?"""
    return path_key(path).startswith(path_key(prefix) + "/")
