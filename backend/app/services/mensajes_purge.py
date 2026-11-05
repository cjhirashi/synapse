"""Purga de conversaciones cerradas de `AG - MENSAJES` (H-030 E7).

Una conversación con `estado: cerrada` y `cerrada_el` de hace más de 15 días se elimina físicamente: antes se
vuelca a un archivo JSONL (que se conserva 30 días), luego se borran sus notas (INDICE incluido), las reservas
de sus rutas y, si su carpeta de destinatario queda sin conversaciones, el INDICE de esa carpeta. Los borrados
son tombstones de CouchDB, sin papelera: la réplica los propaga a los clientes. Idempotente: reejecutarla no
encuentra lo ya purgado.
"""
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import NamedTuple

from app.core import ag_rules
from app.core.errors import RevisionConflict
from app.core.index_rules import is_index_path
from app.core.note_prefix import in_folder, view_key
from app.core.ports.vault_port import VaultPort
from app.core.timestamps import parse_timestamp
from app.services.note_service import _reservation_id

PURGE_AFTER = timedelta(days=15)
DUMP_KEEP = timedelta(days=30)


class Candidate(NamedTuple):
    para: str
    conversation: str
    folder: str
    closed_at: datetime
    docs: list[dict]  # todas las notas bajo la carpeta, vivas y en la papelera


class PurgePlan(NamedTuple):
    candidates: list[Candidate]
    alerts: list[str]  # cerradas sin `cerrada_el` legible: se ignoran


def _docs_under(port: VaultPort, db: str, vault_id: str, folder: str) -> list[dict]:
    docs = []
    for deleted in (False, True):
        after = None
        while True:
            page = port.list_notes_by_prefix(db, vault_id, deleted, view_key(folder), 100, after)
            docs += [d for d in page if in_folder(d["path"], folder)]
            if len(page) < 100:
                break
            after = (view_key(page[-1]["path"]), page[-1]["_id"])
    return docs


def plan(port: VaultPort, db: str, vault_id: str, now: datetime) -> PurgePlan:
    candidates: list[Candidate] = []
    alerts: list[str] = []
    for doc in _docs_under(port, db, vault_id, ag_rules.AG_MENSAJES):
        if doc.get("deleted_at"):
            continue
        info = ag_rules.parse_mensaje_path(doc["path"])
        if info is None or info.kind != "cabecera":
            continue
        frontmatter = doc.get("frontmatter") or {}
        if frontmatter.get("estado") != "cerrada":
            continue
        folder = ag_rules.conversation_folder(info.para, info.conversation)
        try:
            closed_at = parse_timestamp(frontmatter["cerrada_el"])
        except (KeyError, ValueError, TypeError):
            alerts.append(f"ALERTA: {doc['path']} está cerrada sin cerrada_el legible; no se purga")
            continue
        if now - closed_at > PURGE_AFTER:
            candidates.append(Candidate(info.para, info.conversation, folder, closed_at,
                                        _docs_under(port, db, vault_id, folder)))
    return PurgePlan(candidates, alerts)


def _dump(path: Path, owner_id: str, vault_id: str, candidate: Candidate) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        for doc in candidate.docs:
            handle.write(json.dumps({"owner_id": owner_id, "vault_id": vault_id, "conversation": candidate.folder,
                                     "doc": doc}, ensure_ascii=False) + "\n")
        handle.flush()
        import os
        os.fsync(handle.fileno())


def _delete(port: VaultPort, db: str, doc: dict) -> bool:
    try:
        port.delete(db, doc["_id"], doc["_rev"])
        return True
    except RevisionConflict:
        return False


def _release_reservation(port: VaultPort, db: str, doc: dict) -> None:
    reservation = port.get(db, _reservation_id(doc["_id"], doc["path"]))
    if reservation is not None:
        _delete(port, db, reservation)


def execute(port: VaultPort, db: str, owner_id: str, vault_id: str, candidate: Candidate, dump_path: Path) -> int:
    """Vuelca y elimina una conversación; devuelve cuántas notas borró. Si algún borrado choca por `_rev`,
    queda para la próxima corrida (el volcado ya contiene todo)."""
    _dump(dump_path, owner_id, vault_id, candidate)
    deleted = 0
    # Primero las notas de contenido, el INDICE al final, para que la carpeta no quede con INDICE huérfano.
    for doc in sorted(candidate.docs, key=lambda d: is_index_path(d["path"])):
        _release_reservation(port, db, doc)
        if _delete(port, db, doc):
            deleted += 1
    _purge_empty_recipient_index(port, db, owner_id, vault_id, candidate.para, dump_path)
    return deleted


def _purge_empty_recipient_index(port: VaultPort, db: str, owner_id: str, vault_id: str, para: str, dump_path: Path) -> None:
    """Si `AG - MENSAJES/<para>/` ya no tiene conversaciones, se va también su INDICE."""
    folder = f"{ag_rules.AG_MENSAJES}/{para}"
    docs = [d for d in _docs_under(port, db, vault_id, folder) if not d.get("deleted_at")]
    if docs and all(is_index_path(d["path"]) and d["path"] == f"{folder}/INDICE.md" for d in docs):
        for doc in docs:
            _release_reservation(port, db, doc)
            _delete(port, db, doc)


def prune_dumps(root: Path, now: datetime) -> list[str]:
    """Elimina los volcados de más de 30 días (carpetas `AAAAMMDD`)."""
    removed = []
    if not root.exists():
        return removed
    for folder in sorted(root.iterdir()):
        try:
            day = datetime.strptime(folder.name, "%Y%m%d")
        except ValueError:
            continue
        if now - day > DUMP_KEEP and folder.is_dir():
            for file in folder.iterdir():
                file.unlink()
            folder.rmdir()
            removed.append(folder.name)
    return removed
