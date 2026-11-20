"""Acceso de un miembro invitado a una bóveda compartida (H-064 F3). Reglas puras, sin E/S.

El propietario y sus claves no pasan por aquí. Un miembro activo tiene concesiones `{carpeta, nivel}`: `*` es toda la bóveda,
salvo las zonas reservadas; `escritura` incluye `lectura`. Las zonas `AG - AGENTES`, `AG - SKILLS`, `AG - MENSAJES` y `BITACORA`
no las ve ni las escribe nunca, aunque tenga `*`; `PLANTILLAS` la lee cualquier miembro y no la escribe nadie. Lo que no está
concedido no se lee: quien llama responde como si no existiera.
"""
from typing import NamedTuple

from app.core.ag_rules import AG_AGENTES, AG_MENSAJES, AG_SKILLS, BITACORA, PLANTILLAS, meta_folder_of
from app.core.note_prefix import in_folder

ALL_FOLDERS = "*"
READ = "lectura"
WRITE = "escritura"
HIDDEN_ZONES = (AG_AGENTES, AG_SKILLS, AG_MENSAJES, BITACORA)


class Grant(NamedTuple):
    folder: str
    level: str


class MemberAccess(NamedTuple):
    grants: tuple[Grant, ...]


def level_of(access: MemberAccess, path: str) -> str | None:
    """`escritura`, `lectura` o `None` (sin acceso) del miembro sobre la nota de ruta `path`."""
    zone = meta_folder_of(path)
    if zone in HIDDEN_ZONES:
        return None
    if zone == PLANTILLAS:
        return READ
    level = None
    for grant in access.grants:
        if grant.folder == ALL_FOLDERS or in_folder(path, grant.folder):
            if grant.level == WRITE:
                return WRITE
            level = READ
    return level


def folder_level(access: MemberAccess, folder: str) -> str | None:
    """Nivel del miembro sobre la carpeta `folder` de archivos (H-064 F3b1), probando una ruta que cuelga de ella.

    Una carpeta vale lo que valen sus archivos: se evalúa `folder/x` (o `x` en la raíz, `folder` vacía). Así la zona
    reservada, `PLANTILLAS` y las concesiones se aplican igual que a una nota.
    """
    probe = f"{folder}/x" if folder else "x"
    return level_of(access, probe)


def can_read(access: MemberAccess, path: str) -> bool:
    return level_of(access, path) is not None


def can_write(access: MemberAccess, path: str) -> bool:
    return level_of(access, path) == WRITE
