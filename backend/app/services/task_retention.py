"""Retención de las tareas cerradas (H-053): una raíz hecha o cancelada se elimina pasados `TASKS_RETENTION_DAYS`.

Sus subtareas salen con ella (nunca solas, para que el estado derivado de la raíz no cambie por una limpieza).
Es una purga irreversible y sin papelera: solo queda el respaldo semanal. Corre en un hilo de fondo del proceso;
borrar lo ya vencido es idempotente, así que no importa si algún día corren varios procesos.
"""
import logging
import threading
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from app.adapters.task_repository import TaskRepository
from app.core.config import settings

logger = logging.getLogger(__name__)

_FIRST_DELAY = 60.0  # segundos tras el arranque: no compite con el despliegue


def purge_closed_tasks(session_factory, now: datetime | None = None, days: int | None = None) -> int:
    """Una pasada: borra las raíces cerradas hace más de `days` días. Retorna cuántas raíces se eliminaron."""
    moment = now or datetime.now(UTC).replace(tzinfo=None)
    cutoff = moment - timedelta(days=settings.TASKS_RETENTION_DAYS if days is None else days)
    session = session_factory()
    try:
        return TaskRepository(session).purge_closed_roots(cutoff)
    finally:
        session.close()


def start_task_retention(session_factory) -> Callable[[], None]:
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
            except Exception:  # noqa: BLE001 - un fallo no mata el ciclo; se reintenta en la siguiente vuelta
                logger.warning("task retention pass failed", exc_info=True)
            if stop.wait(settings.TASKS_PURGE_INTERVAL_SECONDS):
                return

    thread = threading.Thread(target=run, name="task-retention", daemon=True)
    thread.start()
    return stop.set
