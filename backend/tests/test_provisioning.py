import pytest

from app.adapters.auth_repository import AuthRepository
from app.core.errors import ProvisioningError
from app.core.models.user import User
from app.services.auth_service import AuthService


class FakeCouchDB:
    def __init__(self, fail=False):
        self.fail = fail
        self.created = []

    def ensure_user_db(self, name: str) -> None:
        if self.fail:
            raise ProvisioningError("CouchDB no disponible")
        self.created.append(name)


def _service(db, couch):
    return AuthService(AuthRepository(db), couch)


def test_rf_015_failure_in_couchdb_rolls_back_user(db):
    service = _service(db, FakeCouchDB(fail=True))
    with pytest.raises(ProvisioningError):
        service.create_guest_user("g@test.com", "admin1234")
    assert db.query(User).count() == 0


def test_rf_015_retry_after_failure_succeeds(db):
    couch = FakeCouchDB(fail=True)
    service = _service(db, couch)
    with pytest.raises(ProvisioningError):
        service.create_guest_user("g@test.com", "admin1234")
    couch.fail = False
    user = service.create_guest_user("g@test.com", "admin1234")
    assert couch.created == [f"synapse_user_{user.id}"]
    assert db.query(User).count() == 1


def test_rf_012_guest_is_created_with_forced_password_change(db):
    couch = FakeCouchDB()
    user = _service(db, couch).create_guest_user("g@test.com", "admin1234")
    assert user.role.name == "guest"
    assert user.must_change_password is True
    assert user.couchdb_name == f"synapse_user_{user.id}"
    assert couch.created == [user.couchdb_name]
