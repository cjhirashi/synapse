"""Contexto de acceso a la bóveda: punto único de construcción del nombre de base.

Para el propietario la base es la de la sesión; para un miembro invitado es la del propietario, con sus concesiones (H-064 F3).
"""

from typing import NamedTuple

from app.core.vault_access import MemberAccess

USER_DB_PREFIX = "synapse_user_"


def user_db_name(user_id: str) -> str:
    """Nombre de la base CouchDB para un usuario."""
    return f"{USER_DB_PREFIX}{user_id}"


class VaultContext(NamedTuple):
    """Contexto de acceso a una bóveda: identidad, base y, si quien actúa es un miembro invitado, sus concesiones."""

    owner_id: str  # Dueño de la bóveda (usuario de CouchDB)
    db: str  # Nombre de la base CouchDB (synapse_user_<owner_id>)
    actor_id: str  # Usuario que actúa (solicitante de la API)
    is_owner: bool  # True si actor_id == owner_id
    member: MemberAccess | None = None  # concesiones del invitado; None para el propietario


def owner_context(user_id: str) -> VaultContext:
    """Contexto del dueño de una bóveda accediendo sus propios datos.

    Dueño: owner_id == actor_id; is_owner = True; db = synapse_user_<user_id>.
    """
    return VaultContext(
        owner_id=user_id,
        db=user_db_name(user_id),
        actor_id=user_id,
        is_owner=True,
    )


def member_context(owner_id: str, actor_id: str, access: MemberAccess) -> VaultContext:
    """Contexto de un miembro activo: la base del propietario con las concesiones del invitado."""
    return VaultContext(owner_id=owner_id, db=user_db_name(owner_id), actor_id=actor_id, is_owner=False, member=access)
