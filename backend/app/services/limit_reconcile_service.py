"""Reajuste de límites de una cuenta (H-060).

Al bajar un límite por debajo de lo usado no se borra nada: se abre un plazo de `GRACE_DAYS` días (`limit_grace`) y se
avisa a la persona para que reduzca por su cuenta. Vencido el plazo, si sigue por encima, el reajuste elimina lo **más
viejo** hasta cumplir: bóvedas y notas van a su papelera (recuperables); los archivos se borran de verdad (no tienen
papelera). Cada paso es idempotente: repetirlo o reiniciarlo no duplica avisos ni borra de más.
"""
import logging
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.adapters.file_repository import FileRepository
from app.adapters.notification_repository import NotificationRepository
from app.core.limits import GRACE_DAYS
from app.core.models.file import File
from app.core.models.limit_grace import KIND_DOCUMENTS, KIND_STORAGE, KIND_VAULTS, LimitGrace
from app.core.models.user import User
from app.core.ports.object_storage_port import ObjectStoragePort
from app.core.ports.vault_port import VaultPort
from app.services import limit_usage
from app.services.limit_guard import limits_of
from app.services.file_service import FileService
from app.services.note_content_service import NoteContentService
from app.services.notification_service import NotificationService
from app.services.vault_service import VaultService

logger = logging.getLogger(__name__)

Over = tuple[str, str | None]  # (kind, vault_id): un exceso vigente


def _utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class LimitReconcileService:
    def __init__(
        self, session: Session, port: VaultPort, storage: ObjectStoragePort | None = None,
        now: Callable[[], datetime] = _utcnow,
    ) -> None:
        self._session = session
        self._port = port
        self._storage = storage
        self._now = now

    # --- Excesos ---

    def overages(self, user: User) -> list[Over]:
        """Lo que hoy pasa de los límites de la cuenta."""
        limits, db = limits_of(user), user.couchdb_name
        found: list[Over] = []
        vaults = limit_usage.active_vaults(self._port, db)
        if limits.max_vaults is not None and len(vaults) > limits.max_vaults:
            found.append((KIND_VAULTS, None))
        for vault in vaults:
            vault_id = vault["_id"].removeprefix("vault:")
            if limits.max_notes_per_vault is not None and len(
                    limit_usage.user_notes(self._port, db, vault_id)) > limits.max_notes_per_vault:
                found.append((KIND_DOCUMENTS, vault_id))
            if limits.max_storage_bytes_per_vault is not None and limit_usage.storage_bytes(
                    self._session, vault_id) > limits.max_storage_bytes_per_vault:
                found.append((KIND_STORAGE, vault_id))
        return found

    def refresh(self, user: User) -> None:
        """Tras cambiar los límites: abre el plazo de lo que quedó por encima y cierra el de lo que ya cumple."""
        over = set(self.overages(user))
        rows = self._session.query(LimitGrace).filter(LimitGrace.user_id == user.id).all()
        have = {(row.kind, row.vault_id): row for row in rows}
        for key, row in have.items():
            if key not in over:
                self._session.delete(row)
        notices = NotificationService(NotificationRepository(self._session), user.id)
        started = self._now()
        for kind, vault_id in sorted(over - set(have), key=lambda k: (k[0], k[1] or "")):
            row = LimitGrace(user_id=user.id, kind=kind, vault_id=vault_id, started_at=started,
                             deadline_at=started + timedelta(days=GRACE_DAYS))
            self._session.add(row)
            notices.notify(
                "limit_grace", _grace_title(kind), body=_grace_body(kind, row.deadline_at),
                vault_id=vault_id, url=f"/vaults/{vault_id}" if vault_id else "/vaults",
                dedupe_key=f"limit_grace:{user.id}:{kind}:{vault_id}:{row.deadline_at:%Y%m%d}")
        self._session.commit()

    # --- Plazos vencidos ---

    def enforce_due(self) -> int:
        """Una pasada: para cada plazo vencido, recorta lo más viejo si la cuenta sigue por encima. Retorna cuántos
        plazos cerró."""
        due = self._session.query(LimitGrace).filter(LimitGrace.deadline_at <= self._now()).all()
        closed = 0
        for row in due:
            try:
                self._close(row)
                closed += 1
            except Exception:  # noqa: BLE001
                self._session.rollback()
                logger.warning("limit grace enforcement failed for %s", row.id, exc_info=True)
        return closed

    def _close(self, row: LimitGrace) -> None:
        user = self._session.get(User, row.user_id)
        if user is None or user.deleted_at is not None or (row.kind, row.vault_id) not in set(self.overages(user)):
            self._session.delete(row)
            self._session.commit()
            return
        removed = {KIND_VAULTS: self._trim_vaults, KIND_DOCUMENTS: self._trim_documents,
                   KIND_STORAGE: self._trim_storage}[row.kind](user, row.vault_id)
        self._session.delete(row)
        NotificationService(NotificationRepository(self._session), user.id).notify(
            "limit_grace", "Se ajustó tu cuenta a su límite",
            body=f"Venció el plazo y se retiraron los {removed} elementos más viejos para cumplirlo.",
            vault_id=row.vault_id, url=f"/vaults/{row.vault_id}" if row.vault_id else "/vaults",
            dedupe_key=f"limit_done:{row.id}")
        self._session.commit()

    def _trim_vaults(self, user: User, _vault_id: str | None) -> int:
        cap, db = limits_of(user).max_vaults or 0, user.couchdb_name
        oldest_first = list(reversed(limit_usage.active_vaults(self._port, db)))
        service, removed = VaultService(self._port, db), 0
        for doc in oldest_first[: max(len(oldest_first) - cap, 0)]:
            vault_id = doc["_id"].removeprefix("vault:")
            service.delete(vault_id, service.get(vault_id).etag)  # a la papelera
            removed += 1
        return removed

    def _trim_documents(self, user: User, vault_id: str | None) -> int:
        cap, db = limits_of(user).max_notes_per_vault or 0, user.couchdb_name
        oldest_first = list(reversed(limit_usage.user_notes(self._port, db, vault_id)))
        notes, removed = NoteContentService(self._port, db), 0
        for doc in oldest_first[: max(len(oldest_first) - cap, 0)]:
            note_id = doc["_id"].split(":")[2]
            try:
                notes.delete(vault_id, note_id, notes.get(vault_id, note_id).etag)  # a la papelera
                removed += 1
            except Exception:  # noqa: BLE001
                logger.warning("could not trim note %s", doc["_id"], exc_info=True)
        return removed

    def _trim_storage(self, user: User, vault_id: str | None) -> int:
        cap = limits_of(user).max_storage_bytes_per_vault or 0
        files = self._session.query(File).filter(File.vault_id == vault_id).order_by(File.created_at.asc()).all()
        total = sum(f.size for f in files)
        service = FileService(FileRepository(self._session), self._storage, user.id, ensure_vault=lambda _v: None)
        removed = 0
        for file in files:
            if total <= cap:
                break
            service.delete(file.id)
            total -= file.size
            removed += 1
        return removed


def _grace_title(kind: str) -> str:
    return {KIND_VAULTS: "Tienes más bóvedas de las que permite tu cuenta",
            KIND_DOCUMENTS: "Esta bóveda tiene más documentos de los que permite tu cuenta",
            KIND_STORAGE: "Esta bóveda ocupa más espacio del que permite tu cuenta"}[kind]


def _grace_body(kind: str, deadline: datetime) -> str:
    what = {KIND_VAULTS: "bóvedas", KIND_DOCUMENTS: "documentos", KIND_STORAGE: "archivos"}[kind]
    return (f"El administrador ajustó tu límite. Reduce tus {what} antes del {deadline:%Y-%m-%d} (UTC); "
            f"si sigues por encima, se retirará lo más viejo.")
