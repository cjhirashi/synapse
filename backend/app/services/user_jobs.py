"""Trabajos de fondo de las cuentas (H-060): purga de las dadas de baja y reajuste de límites vencidos.

Los llama el ciclo de `task_jobs.start_task_jobs`. Ambos son idempotentes, así que no importa si algún día corren varios procesos.
"""
import logging
from datetime import UTC, datetime

from app.adapters.couchdb import CouchDBAdapter
from app.adapters.minio_adapter import get_object_storage
from app.services.limit_reconcile_service import LimitReconcileService
from app.services.user_purge_service import UserPurgeService

logger = logging.getLogger(__name__)


def _vault_port():
    from app.routers.vaults import get_vault_port  # aquí: el router importa servicios que importan este módulo

    return get_vault_port()


def run_user_jobs(session_factory, now: datetime | None = None) -> tuple[int, int]:
    """Una pasada: (plazos de límites cerrados, cuentas purgadas)."""
    at = now or datetime.now(UTC).replace(tzinfo=None)
    session = session_factory()
    try:
        storage = get_object_storage()
        closed = LimitReconcileService(session, _vault_port(), storage, now=lambda: at).enforce_due()
        purged = UserPurgeService(session, CouchDBAdapter(), storage).purge_expired(at)
        return closed, purged
    finally:
        session.close()
