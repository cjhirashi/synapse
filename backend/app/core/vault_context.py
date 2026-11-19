"""Contexto de acceso a la bóveda: punto único de construcción del nombre de base.

Fases futuras extienden VaultContext con permisos del invitado (H-064 F2+).
"""

from typing import NamedTuple

USER_DB_PREFIX = "synapse_user_"


def user_db_name(user_id: str) -> str:
    """Nombre de la base CouchDB para un usuario."""
    return f"{USER_DB_PREFIX}{user_id}"


class VaultContext(NamedTuple):
    """Contexto de acceso a una bóveda: identidad, base y permisos.

    Fases siguientes añaden `grants` (permisos de lectura/escritura por carpeta).
    """

    owner_id: str  # Dueño de la bóveda (usuario de CouchDB)
    db: str  # Nombre de la base CouchDB (synapse_user_<owner_id>)
    actor_id: str  # Usuario que actúa (solicitante de la API)
    is_owner: bool  # True si actor_id == owner_id


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
