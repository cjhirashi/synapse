"""Avisos para la persona (H-053): crear (idempotente por `dedupe_key`), listar, marcar leídos y preferencias.

Un tipo apagado en las preferencias deja de generar avisos (no se crea la fila). `notify` no confirma la transacción:
lo hace quien lo llama, para que el aviso y el cambio que lo causó se guarden juntos o ninguno.
"""
import uuid
from datetime import UTC, datetime

from app.adapters.notification_repository import NotificationRepository
from app.core.errors import NotificationNotFound
from app.core.models.notification import Notification

KINDS = ("task_assigned", "task_status", "task_due")


class NotificationService:
    def __init__(self, repo: NotificationRepository, owner_id: str) -> None:
        self._repo = repo
        self._owner_id = owner_id

    def notify(
        self, kind: str, title: str, *, body: str | None = None, vault_id: str | None = None, resource_type: str | None = None,
        resource_id: str | None = None, url: str | None = None, dedupe_key: str | None = None,
    ) -> Notification | None:
        """Añade un aviso a la sesión. `None` si el tipo está apagado o la clave ya existe."""
        if kind in self._repo.disabled_kinds(self._owner_id):
            return None
        if dedupe_key is not None and self._repo.has_key(dedupe_key):
            return None
        return self._repo.add(Notification(
            id=str(uuid.uuid4()), owner_id=self._owner_id, kind=kind, title=title[:255], body=body, vault_id=vault_id,
            resource_type=resource_type, resource_id=resource_id, url=url, dedupe_key=dedupe_key,
            created_at=datetime.now(UTC).replace(tzinfo=None)))

    def list(self, unread: bool = False, limit: int = 50) -> list[Notification]:
        return self._repo.list(self._owner_id, unread, limit)

    def unread_count(self) -> int:
        return self._repo.unread_count(self._owner_id)

    def mark_read(self, notification_id: str) -> Notification:
        found = self._repo.get(notification_id, self._owner_id)
        if found is None:
            raise NotificationNotFound()
        if found.read_at is None:
            found.read_at = datetime.now(UTC).replace(tzinfo=None)
            self._repo.commit()
            self._repo.refresh(found)
        return found

    def mark_all_read(self) -> int:
        return self._repo.mark_all_read(self._owner_id, datetime.now(UTC).replace(tzinfo=None))

    def preferences(self) -> dict[str, bool]:
        off = self._repo.disabled_kinds(self._owner_id)
        return {kind: kind not in off for kind in KINDS}

    def set_preferences(self, kinds: dict[str, bool]) -> dict[str, bool]:
        off = self._repo.disabled_kinds(self._owner_id)
        for kind, enabled in kinds.items():
            (off.discard if enabled else off.add)(kind)
        self._repo.set_disabled_kinds(self._owner_id, off)
        return self.preferences()
