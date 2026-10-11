from app.adapters.auth_repository import AuthRepository
from app.adapters.couchdb import CouchDBAdapter
from app.core.config import settings
from app.core.ports.couchdb_port import CouchDBPort
from app.services.auth_service import AuthService


def run_bootstrap(session_factory, couchdb: CouchDBPort | None = None) -> None:
    """Siembra el admin desde el entorno si todavía no hay usuarios."""
    session = session_factory()
    try:
        service = AuthService(AuthRepository(session), couchdb or CouchDBAdapter())
        service.bootstrap_admin(settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)
    finally:
        session.close()
