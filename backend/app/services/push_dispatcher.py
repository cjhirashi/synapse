"""Despachador de Web Push (H-053): envía al dispositivo los avisos recién creados.

La cola es la tabla: un aviso con `pushed_at` NULL está pendiente. Cada pasada lo marca revisado *antes* de enviar (a lo sumo
una vez: un fallo no se reintenta en bucle). Dentro de las horas silenciosas de la persona el aviso no se marca: sigue pendiente
y sale en cuanto termina la ventana (antes se daba por enviado y se perdía; en la bandeja está siempre).
Un 404/410 del servicio de push borra la suscripción. El hilo duerme hasta `PUSH_POLL_SECONDS` y `PUSH_WAKE` lo despierta al
crear un aviso; si el aviso aún no se confirmó, la siguiente pasada lo recoge.
"""
import logging
import re
import threading
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Callable
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session, sessionmaker

from app.adapters import web_push
from app.core.config import settings
from app.core.models.agent_profile import AgentProfile
from app.core.models.notification import Notification, NotificationPref, PushSubscription
from app.core.models.task import VaultTask
from app.core.quiet_hours import in_quiet_hours
from app.core.task_rules import STATUS_ES
from app.core.vault_context import user_db_name
from app.services.notification_service import PUSH_WAKE

log = logging.getLogger("synapse.push")
BATCH = 50
MAX_AGE = timedelta(hours=24)  # un aviso más viejo que esto ya no es noticia: se marca revisado sin enviar
BODY_LIMIT = 140
DESCRIPTION_LIMIT = 160

Sender = Callable[[web_push.Target, dict], str]
VaultNamer = Callable[[str, str], str | None]

_CDMX = ZoneInfo("America/Mexico_City")
_MONTHS = ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")
# Mismos rótulos que la pantalla de avisos (`NotificationsPage.tsx`): la notificación del móvil dice lo mismo que la tarjeta.
KIND_LABEL = {"task_assigned": "Tarea asignada", "task_status": "Cambio de estado", "task_due": "Vencimiento", "publication_expired": "Publicación", "limit_grace": "Límites de la cuenta", "vault_share": "Bóvedas compartidas"}


@lru_cache
def _vault_port():
    from app.adapters.vault_repository import VaultRepository
    return VaultRepository()


def couch_vault_name(owner_id: str, vault_id: str) -> str | None:
    """Nombre de la bóveda, o `None` si no se puede leer (el aviso sale igual, sin ese dato)."""
    try:
        from app.services.vault_service import VaultService
        return VaultService(_vault_port(), user_db_name(owner_id)).get(vault_id).vault.name
    except Exception:
        return None


def headline(notice: Notification, with_task: bool) -> str:
    """Encabezado del evento sin repetir el título de la tarea («Vence en 1 h», «aira marcó la tarea como Hecha»)."""
    if not with_task:
        return notice.title
    swap = "" if notice.kind == "task_due" else "la tarea "
    text = re.sub(r"\s+", " ", re.sub(r"«[^»]*»\s*(\(de [^)]*\)\s*)?", swap, notice.title, count=1)).strip()
    return text[:1].upper() + text[1:]


def _clip(text: str, limit: int) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _payload(session: Session, notice: Notification, vault_name: VaultNamer) -> dict:
    """La notificación del móvil con la misma estructura que la tarjeta de `/avisos`: tipo y evento en el título; en el cuerpo,
    título y descripción de la tarea y una línea con estado, responsable, bóveda y vencimiento."""
    url = notice.url if (notice.url or "").startswith("/") else "/avisos"
    task = session.get(VaultTask, notice.resource_id) if notice.resource_type == "task" and notice.resource_id else None
    if task is None or task.owner_id != notice.owner_id:
        return {"title": notice.title, "body": (notice.body or "")[:BODY_LIMIT], "url": url, "tag": notice.id}
    if task.assignee_type == "agent" and task.assignee_agent_id:
        profile = session.get(AgentProfile, (task.owner_id, task.assignee_agent_id))
        owner = (profile.display_name if profile is not None and profile.display_name else None) or task.assignee_agent_id
    else:
        owner = "Tú"
    vault = vault_name(task.owner_id, task.vault_id)
    facts = [STATUS_ES.get(task.status, task.status), owner]
    if vault:
        facts.append(vault)
    lines = [_clip(task.title, 120)]
    if task.description:
        lines.append(_clip(task.description, DESCRIPTION_LIMIT))
    lines.append(" · ".join(facts))
    if task.due_at is not None:
        local = task.due_at.replace(tzinfo=UTC).astimezone(_CDMX)
        lines.append(f"Vence {local.day} {_MONTHS[local.month - 1]} {local.year}, {local:%H:%M} CDMX")
    title = f"{KIND_LABEL.get(notice.kind, 'Aviso')} · {headline(notice, True)}"
    return {"title": title, "body": "\n".join(lines), "url": url, "tag": notice.id}


def _quiet_now(session: Session, owner_id: str, now: datetime, cache: dict[str, bool]) -> bool:
    if owner_id not in cache:
        pref = session.get(NotificationPref, owner_id)
        window = (pref.quiet_enabled, pref.quiet_start, pref.quiet_end) if pref is not None else (True, "22:00", "07:00")
        cache[owner_id] = in_quiet_hours(now, *window)
    return cache[owner_id]


def dispatch_pending(
    session_factory: sessionmaker, now: datetime | None = None, sender: Sender = web_push.send, vault_name: VaultNamer = couch_vault_name,
) -> dict:
    """Una pasada. Devuelve contadores (para pruebas y registro)."""
    now = now or datetime.now(UTC).replace(tzinfo=None)
    stats = {"checked": 0, "sent": 0, "quiet": 0, "removed": 0, "failed": 0}
    quiet: dict[str, bool] = {}
    with session_factory() as session:
        pending = (
            session.query(Notification).filter(Notification.pushed_at.is_(None))
            .order_by(Notification.created_at).limit(BATCH * 4).all()
        )
        ready = []
        for notice in pending:
            if now - notice.created_at <= MAX_AGE and _quiet_now(session, notice.owner_id, now, quiet):
                stats["quiet"] += 1  # se queda pendiente: sale al terminar las horas silenciosas
                continue
            ready.append(notice)
        ready = ready[:BATCH]
        for notice in ready:
            notice.pushed_at = now
        session.commit()
        for notice in ready:
            stats["checked"] += 1
            if now - notice.created_at > MAX_AGE:
                continue
            _deliver(session, notice, sender, now, stats, vault_name)
    return stats


def _deliver(session: Session, notice: Notification, sender: Sender, now: datetime, stats: dict, vault_name: VaultNamer) -> None:
    subs = session.query(PushSubscription).filter(PushSubscription.owner_id == notice.owner_id).all()
    if not subs:
        return
    payload = _payload(session, notice, vault_name)
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
