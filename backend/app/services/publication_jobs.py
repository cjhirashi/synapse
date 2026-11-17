"""Trabajos de fondo de las publicaciones: despublicación automática de vencidas."""
from datetime import UTC, datetime

from app.adapters.notification_repository import NotificationRepository
from app.adapters.publication_repository import PublicationRepository
from app.services.notification_service import NotificationService
from app.services.task_jobs import _when


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def expire_publications(session_factory, now: datetime | None = None) -> int:
    """Una pasada: despublica las publicaciones vencidas. Retorna cuántas se despublicaron."""
    moment = now or _now()
    session = session_factory()
    expired = 0
    try:
        repo = PublicationRepository(session)
        for pub in repo.due_for_unpublish(moment):
            NotificationService(NotificationRepository(session), pub.owner_id).notify(
                "publication_expired",
                f"«{pub.title}» dejó de ser pública",
                body=f"Se despublicó solo el {_when(pub.unpublish_at)} porque llegó su fecha de despublicación.",
                vault_id=pub.vault_id,
                resource_type="note",
                resource_id=pub.note_id,
                url=f"/vaults/{pub.vault_id}?tab=publicados",
                dedupe_key=f"publication-expired:{pub.id}"
            )
            repo.delete(pub)
            repo.commit()
            expired += 1
        return expired
    finally:
        session.close()
