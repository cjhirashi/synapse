"""Cuánto usa una cuenta de lo que sus límites acotan (H-060): bóvedas vivas, documentos vivos de una bóveda y bytes de
sus archivos. Lecturas sin reglas; las usan la guardia de creación, la ventana del administrador y el reajuste."""
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.limits import counts_as_document
from app.core.models.file import File
from app.core.ports.vault_port import VaultPort

_PAGE = 500


def active_vaults(port: VaultPort, db: str) -> list[dict]:
    """Las bóvedas vivas de la base `db`, de la más nueva a la más vieja."""
    found: list[dict] = []
    after = None
    while True:
        page = port.list_page(db, False, _PAGE, after)
        found.extend(page)
        if len(page) < _PAGE:
            return found
        after = (page[-1]["created_at"], page[-1]["_id"])


def user_notes(port: VaultPort, db: str, vault_id: str) -> list[dict]:
    """Las notas vivas de la bóveda que cuentan como documentos (sin índices ni documentos de sistema), de la más nueva
    a la más vieja."""
    found: list[dict] = []
    after = None
    while True:
        page = port.list_notes(db, vault_id, False, _PAGE, after)
        found.extend(doc for doc in page if counts_as_document(doc.get("path")))
        if len(page) < _PAGE:
            return found
        after = (page[-1]["created_at"], page[-1]["_id"])


def storage_bytes(session: Session, vault_id: str) -> int:
    return session.query(func.coalesce(func.sum(File.size), 0)).filter(File.vault_id == vault_id).scalar() or 0


def storage_total(session: Session, owner_id: str) -> int:
    """Bytes de todos los archivos de la cuenta, en todas sus bóvedas (consulta SQL barata: va en el listado)."""
    return session.query(func.coalesce(func.sum(File.size), 0)).filter(File.owner_id == owner_id).scalar() or 0
