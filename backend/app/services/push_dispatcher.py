"""Despachador de Web Push (H-053): envía al dispositivo los avisos recién creados.

La cola es la tabla: un aviso con `pushed_at` NULL está pendiente. Cada pasada lo marca revisado *antes* de enviar (a lo sumo
una vez: un fallo no se reintenta en bucle) y respeta las horas silenciosas de la persona (el aviso sigue en la bandeja).
Un 404/410 del servicio de push borra la suscripción. El hilo duerme hasta `PUSH_POLL_SECONDS` y `PUSH_WAKE` lo despierta al
crear un aviso; si el aviso aún no se confirmó, la siguiente pasada lo recoge.
"""
import logging
import threading
from datetime import UTC, datetime, timedelta
from typing import Callable

from sqlalchemy.orm import Session, sessionmaker

from app.adapters import web_push
from app.core.config import settings
from app.core.models.notification import Notification, NotificationPref, PushSubscription
from app.core.quiet_hours import in_quiet_hours
from app.services.notification_service import PUSH_WAKE

log = logging.getLogger("synapse.push")
BATCH = 50
MAX_AGE = timedelta(hours=24)  # un aviso más viejo que esto ya no es noticia: se marca revisado sin enviar
BODY_LIMIT = 140

Sender = Callable[[web_push.Target, dict], str]


def _payload(notice: Notification) -> dict:
    body = (notice.body or "")[:BODY_LIMIT]
    return {"title": notice.title, "body": body, "url": notice.url if (notice.url or "").startswith("/") else "/avisos", "tag": notice.id}


def dispatch_pending(session_factory: sessionmaker, now: datetime | None = None, sender: Sender = web_push.send) -> dict:
    """Una pasada. Devuelve contadores (para pruebas y registro)."""
    now = now or datetime.now(UTC).replace(tzinfo=None)
    stats = {"checked": 0, "sent": 0, "quiet": 0, "removed": 0, "failed": 0}
    with session_factory() as session:
        pending = (
            session.query(Notification).filter(Notification.pushed_at.is_(None))
            .order_by(Notification.created_at).limit(BATCH).all()
        )
        for notice in pending:
            notice.pushed_at = now
        session.commit()
        for notice in pending:
            stats["checked"] += 1
            if now - notice.created_at > MAX_AGE:
                continue
            _deliver(session, notice, now, sender, stats)
    return stats


def _deliver(session: Session, notice: Notification, now: datetime, sender: Sender, stats: dict) -> None:
    subs = session.query(PushSubscription).filter(PushSubscription.owner_id == notice.owner_id).all()
    if not subs:
        return
    pref = session.get(NotificationPref, notice.owner_id)
    window = (pref.quiet_enabled, pref.quiet_start, pref.quiet_end) if pref is not None else (True, "22:00", "07:00")
    if in_quiet_hours(now, *window):
        stats["quiet"] += 1
        return
    payload = _payload(notice)
    for sub in subs:
        result = sender(web_push.Target(sub.endpoint, sub.p256dh, sub.auth), payload)
        if result == "ok":
            sub.last_success_at = now
            stats["sent"] += 1
        elif result == "gone":
            session.delete(sub)
            stats["removed"] += 1
        else:
            stats["failed"] += 1
    session.commit()


def start_push_dispatcher(session_factory: sessionmaker) -> Callable[[], None]:
    """Arranca el hilo (daemon). Devuelve la función que lo detiene."""
    stop = threading.Event()

    def loop() -> None:
        while not stop.is_set():
            PUSH_WAKE.wait(settings.PUSH_POLL_SECONDS)
            PUSH_WAKE.clear()
            if stop.is_set():
                break
            try:
                stats = dispatch_pending(session_factory)
                if stats["sent"] or stats["failed"] or stats["removed"]:
                    log.info("push: %s", stats)
            except Exception:  # un fallo del despachador nunca debe tumbar el servidor
                log.exception("push: pasada fallida")

    threading.Thread(target=loop, name="push-dispatcher", daemon=True).start()

    def shutdown() -> None:
        stop.set()
        PUSH_WAKE.set()

    return shutdown
