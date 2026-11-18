"""Guardia de límites de creación (H-060): rechaza crear lo que pasaría el límite del usuario.

Una instancia por petición. `limits` ya viene resuelto por rol (`limits.for_role`): admin y super admin traen todo en
`None` y la guardia nunca consulta nada. Una operación sin límite aplicable no toca CouchDB ni la base SQL.
"""
from sqlalchemy.orm import Session

from app.core.errors import DocumentLimitReached, StorageLimitReached, VaultLimitReached
from app.core.limits import UNLIMITED, UserLimits, counts_as_document, for_role
from app.core.models.user import User
from app.core.ports.vault_port import VaultPort
from app.services import limit_usage


class LimitGuard:
    def __init__(self, limits: UserLimits, port: VaultPort, db: str, session: Session | None = None) -> None:
        self._limits = limits
        self._port = port
        self._db = db
        self._session = session

    def check_new_vault(self, pending: int = 0) -> None:
        cap = self._limits.max_vaults
        if cap is not None and len(limit_usage.active_vaults(self._port, self._db)) + pending >= cap:
            raise VaultLimitReached(f"{cap} vaults")

    def check_new_note(self, vault_id: str, path: str, pending: int = 0) -> None:
        """`pending`: notas nuevas del mismo lote de sincronización que aún no están en CouchDB."""
        cap = self._limits.max_notes_per_vault
        if cap is None or not counts_as_document(path):
            return
        if len(limit_usage.user_notes(self._port, self._db, vault_id)) + pending >= cap:
            raise DocumentLimitReached(f"{cap} documents in {vault_id}")

    def check_new_file(self, vault_id: str, size: int) -> None:
        cap = self._limits.max_storage_bytes_per_vault
        if cap is None or self._session is None:
            return
        if limit_usage.storage_bytes(self._session, vault_id) + size > cap:
            raise StorageLimitReached(f"{cap} bytes in {vault_id}")


def limits_of(user: User) -> UserLimits:
    """Los límites que rigen de verdad para la cuenta (ninguno si es admin o super admin)."""
    return for_role(user.role.name, UserLimits(
        user.max_vaults, user.max_notes_per_vault, user.max_storage_bytes_per_vault))


def guard_for(session: Session, user_id: str, port: VaultPort) -> LimitGuard:
    """La guardia de la cuenta `user_id`; sin límites si la cuenta no existe (otra capa ya la rechaza)."""
    user = session.get(User, user_id)
    if user is None:
        return LimitGuard(UNLIMITED, port, "")
    return LimitGuard(limits_of(user), port, user.couchdb_name, session)
