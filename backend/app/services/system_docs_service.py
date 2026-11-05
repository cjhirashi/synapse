"""Publicador de documentos de sistema (H-041).

Replica en cada bóveda los documentos de `app/system_docs/` (la skill global y `plantilla-skill`) y detecta la
deriva entre la copia de la bóveda y el repositorio. Escribe como `Actor("system")` por `NoteContentService`: pasa por
las mismas validaciones que cualquier nota, conserva el id de la nota existente (actualiza en sitio) y, si se le da
el propietario, deja constancia en la BITACORA con autor `sistema`. Es idempotente: solo escribe lo que difiere.

Se ejecuta (1) al crear una bóveda (`ensure_ag_folders`), (2) en segundo plano al arrancar el backend
(`SYSTEM_DOCS_SYNC`) y (3) con `scripts/sync_system_docs.py`.
"""
import logging
import threading
from typing import NamedTuple

from app.core import system_docs
from app.core.agent_access import Actor
from app.core.note_prefix import in_folder, view_key
from app.core.note_rules import path_key
from app.core.index_rules import folder_of
from app.core.ports.vault_port import VaultPort
from app.core.schemas import NoteCreate, NoteUpdate
from app.core.system_docs import SystemDoc
from app.services.change_log_service import SYSTEM, ChangeLogService
from app.services.note_content_service import NoteContentService

logger = logging.getLogger(__name__)

OK, CREATE, UPDATE, CONFLICT = "ok", "create", "update", "conflict"


class Action(NamedTuple):
    path: str
    action: str  # ok | create | update | conflict
    note_id: str | None = None
    detail: str | None = None
    # Lo que había antes, para revertir (`update`) o el id de la nota creada (`create`).
    before: dict | None = None


def _note_id(doc: dict) -> str:
    return doc["_id"].split(":")[2]


class SystemDocsService:
    """Una instancia por bóveda de usuario (base `db`)."""

    def __init__(
        self, port: VaultPort, db: str, owner_id: str | None = None,
        docs: tuple[SystemDoc, ...] | None = None,
    ):
        self._port = port
        self._db = db
        self._docs = system_docs.DOCS if docs is None else docs
        changelog = (ChangeLogService(port, db, owner_id, None, via="system", author=SYSTEM)
                     if owner_id is not None else None)
        self._contents = NoteContentService(port, db, actor=Actor("system"), changelog=changelog)

    # --- Lectura ---

    def _find(self, vault_id: str, path: str) -> dict | None:
        """La nota viva de la bóveda cuya ruta equivale a `path` (`path_key`), o `None`."""
        folder = folder_of(path)
        after = None
        while True:
            docs = self._port.list_notes_by_prefix(self._db, vault_id, False, view_key(folder), 100, after)
            for doc in docs:
                if in_folder(doc["path"], folder) and path_key(doc["path"]) == path_key(path):
                    return doc
            if len(docs) < 100:
                return None
            after = (view_key(docs[-1]["path"]), docs[-1]["_id"])

    def plan(self, vault_id: str) -> list[Action]:
        """Qué haría `apply` en la bóveda, sin escribir nada."""
        return [self._plan_one(vault_id, doc) for doc in self._docs]

    def _plan_one(self, vault_id: str, doc: SystemDoc) -> Action:
        existing = self._find(vault_id, doc.path)
        if existing is None:
            return Action(doc.path, CREATE)
        if existing["path"] != doc.path:
            return Action(doc.path, CONFLICT, _note_id(existing), "la ruta existe con otras mayúsculas")
        if system_docs.content_hash(existing.get("frontmatter"), existing.get("content", "")) \
                == system_docs.content_hash(doc.frontmatter, doc.content):
            return Action(doc.path, OK, _note_id(existing))
        return Action(doc.path, UPDATE, _note_id(existing))

    # --- Escritura ---

    def apply(self, vault_id: str) -> list[Action]:
        """Crea lo que falta y actualiza en sitio lo que difiere. Devuelve lo que hizo (con lo anterior para revertir)."""
        done = []
        for doc in self._docs:
            step = self._plan_one(vault_id, doc)
            if step.action == CREATE:
                created = self._contents.create(
                    vault_id, NoteCreate(path=doc.path, content=doc.content, frontmatter=doc.frontmatter))
                done.append(Action(doc.path, CREATE, created.note.id))
            elif step.action == UPDATE:
                existing = self._find(vault_id, doc.path)
                before = {"content": existing.get("content", ""), "frontmatter": existing.get("frontmatter")}
                self._contents.update(
                    vault_id, step.note_id, NoteUpdate(content=doc.content, frontmatter=doc.frontmatter),
                    f'"{existing["_rev"]}"')
                done.append(Action(doc.path, UPDATE, step.note_id, before=before))
            else:
                done.append(step)
        return done

    def revert(self, vault_id: str, actions: list[dict]) -> list[str]:
        """Deshace un `apply` según su informe: restaura el cuerpo y los metadatos anteriores y retira lo creado."""
        undone = []
        for item in actions:
            note_id = item["note_id"]
            doc = self._port.get(self._db, f"note:{vault_id}:{note_id}")
            if doc is None or doc.get("deleted_at"):
                continue
            etag = f'"{doc["_rev"]}"'
            if item["action"] == CREATE:
                self._contents.delete(vault_id, note_id, etag)
            elif item["action"] == UPDATE and item.get("before"):
                before = item["before"]
                self._contents.update(
                    vault_id, note_id, NoteUpdate(content=before["content"], frontmatter=before["frontmatter"]), etag)
            else:
                continue
            undone.append(item["path"])
        return undone


# --- Todas las bóvedas (arranque y script) ---

def _user_dbs(only_email: str | None = None) -> list[tuple[str, str, str]]:
    """`(user_id, correo, base CouchDB)` de los usuarios activos con base."""
    from app.adapters.database import SessionLocal
    from app.core.models.user import User

    with SessionLocal() as session:
        query = session.query(User).filter(User.is_active.is_(True))
        if only_email:
            query = query.filter(User.email == only_email.strip().lower())
        return [(u.id, u.email, u.couchdb_name) for u in query.all() if u.couchdb_name]


def _active_vaults(port: VaultPort, db: str) -> list[dict]:
    vaults, after = [], None
    while True:
        page = port.list_page(db, False, 100, after)
        vaults += page
        if len(page) < 100:
            return vaults
        after = (page[-1]["created_at"], page[-1]["_id"])


def sync_all(
    port: VaultPort, *, apply: bool, only_email: str | None = None, only_vault: str | None = None,
) -> list[dict]:
    """Recorre las bóvedas vivas de todos los usuarios: informa (`apply=False`) o replica (`apply=True`).

    Un fallo en una bóveda se anota en su entrada y no detiene a las demás.
    """
    report = []
    for user_id, email, db in _user_dbs(only_email):
        for vault in _active_vaults(port, db):
            vault_id = vault["_id"].split(":", 1)[1]
            if only_vault and vault_id != only_vault:
                continue
            entry = {"user": email, "vault": vault["name"], "vault_id": vault_id, "applied": apply}
            try:
                service = SystemDocsService(port, db, user_id)
                actions = service.apply(vault_id) if apply else service.plan(vault_id)
                entry["actions"] = [a._asdict() for a in actions]
            except Exception as exc:  # noqa: BLE001 - una bóveda con problemas no debe frenar al resto
                logger.warning("system docs sync failed for %s", vault_id, exc_info=True)
                entry["error"] = f"{type(exc).__name__}: {exc}"
            report.append(entry)
    return report


_RUN_LOCK = threading.Lock()


def sync_all_in_background(port: VaultPort) -> threading.Thread:
    """Replica en segundo plano al arrancar: no bloquea el servicio y un fallo solo se registra."""

    def run() -> None:
        if not _RUN_LOCK.acquire(blocking=False):
            return
        try:
            report = sync_all(port, apply=True)
            changed = sum(1 for e in report for a in e.get("actions", []) if a["action"] in (CREATE, UPDATE))
            failed = [e["vault_id"] for e in report if "error" in e]
            logger.info("system docs sync: %d vaults, %d documents written, %d failed %s",
                        len(report), changed, len(failed), failed)
        except Exception:  # noqa: BLE001
            logger.warning("system docs sync failed", exc_info=True)
        finally:
            _RUN_LOCK.release()

    thread = threading.Thread(target=run, name="system-docs-sync", daemon=True)
    thread.start()
    return thread
