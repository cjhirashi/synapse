"""Reglas puras de las notas (SPEC-0008 §3, RF-005, RF-013, RF-016; PLAN-0008 §2.1).

Sin E/S: las usa el push validado (`services/sync_push.py`) y las espeja el cliente
(`frontend/src/notes/noteRules.ts`); ambos lados recorren `tests/fixtures/note_rules_cases.json`.
Las funciones `check_*` devuelven el código de rechazo del push (`validation-error:<campo>`,
`not-normalized:path`) o `None` si el valor pasa; el servidor nunca normaliza (PLAN-0005 P-3).
"""
import json
import unicodedata

PATH_MAX = 300                          # puntos de código, tras normalizar
CONTENT_MAX_BYTES = 2 * 1024 * 1024     # bytes UTF-8 (RF-016)
FRONTMATTER_MAX_BYTES = 64 * 1024       # JSON compacto en UTF-8 (PLAN-0008 P-4)
FRONTMATTER_MAX_DEPTH = 32                # niveles de anidamiento (raíz = 1; SPEC-0010 Converge 1, H1)

# Claves de una revisión viva de nota (contrato `note.schema.json`). `frontmatter` es la
# única opcional (spec §3).
NOTE_KEYS = (
    "_id", "_rev", "_revisions", "type", "vault_id", "path", "frontmatter", "content",
    "created_at", "updated_at", "deleted_at",
)
NOTE_REQUIRED = tuple(key for key in NOTE_KEYS if key != "frontmatter")

# Propiedad Unicode `White_Space`: lo que quita `strip_whitespace` de pydantic-core (`str::trim`
# de Rust) en los campos de bóveda (PLAN-0005 §2.5 nota b). Difiere de `str.strip()` de Python,
# que además quita U+001C…U+001F; U+FEFF no es `White_Space` y no se quita.
_WHITE_SPACE = frozenset(
    "\t\n\v\f\r \u0085           "
    "      　"
)


def normalize_path(path: str) -> str:
    """Quita los espacios a los lados de cada segmento (`/` separa carpetas)."""
    return "/".join(segment.strip("".join(_WHITE_SPACE)) for segment in path.split("/"))


def _well_formed(text: str) -> bool:
    """Unicode bien formado: sin sustitutos sueltos (no se pueden codificar en UTF-8)."""
    try:
        text.encode("utf-8")
    except UnicodeEncodeError:
        return False
    return True


def check_path(value: object) -> str | None:
    """Código de rechazo de `path` o `None`.

    La longitud y los caracteres de control se miden sobre la forma normalizada, como
    hace pydantic con los nombres de bóveda; después se exige que el valor ya lo esté.
    Un segmento vacío (`a//b`, `/a`, `a/`, `a/ /b`) daría una carpeta sin nombre (P-4).
    """
    if not isinstance(value, str) or not _well_formed(value):
        return "validation-error:path"
    normalized = normalize_path(value)
    # SPEC-0010 RF-007: el último segmento (el nombre del archivo) no puede ser sólo `.md` (sin
    # mayúsculas): sería una nota sin nombre, como la que producía `titleToPath("Carpeta/")`.
    valid = (
        1 <= len(normalized) <= PATH_MAX
        and all(normalized.split("/"))
        and not any(unicodedata.category(char) == "Cc" for char in normalized)
        # Misma equivalencia que `path_key` (NFKC + casefold): `.ｍｄ` (anchos completos) es `.md`.
        and path_key(normalized.split("/")[-1]) != ".md"
    )
    if not valid:
        return "validation-error:path"
    return None if normalized == value else "not-normalized:path"


def path_key(path: str) -> str:
    """Clave de unicidad de la ruta: NFKC + `casefold` de la ruta completa (SPEC-0008 §3).

    Es la misma fórmula que `name_key` de bóvedas (`services/vault_service.py`); se repite
    aquí porque `core/` no importa de `services/`. La batería común fija que coinciden.
    """
    return unicodedata.normalize("NFKC", path).casefold()


def check_content(value: object) -> str | None:
    """`content`: texto bien formado de a lo sumo 2 MiB en bytes UTF-8 (RF-016)."""
    if not isinstance(value, str) or not _well_formed(value):
        return "validation-error:content"
    # Un texto de más de 2 MiB de puntos de código ya pasa de 2 MiB de bytes: se evita
    # codificarlo entero cuando es claramente excesivo.
    if len(value) > CONTENT_MAX_BYTES or len(value.encode("utf-8")) > CONTENT_MAX_BYTES:
        return "validation-error:content"
    return None


def nesting_depth_exceeds(value: object, limit: int) -> bool:
    """¿Algún valor anida más de `limit` niveles (el objeto raíz cuenta como 1)?

    Recorrido iterativo: no depende de la pila de Python (ni de capturar `RecursionError`), que además
    cambia con la versión del intérprete y con la profundidad a la que se llame.
    """
    stack = [(value, 1)]
    while stack:
        node, depth = stack.pop()
        children = node.values() if isinstance(node, dict) else node if isinstance(node, list) else ()
        for child in children:
            if isinstance(child, (dict, list)):
                if depth + 1 > limit:
                    return True
                stack.append((child, depth + 1))
    return False


def check_frontmatter(value: object) -> str | None:
    """`frontmatter`: objeto JSON de a lo sumo 32 niveles de profundidad cuya serialización compacta
    pesa ≤ 64 KiB en UTF-8.

    El tope de profundidad (SPEC-0010, Converge 1) se comprueba **antes** de serializar: `json.loads`
    admite cientos de niveles pero `json.dumps` revienta con `RecursionError` cerca de los 950, y con
    400–940 se almacenaba sin límite alguno.

    Sólo valores del JSON estándar: `NaN`, `Infinity` y `1e999` (que Python lee como infinito)
    no se pueden serializar y CouchDB los rechazaría al reenviar el lote (VB-1).
    """
    if not isinstance(value, dict) or nesting_depth_exceeds(value, FRONTMATTER_MAX_DEPTH):
        return "validation-error:frontmatter"
    try:
        # `allow_nan=False` lanza `ValueError` ante un número no finito.
        size = len(json.dumps(
            value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8"))
    except (UnicodeEncodeError, ValueError):  # sustituto suelto en una cadena; número no finito
        return "validation-error:frontmatter"
    return None if size <= FRONTMATTER_MAX_BYTES else "validation-error:frontmatter"
