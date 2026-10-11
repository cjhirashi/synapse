import httpx
from sqlalchemy.orm import sessionmaker

from app.adapters.auth_repository import AuthRepository
from app.bootstrap import run_bootstrap
from app.core.config import settings
from app.core.models.user import User
from app.core.security import verify_password
from app.services.auth_service import AuthService
from tests.conftest import engine
from tests.test_provisioning import FakeCouchDB

Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def test_rf_001_bootstrap_creates_seeded_admin(db):
    couch = FakeCouchDB()
    run_bootstrap(Session, couch)

    admin = db.query(User).one()
    assert admin.email == settings.ADMIN_EMAIL == "cjhirashi@gmail.com"
    assert admin.role.name == "admin"
    assert admin.must_change_password is True
    assert verify_password(admin.hashed_password, settings.ADMIN_PASSWORD)
    assert couch.created == [f"synapse_user_{admin.id}"]


def test_rf_001_bootstrap_is_idempotent(db):
    couch = FakeCouchDB()
    run_bootstrap(Session, couch)
    run_bootstrap(Session, couch)
    assert db.query(User).count() == 1
    assert len(couch.created) == 1


def test_rf_001_application_startup_runs_bootstrap_with_real_couchdb(client, db):
    admin = db.query(User).one()
    res = httpx.get(
        f"{settings.COUCHDB_URL}/{admin.couchdb_name}",
        auth=(settings.COUCHDB_USER, settings.COUCHDB_PASSWORD),
    )
    assert res.status_code == 200


def test_rf_016_concurrent_bootstrap_yields_single_admin(db):
    run_bootstrap(Session, FakeCouchDB())

    class BlindRepo(AuthRepository):
        """Simula a la réplica que leyó la tabla vacía antes de que la otra insertara."""

        def get_user_count(self):
            return 0

    session = Session()
    try:
        service = AuthService(BlindRepo(session), FakeCouchDB())
        assert service.bootstrap_admin(settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD) is None
    finally:
        session.close()
    assert db.query(User).count() == 1


def test_rf_013_bootstrap_normalizes_admin_email(db, monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_EMAIL", "  CJHirashi@Gmail.com ")
    run_bootstrap(Session, FakeCouchDB())
    assert db.query(User).one().email == "cjhirashi@gmail.com"
