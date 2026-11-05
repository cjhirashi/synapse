"""Utilidades compartidas por las herramientas de H-030 (carga de carpetas, registro, claves, purga)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.adapters.database import SessionLocal  # noqa: E402
from app.adapters.vault_repository import VaultRepository  # noqa: E402
from app.core.models.user import User  # noqa: E402


def user_dbs(only_email: str | None = None) -> list[tuple[str, str, str]]:
    """`(user_id, email, base CouchDB)` de los usuarios activos con base."""
    with SessionLocal() as session:
        query = session.query(User).filter(User.is_active.is_(True))
        if only_email:
            query = query.filter(User.email == only_email.strip().lower())
        return [(u.id, u.email, u.couchdb_name) for u in query.all() if u.couchdb_name]


def active_vaults(port: VaultRepository, db: str) -> list[dict]:
    """Bóvedas vivas (no en la papelera) de la base."""
    vaults, after = [], None
    while True:
        page = port.list_page(db, False, 100, after)
        vaults += page
        if len(page) < 100:
            return vaults
        after = (page[-1]["created_at"], page[-1]["_id"])
