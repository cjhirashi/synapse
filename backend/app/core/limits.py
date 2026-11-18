"""Límites por usuario (H-060). Reglas puras, sin E/S: las usan los servicios de bóvedas, notas, archivos y el reajuste.

Un límite nulo es «sin límite». Solo los invitados tienen límites: admin y super admin nunca (`for_role`).
«Documento» es una nota del usuario; no cuentan los de sistema (índices, carpetas reservadas `AG - …`, `BITACORA` y
`PLANTILLAS`, ni los documentos de sistema que la plataforma replica).
"""
from dataclasses import dataclass

from app.core.ag_rules import meta_folder_of
from app.core.index_rules import is_index_path
from app.core.security import DEFAULT_USER_PASSWORD  # noqa: F401  (contraseña inicial; el primer ingreso obliga a cambiarla)
from app.core.system_docs import is_system_path

DEFAULT_MAX_VAULTS = 2
DEFAULT_MAX_NOTES_PER_VAULT = 100
DEFAULT_MAX_STORAGE_BYTES_PER_VAULT = 500 * 1024 * 1024

GRACE_DAYS = 30  # plazo tras bajar un límite y de la baja de una cuenta antes de la purga

ROLE_SUPER_ADMIN = "super_admin"
ROLE_ADMIN = "admin"
ROLE_GUEST = "guest"
ADMIN_ROLES = (ROLE_SUPER_ADMIN, ROLE_ADMIN)


@dataclass(frozen=True)
class UserLimits:
    max_vaults: int | None = None
    max_notes_per_vault: int | None = None
    max_storage_bytes_per_vault: int | None = None


UNLIMITED = UserLimits()


def for_role(role: str, limits: UserLimits) -> UserLimits:
    """Los límites que rigen de verdad: los de un invitado; ninguno para admin y super admin."""
    return limits if role == ROLE_GUEST else UNLIMITED


def counts_as_document(path: str | None) -> bool:
    """¿La nota cuenta contra el límite de documentos? No: índices, carpetas reservadas y documentos de sistema."""
    if not path:
        return False
    return not (is_index_path(path) or meta_folder_of(path) is not None or is_system_path(path))
