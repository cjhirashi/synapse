"""Registro de cambios y BITACORA automática (H-030b).

Orden de cada escritura que se registra (así un cambio nunca queda sin registro):
1. `begin`: inserta la fila de `change_log` (`pending`); si falla, la escritura no se hace (503).
2. El servicio escribe la nota en CouchDB.
3. `confirm` (`applied`, con la `_rev` resultante) o `fail` (`failed`, solo si se sabe que no se escribió).
4. `flush`: regenera los documentos `BITACORA/AAAA-MM/AAAA-MM-DD.md` de los días tocados, en la zona horaria del
   propietario. Es de mejor esfuerzo: la fuente de verdad es la tabla, y `rebuild` regenera todo desde ella.

La sincronización conoce la `_rev` de antemano: `begin` es idempotente por (bóveda, nota, `_rev`) y un reintento
del lote no duplica. Las escrituras de REST nacen sin `_rev`: la ruta exige `If-Match`, así que no hay reintento
silencioso que las duplique.

Quién escribió sale de `Actor`: sesión humana (correo del propietario), agente (id de la clave) o clave general
(con el agente que declara, si lo hace).
"""
import logging
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from typing import NamedTuple

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, OperationalError

from app.core import bitacora_rules as rules
from app.core.ag_rules import BITACORA
from app.core.agent_access import Actor
from app.core.config import settings
from app.core.errors import RevisionConflict, StorageUnavailable
from app.core.note_dates import stamp_dates, today_cdmx
from app.core.note_prefix import in_folder, view_key
from app.core.note_rules import path_key
from app.core.ports.vault_port import VaultPort
from app.core.timestamps import utc_now

logger = logging.getLogger(__name__)


class Author(NamedTuple):
    kind: str  # human | agent | general | system
    name: str


SYSTEM = Author("system", "sistema")


def author_of(actor: Actor | None, owner_email: str) -> Author:
    """Quién consta como autor de un cambio. `None` = sesión humana del propietario."""
    if actor is None or actor.kind == "human":
        return Author("human", owner_email)
    if actor.kind == "agent":
        return Author("agent", actor.agent_id or "agente")
    if actor.declared:
        return Author("general", f"{actor.declared} (clave general)")
    return Author("general", f"clave general {actor.key_label}" if actor.key_label else "clave general")


class Pending(NamedTuple):
    """Entrada ya insertada y por confirmar."""

    id: str
    vault_id: str
    date: str  # día local AAAA-MM-DD


class ChangeLogStore:
    """Acceso a la tabla `change_log` y a los datos del propietario, en su propia sesión por llamada."""

    def insert(self, row: dict) -> tuple[str, bool]:
        """`(id, creada)`; si (bóveda, nota, `rev`) ya existe devuelve la existente con `creada=False`."""
        from app.adapters.database import SessionLocal
        from app.core.models.change_log import ChangeLog

        with SessionLocal() as session:
            record = ChangeLog(**row)
            session.add(record)
            try:
                session.commit()
                return record.id, True
            except IntegrityError:
                session.rollback()
                existing = session.execute(select(ChangeLog.id).where(
                    ChangeLog.vault_id == row["vault_id"], ChangeLog.note_id == row["note_id"],
                    ChangeLog.rev == row["rev"])).scalar_one()
                return existing, False

    def set_status(self, entry_id: str, status: str, rev: str | None = None) -> None:
        from app.adapters.database import SessionLocal
        from app.core.models.change_log import ChangeLog

        with SessionLocal() as session:
            record = session.get(ChangeLog, entry_id)
            if record is None:
                return
            record.status = status
            if rev is not None and record.rev is None:
                record.rev = rev
            try:
                session.commit()
            except IntegrityError:  # esa `rev` ya consta (reintento): la fila duplicada queda como estaba
                session.rollback()

    def entries(self, vault_id: str, start: datetime, end: datetime) -> list[rules.Entry]:
        from app.adapters.database import SessionLocal
        from app.core.models.change_log import ChangeLog

        with SessionLocal() as session:
            rows = session.execute(select(ChangeLog).where(
                ChangeLog.vault_id == vault_id, ChangeLog.at >= start.replace(tzinfo=None),
                ChangeLog.at < end.replace(tzinfo=None)).order_by(ChangeLog.at)).scalars().all()
            return [rules.Entry(
                r.at.replace(tzinfo=UTC), r.op, r.path, r.prev_path, r.title, r.author_kind, r.author, r.status)
                for r in rows]

    def days(self, vault_id: str) -> list[datetime]:
        from app.adapters.database import SessionLocal
        from app.core.models.change_log import ChangeLog

        with SessionLocal() as session:
            return [d.replace(tzinfo=UTC) for d in session.execute(
                select(ChangeLog.at).where(ChangeLog.vault_id == vault_id)).scalars().all()]

    def owner(self, owner_id: str) -> tuple[str, str]:
        """`(correo, zona horaria)` del propietario."""
        from app.adapters.database import SessionLocal
        from app.core.models.user import User

        with SessionLocal() as session:
            user = session.get(User, owner_id)
            if user is None:
                return owner_id, settings.DEFAULT_TIMEZONE
            return user.email, user.timezone or settings.DEFAULT_TIMEZONE


class ChangeLogService:
    """Una instancia por petición (o por lote de sincronización)."""

    def __init__(
        self, port: VaultPort, db: str, owner_id: str, actor: Actor | None = None, via: str = "rest",
        store: ChangeLogStore | None = None, author: Author | None = None,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ):
        self._port = port
        self._db = db
        self._owner_id = owner_id
        self._actor = actor
        self._via = via
        self._store = store or ChangeLogStore()
        self._author = author
        self._now = now
        self._tz_name: str | None = None
        self._dirty: dict[str, set[str]] = {}

    # --- Identidad y zona horaria (se leen una vez) ---

    def _owner(self) -> tuple[str, str]:
        if self._tz_name is None:
            try:
                email, tz = self._store.owner(self._owner_id)
                rules.zone(tz)
            except Exception:  # noqa: BLE001 - zona desconocida o usuario ausente: la predeterminada
                email, tz = self._owner_id, settings.DEFAULT_TIMEZONE
            self._email, self._tz_name = email, tz
        return self._email, self._tz_name

    def author(self) -> Author:
        if self._author is None:
            self._author = author_of(self._actor, self._owner()[0])
        return self._author

    # --- Registro ---

    def begin(self, vault_id: str, old: dict | None, new: dict, rev: str | None = None) -> Pending | None:
        """Registra, antes de escribir, el paso de la nota `old` a `new`. `None` si ese cambio no se registra.

        Lanza `StorageUnavailable` si no se puede registrar: entonces la nota no debe escribirse.
        """
        op = rules.classify(old, new)
        if op is None:
            return None
        at = self._now()
        tz = self._owner()[1]
        author = self.author()
        row = {
            "id": str(uuid.uuid4()), "at": at.replace(tzinfo=None), "owner_id": self._owner_id,
            "vault_id": vault_id, "note_id": new["_id"].split(":")[2], "rev": rev, "op": op,
            "path": new["path"], "prev_path": old["path"] if old and old["path"] != new["path"] else None,
            "title": rules.title_of(new), "author_kind": author.kind, "author": author.name,
            "via": self._via, "status": rules.STATUS_PENDING,
        }
        try:
            entry_id, created = self._store.insert(row)
        except OperationalError as exc:
            raise StorageUnavailable("change log unavailable") from exc
        date = rules.local_date(at, tz)
        self._dirty.setdefault(vault_id, set()).add(date)
        return Pending(entry_id, vault_id, date)

    def confirm(self, pending: Pending | None, rev: str | None = None) -> None:
        if pending is not None:
            self._safe(self._store.set_status, pending.id, rules.STATUS_APPLIED, rev)

    def fail(self, pending: Pending | None) -> None:
        if pending is not None:
            self._safe(self._store.set_status, pending.id, rules.STATUS_FAILED)

    @staticmethod
    def _safe(fn: Callable, *args) -> None:
        try:
            fn(*args)
        except Exception:  # noqa: BLE001 - la fila queda `pending`, que la bitácora muestra como «sin confirmar»
            logger.warning("change log status update failed", exc_info=True)

    # --- Documentos de BITACORA ---

    def flush(self) -> None:
        """Regenera los documentos diarios de los días tocados por esta instancia. Mejor esfuerzo."""
        dirty, self._dirty = self._dirty, {}
        if not settings.BITACORA_DOCS:
            return
        for vault_id, dates in dirty.items():
            for date in sorted(dates):
                try:
                    self.write_day(vault_id, date)
                except Exception:  # noqa: BLE001 - `rebuild` lo repara desde la tabla
                    logger.warning("bitacora day %s of %s not written", date, vault_id, exc_info=True)

    def rebuild(self, vault_id: str) -> list[str]:
        """Regenera todos los días con cambios de la bóveda; devuelve los días escritos."""
        tz = self._owner()[1]
        dates = sorted({rules.local_date(at, tz) for at in self._store.days(vault_id)})
        for date in dates:
            self.write_day(vault_id, date)
        return dates

    def write_day(self, vault_id: str, date: str) -> None:
        """Escribe (crea o actualiza) el documento del día `date` con las entradas de la tabla."""
        tz = self._owner()[1]
        start, end = rules.utc_bounds(date, tz)
        content = rules.render_day(date, tz, self._store.entries(vault_id, start, end))
        path = rules.day_path(date)
        for _ in range(3):
            doc = self._find(vault_id, path)
            try:
                if doc is None:
                    self._create_day(vault_id, date, tz, content)
                elif doc.get("content") != content:
                    self._port.put(self._db, {
                        **doc, "content": content, "updated_at": utc_now(),
                        "frontmatter": stamp_dates({**(doc.get("frontmatter") or {}), **rules.day_frontmatter(date, tz)},
                                                   today_cdmx(), doc.get("created_at"))})
                return
            except RevisionConflict:
                continue  # otro proceso escribió el mismo día a la vez: se relee y se reescribe
        logger.warning("bitacora day %s: write conflicts exhausted", date)

    def _find(self, vault_id: str, path: str) -> dict | None:
        folder = path.rsplit("/", 1)[0]
        after = None
        while True:
            docs = self._port.list_notes_by_prefix(self._db, vault_id, False, view_key(folder), 100, after)
            for doc in docs:
                if in_folder(doc["path"], folder) and path_key(doc["path"]) == path_key(path):
                    return doc
            if len(docs) < 100:
                return None
            after = (view_key(docs[-1]["path"]), docs[-1]["_id"])

    def _create_day(self, vault_id: str, date: str, tz: str, content: str) -> None:
        from app.services.note_content_service import NoteContentService
        from app.services.note_service import NotePathTaken, NoteService

        path = rules.day_path(date)
        doc_id = f"note:{vault_id}:{uuid.uuid4()}"
        try:
            NoteService(self._port, self._db).reserve_path(doc_id, path)
        except NotePathTaken:
            raise RevisionConflict("day note created concurrently") from None
        now = utc_now()
        self._port.put(self._db, {
            "_id": doc_id, "type": "note", "vault_id": vault_id, "path": path, "content": content,
            "frontmatter": stamp_dates(rules.day_frontmatter(date, tz), today_cdmx(), now),
            "created_at": now, "updated_at": now, "deleted_at": None,
        })
        NoteContentService(self._port, self._db).ensure_indexes(vault_id, path)
        self._describe_month(vault_id, date[:7])

    def _describe_month(self, vault_id: str, month: str) -> None:
        """El INDICE de la carpeta del mes lo crea el servidor sin descripción: se le pone la suya (norma de H-031)."""
        doc = self._find(vault_id, f"{BITACORA}/{month}/INDICE.md")
        if doc is None or (doc.get("frontmatter") or {}).get("descripcion"):
            return
        try:
            self._port.put(self._db, {**doc, "updated_at": utc_now(), "frontmatter": stamp_dates(
                {**(doc.get("frontmatter") or {}), "descripcion": f"Bitácora de {month}: un documento por día con los cambios de la bóveda."},
                today_cdmx(), doc.get("created_at"))})
        except RevisionConflict:
            pass  # otro proceso lo escribió a la vez; no es esencial
