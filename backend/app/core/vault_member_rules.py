"""Validación de concesiones de membresía en bóvedas (H-064 F2). Reglas puras, sin E/S.

Las concesiones (carpeta + nivel) están sujetas a:
- Formato: carpeta es "*" o ruta válida de carpeta (1–600 caracteres, sin barras inicial/final, sin segmentos vacíos).
- Nivel: "lectura" o "escritura".
- Carpetas reservadas: `AG - AGENTES`, `AG - SKILLS`, `BITACORA`, `AG - MENSAJES`, `PLANTILLAS` no se conceden por nombre exacta.
- No se permite conceder la raíz en F2 (reutiliza reglas de `note_rules.py` para validar forma).
"""
import unicodedata

from app.core.note_rules import path_key
from app.core.ag_rules import AG_AGENTES, AG_SKILLS, BITACORA, AG_MENSAJES, PLANTILLAS


RESERVED_FOLDERS = (AG_AGENTES, AG_SKILLS, BITACORA, AG_MENSAJES, PLANTILLAS)
FOLDER_MAX = 600


def _is_reserved_start(folder: str) -> bool:
    """¿La carpeta empieza con alguna carpeta reservada?"""
    for reserved in RESERVED_FOLDERS:
        # Comprobar si el folder exacto o si folder es una subcarpeta de reserved
        folder_key = path_key(folder)
        reserved_key = path_key(reserved)
        # El folder exacto no se concede
        if folder_key == reserved_key:
            return True
        # El folder como subcarpeta (ej. "AG - AGENTES/algo") tampoco
        if folder_key.startswith(reserved_key + "/"):
            return True
    return False


def check_grants(grants: list[dict] | None) -> str | None:
    """Código de validación o `None` si válido.

    Valida:
    - No vacío y máximo 100.
    - Cada grant: `folder` ("*" o ruta válida), `level` ("lectura" o "escritura").
    - Sin carpetas repetidas.
    - Sin carpetas reservadas.
    """
    if not grants:
        return "validation-error:grants"
    if len(grants) > 100:
        return "validation-error:grants"

    seen_folders = set()
    for grant in grants:
        if not isinstance(grant, dict):
            return "validation-error:grants"

        folder = grant.get("folder")
        level = grant.get("level")

        if not isinstance(folder, str) or not isinstance(level, str):
            return "validation-error:grants"

        # Validar nivel
        if level not in ("lectura", "escritura"):
            return "validation-error:grants"

        # Validar carpeta
        if folder == "*":
            # Permitida
            pass
        else:
            # Validar forma: 1–600 caracteres, sin barra inicial/final, sin segmentos vacíos
            if not folder or len(folder) > FOLDER_MAX:
                return "validation-error:grants"
            if folder.startswith("/") or folder.endswith("/"):
                return "validation-error:grants"
            # Sin segmentos vacíos (p. ej. "a//b" o "a/ /b")
            segments = folder.split("/")
            if any(not seg.strip() for seg in segments):
                return "validation-error:grants"
            # Sin caracteres de control
            if any(unicodedata.category(c) == "Cc" for c in folder):
                return "validation-error:grants"
            # Sin "." ni ".."
            if any(seg in (".", "..") for seg in segments):
                return "validation-error:grants"
            # Carpeta reservada: rechaza
            if _is_reserved_start(folder):
                return "validation-error:grants"

        # Sin carpetas repetidas
        if folder in seen_folders:
            return "validation-error:grants"
        seen_folders.add(folder)

    return None
