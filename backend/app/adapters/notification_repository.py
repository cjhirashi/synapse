import json
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.models.notification import Notification, NotificationPref


class NotificationRepository:
    """Avisos y preferencias sobre la sesión de Postgres (una instancia por petición). Toda lectura va acotada al dueño."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def add(self, notification: Notification) -> Notification:
        self._db.add(notification)
        self._db.flush()
        return notification

    def has_key(self, dedupe_key: str) -> bool:
        return self._db.query(Notification.id).filter(Notification.dedupe_key == dedupe_key).first() is not None

    def get(self, notification_id: str, owner_id: str) -> Notification | None:
        found = self._db.get(Notification, notification_id)
        return found if found is not None and found.owner_id == owner_id else None

    def list(self, owner_id: str, unread: bool, limit: int) -> list[Notification]:
        query = self._db.query(Notification).filter(Notification.owner_id == owner_id)
        if unread:
            query = query.filter(Notification.read_at.is_(None))
        return query.order_by(Notification.created_at.desc()).limit(limit).all()

    def unread_count(self, owner_id: str) -> int:
        return self._db.query(Notification).filter(Notification.owner_id == owner_id, Notification.read_at.is_(None)).count()

    def mark_all_read(self, owner_id: str, now: datetime) -> int:
        count = self._db.query(Notification).filter(
            Notification.owner_id == owner_id, Notification.read_at.is_(None)).update({"read_at": now})
        self._db.commit()
        return count

    def disabled_kinds(self, owner_id: str) -> set[str]:
        pref = self._db.get(NotificationPref, owner_id)
        return set(json.loads(pref.disabled_kinds)) if pref is not None else set()

    def set_disabled_kinds(self, owner_id: str, kinds: set[str]) -> None:
        pref = self._db.get(NotificationPref, owner_id)
        if pref is None:
            pref = NotificationPref(owner_id=owner_id)
            self._db.add(pref)
        pref.disabled_kinds = json.dumps(sorted(kinds))
        self._db.commit()

    def commit(self) -> None:
        self._db.commit()

    def refresh(self, notification: Notification) -> Notification:
        self._db.refresh(notification)
        return notification
