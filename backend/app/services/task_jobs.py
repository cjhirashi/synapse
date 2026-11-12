"""Trabajos de fondo de las tareas (H-053): retención de las cerradas y avisos de vencimiento.

**Retención:** una raíz hecha o cancelada se elimina pasados `TASKS_RETENTION_DAYS` días, con sus subtareas (nunca solas, para
que el estado derivado de la raíz no cambie por una limpieza). Es una purga irreversible y sin papelera: solo queda el
respaldo semanal.

**Vencimientos:** las tareas abiertas asignadas a la persona generan un aviso a 24 h, a 1 h y al vencer (esta última, hasta 7 días
después). Solo se envía la ventana vigente: una ventana ya pasada al crear la tarea no se manda de forma retroactiva. La
`dedupe_key` lleva el id de la tarea, su `due_at` y la ventana: repetir o reiniciar el trabajo no duplica avisos, y cambiar la
fecha de vencimiento reinicia los avisos.

Corren en un hilo de fondo del proceso; ambos son idempotentes, así que no importa si algún día corren varios procesos.
"""
import logging
import threading
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from app.adapters.notification_repository import NotificationRepository
from app.adapters.task_repository import TaskRepository
from app.core.config import settings
from app.core.models.task import VaultTask
from app.services.notification_service import NotificationService

logger = logging.getLogger(__name__)

_FIRST_DELAY = 60.0  # segundos tras el arranque: no compite con el despliegue
_OVERDUE_WINDOW = timedelta(days=7)
_CDMX = ZoneInfo("America/Mexico_City")
_MONTHS = ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def purge_closed_tasks(session_factory, now: datetime | None = None, days: int | None = None) -> int:
    """Una pasada de retención: borra las raíces cerradas hace más de `days` días. Retorna cuántas raíces se eliminaron."""
    cutoff = (now or _now()) - timedelta(days=settings.TASKS_RETENTION_DAYS if days is None else days)
    session = session_factory()
    try:
        return TaskRepository(session).purge_closed_roots(cutoff)
    finally:
        session.close()


def _window(due: datetime, now: datetime) -> str:
    if due <= now:
        return "overdue"
    return "1h" if due - now <= timedelta(hours=1) else "24h"


def _when(due: datetime) -> str:
    local = due.replace(tzinfo=UTC).astimezone(_CDMX)
    return f"{local.day} {_MONTHS[local.month - 1]} {local.year}, {local:%H:%M} (hora de la Ciudad de México)"


def notify_due_tasks(session_factory, now: datetime | None = None) -> int:
    """Una pasada de vencimientos: crea el aviso de la ventana vigente de cada tarea abierta de la persona. Retorna cuántos."""
    moment = now or _now()
    session = session_factory()
    created = 0
    try:
        tasks = session.query(VaultTask).filter(
            VaultTask.assignee_type == "user", VaultTask.status.notin_(("done", "cancelled")), VaultTask.due_at.isnot(None),
            VaultTask.due_at >= moment - _OVERDUE_WINDOW, VaultTask.due_at <= moment + timedelta(hours=24),
        ).all()
        for task in tasks:
            window = _window(task.due_at, moment)
            headline = {"24h": "vence en 24 h", "1h": "vence en 1 h", "overdue": "venció"}[window]
            notice = NotificationService(NotificationRepository(session), task.owner_id).notify(
                "task_due", f"«{task.title}» {headline}", body=f"Vence el {_when(task.due_at)}.", vault_id=task.vault_id,
                resource_type="task", resource_id=task.id, url=f"/vaults/{task.vault_id}?tab=tareas&task={task.id}",
                dedupe_key=f"task:{task.id}:{task.due_at.isoformat()}:{window}")
            created += notice is not None
        session.commit()
        return created
    finally:
        session.close()


def start_task_jobs(session_factory) -> Callable[[], None]:
    """Arranca el ciclo de fondo; retorna la función que lo detiene (al apagar la app)."""
    stop = threading.Event()

    def run() -> None:
        if stop.wait(_FIRST_DELAY):
            return
        while True:
            try:
                purged = purge_closed_tasks(session_factory)
                if purged:
                    logger.info("task retention: %d closed root task(s) deleted", purged)
                noticed = notify_due_tasks(session_factory)
                if noticed:
                    logger.info("task due notices: %d created", noticed)
            except Exception:  # noqa: BLE001 - un fallo no mata el ciclo; se reintenta en la siguiente vuelta
                logger.warning("task jobs pass failed", exc_info=True)
            if stop.wait(settings.TASKS_JOBS_INTERVAL_SECONDS):
                return

    thread = threading.Thread(target=run, name="task-jobs", daemon=True)
    thread.start()
    return stop.set
