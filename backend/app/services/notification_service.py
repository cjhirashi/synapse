"""Avisos para la persona (H-053): crear (idempotente por `dedupe_key`), listar, marcar leídos y preferencias.

Un tipo apagado en las preferencias deja de generar avisos (no se crea la fila). `notify` no confirma la transacción:
lo hace quien lo llama, para que el aviso y el cambio que lo causó se guarden juntos o ninguno.
"""
from __future__ import annotations

import threading
import uuid
from datetime import UTC, datetime

from app.adapters import web_push
from app.adapters.notification_repository import NotificationRepository
from app.core.config import settings
from app.core.errors import NotificationNotFound, PushInvalid
from app.core.quiet_hours import parse_hhmm
from app.core.models.notification import Notification
from app.core.models.task import VaultTask

KINDS = ("task_assigned", "task_status", "task_due", "publication_expired")

# El despachador de push duerme hasta su próximo turno; crear un aviso lo despierta para que salga sin esperar.
PUSH_WAKE = threading.Event()


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
        added = self._repo.add(Notification(
            id=str(uuid.uuid4()), owner_id=self._owner_id, kind=kind, title=title[:255], body=body, vault_id=vault_id,
            resource_type=resource_type, resource_id=resource_id, url=url, dedupe_key=dedupe_key,
            created_at=datetime.now(UTC).replace(tzinfo=None)))
        PUSH_WAKE.set()
        return added

    def list(self, unread: bool = False, limit: int = 50) -> list[Notification]:
        return self._repo.list(self._owner_id, unread, limit)

    def tasks_of(self, notices: list[Notification]) -> dict[str, VaultTask]:
        """Las tareas vigentes a las que apuntan los avisos, por id (una sola consulta)."""
        return self._repo.tasks_by_ids(self._owner_id, {n.resource_id for n in notices if n.resource_type == "task" and n.resource_id})

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

    def quiet_hours(self) -> dict:
        enabled, start, end = self._repo.quiet(self._owner_id)
        return {"enabled": enabled, "start": start, "end": end}

    def set_quiet_hours(self, enabled: bool, start: str, end: str) -> dict:
        if parse_hhmm(start) is None or parse_hhmm(end) is None or start == end:
            raise PushInvalid(errors=[{"pointer": "/quiet", "detail": "Las horas silenciosas van en formato HH:MM y el inicio no puede ser igual al fin."}])
        self._repo.set_quiet(self._owner_id, enabled, start, end)
        return self.quiet_hours()

    def push_status(self) -> dict:
        return {
            "enabled": web_push.push_configured(),
            "public_key": settings.VAPID_PUBLIC_KEY if web_push.push_configured() else None,
            "devices": len(self._repo.subscriptions(self._owner_id)),
        }

    def subscribe(self, endpoint: str, p256dh: str, auth: str, user_agent: str | None) -> None:
        if not web_push.push_configured():
            raise PushInvalid(errors=[{"pointer": "/endpoint", "detail": "El envío de notificaciones al dispositivo no está configurado en el servidor."}])
        if not web_push.endpoint_allowed(endpoint):
            raise PushInvalid(errors=[{"pointer": "/endpoint", "detail": "La suscripción no apunta a un servicio de notificaciones conocido."}])
        self._repo.upsert_subscription(
            self._owner_id, endpoint, p256dh, auth, (user_agent or "")[:300] or None, datetime.now(UTC).replace(tzinfo=None), str(uuid.uuid4()))

    def unsubscribe(self, endpoint: str) -> bool:
        return self._repo.delete_subscription(self._owner_id, endpoint)

    def test_push(self) -> dict:
        """Envía ya un aviso de prueba a los dispositivos de la persona (ignora las horas silenciosas).

        Cada prueba lleva una etiqueta distinta: con una fija, Windows y Chrome reemplazan la notificación anterior sin volver
        a mostrarla y solo se veía la primera.
        """
        sent = removed = failed = 0
        now = datetime.now(UTC).replace(tzinfo=None)
        for sub in self._repo.subscriptions(self._owner_id):
            result = web_push.send(
                web_push.Target(sub.endpoint, sub.p256dh, sub.auth),
                {"title": "Synapse", "body": "Aviso de prueba: las notificaciones funcionan en este dispositivo.", "url": "/avisos", "tag": f"test-{uuid.uuid4()}"})
            if result == "ok":
                sub.last_success_at = now
                sent += 1
            elif result == "gone":
                self._repo.delete_subscription(self._owner_id, sub.endpoint)
                removed += 1
            else:
                failed += 1
        self._repo.commit()
        return {"sent": sent, "removed": removed, "failed": failed}
