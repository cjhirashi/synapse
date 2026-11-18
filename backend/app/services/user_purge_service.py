"""Purga definitiva de una cuenta (H-060): nada suyo queda en Postgres, CouchDB ni MinIO.

Corre pasados `GRACE_DAYS` días de la baja (`users.deleted_at`). Los almacenes externos se limpian antes que las filas: si
MinIO o CouchDB fallan, la cuenta y sus filas siguen ahí y la siguiente pasada reintenta (cada paso es idempotente).
"""
import logging
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.core.limits import GRACE_DAYS
from app.core.models.agent_access_log import AgentAccessLog
from app.core.models.agent_api_key import AgentApiKey
from app.core.models.agent_profile import AgentProfile
from app.core.models.change_log import ChangeLog
from app.core.models.file import File, FileFolder
from app.core.models.limit_grace import LimitGrace
from app.core.models.notification import Notification, NotificationPref, PushSubscription
from app.core.models.project import VaultProject
from app.core.models.publication import Publication
from app.core.models.purge_log import PurgeLog
from app.core.models.refresh_token import RefreshToken
from app.core.models.task import VaultTask
from app.core.models.user import User
from app.core.ports.couchdb_port import CouchDBPort
from app.core.ports.object_storage_port import ObjectStoragePort

logger = logging.getLogger(__name__)

# Tablas con `owner_id` o `user_id` que se vacían, en un orden que respeta las claves foráneas (las tareas, con sus
# subtareas y bloqueos, se borran por el ORM aparte).
_BY_OWNER = (Notification, NotificationPref, PushSubscription, AgentApiKey, AgentProfile, Publication, VaultProject,
             FileFolder, File, AgentAccessLog, ChangeLog, PurgeLog)


class UserPurgeService:
    def __init__(self, session: Session, couchdb: CouchDBPort, storage: ObjectStoragePort) -> None:
        self._session = session
        self._couchdb = couchdb
        self._storage = storage

    def purge_expired(self, now: datetime) -> int:
        """Purga las cuentas dadas de baja hace más de `GRACE_DAYS` días. Retorna cuántas."""
        cutoff = now - timedelta(days=GRACE_DAYS)
        ids = [row.id for row in self._session.query(User.id).filter(User.deleted_at.isnot(None), User.deleted_at <= cutoff)]
        purged = 0
        for user_id in ids:
            try:
                self.purge(user_id)
                purged += 1
            except Exception:  # noqa: BLE001 - una cuenta que falla no frena a las demás; se reintenta en la siguiente pasada
                self._session.rollback()
                logger.warning("user purge failed for %s", user_id, exc_info=True)
        return purged

    def purge(self, user_id: str) -> None:
        user = self._session.get(User, user_id)
        if user is None:
            return
        for file in self._session.query(File).filter(File.owner_id == user_id):
            self._storage.delete_object(file.object_key)
        if user.avatar_content_type is not None:
            self._storage.delete_object(f"users/{user_id}/avatar")
        self._couchdb.drop_user_db(user.couchdb_name)
        for task in self._session.query(VaultTask).filter(VaultTask.owner_id == user_id, VaultTask.parent_id.is_(None)):
            self._session.delete(task)  # sus subtareas van en cascada
        self._session.flush()
        for model in _BY_OWNER:
            self._session.query(model).filter(model.owner_id == user_id).delete(synchronize_session=False)
        self._session.query(RefreshToken).filter(RefreshToken.user_id == user_id).delete(synchronize_session=False)
        self._session.query(LimitGrace).filter(LimitGrace.user_id == user_id).delete(synchronize_session=False)
        self._session.delete(user)
        self._session.commit()
