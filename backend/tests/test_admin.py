import httpx

from app.core.config import settings
from app.core.models.user import User
from app.core.security import verify_password
from tests.conftest import SEED_PASSWORD, login


def _create(client, email="guest@test.com", password=SEED_PASSWORD):
    return client.post("/admin/users", json={"email": email, "password": password})


def test_rf_012_admin_creates_guest_with_real_couchdb(ready_admin, db):
    res = _create(ready_admin)
    assert res.status_code == 201
    body = res.json()
    assert body["email"] == "guest@test.com" and body["role"] == "guest"

    guest = db.query(User).filter(User.email == "guest@test.com").one()
    assert guest.must_change_password is True
    assert verify_password(guest.hashed_password, SEED_PASSWORD)
    couch = httpx.get(
        f"{settings.COUCHDB_URL}/synapse_user_{body['id']}",
        auth=(settings.COUCHDB_USER, settings.COUCHDB_PASSWORD),
    )
    assert couch.status_code == 200


def test_rf_013_duplicate_email_is_409(ready_admin):
    assert _create(ready_admin).status_code == 201
    assert _create(ready_admin).status_code == 409


def test_rf_013_guest_cannot_create_users(ready_admin, db):
    _create(ready_admin, "guest@test.com")
    db.query(User).filter(User.email == "guest@test.com").update({"must_change_password": False})
    db.commit()
    ready_admin.cookies.clear()
    assert login(ready_admin, "guest@test.com", SEED_PASSWORD).status_code == 200
    assert _create(ready_admin, "other@test.com").status_code == 403


def test_rf_013_unauthenticated_is_401(client):
    assert _create(client).status_code == 401


def test_rf_015_couchdb_failure_returns_503_and_leaves_no_user(ready_admin, db, monkeypatch):
    from app.adapters.couchdb import CouchDBAdapter
    from app.core.errors import ProvisioningError

    def boom(self, name):
        raise ProvisioningError("down")

    monkeypatch.setattr(CouchDBAdapter, "ensure_user_db", boom)
    assert _create(ready_admin).status_code == 503
    assert db.query(User).filter(User.email == "guest@test.com").count() == 0


def test_rf_013_email_differing_only_in_case_is_409(ready_admin):
    assert _create(ready_admin, "guest@test.com").status_code == 201
    assert _create(ready_admin, "  Guest@TEST.com ").status_code == 409


def test_rf_013_created_email_is_stored_normalized(ready_admin, db):
    res = _create(ready_admin, " New.Guest@Test.COM ")
    assert res.status_code == 201
    assert res.json()["email"] == "new.guest@test.com"
    assert db.query(User).filter(User.email == "new.guest@test.com").count() == 1


def test_rf_013_db_rejects_case_duplicates(db):
    import uuid
    from datetime import datetime

    import pytest
    from sqlalchemy.exc import IntegrityError

    for email in ("dup@test.com", "DUP@test.com"):
        db.add(User(id=str(uuid.uuid4()), email=email, hashed_password="x",
                    role_id="guest-role-id", created_at=datetime.utcnow()))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_rf_012_invalid_email_format_is_422(ready_admin, db):
    for bad in ("no-at-sign", "a@b", "a b@test.com", "@test.com", "a@.com"):
        assert _create(ready_admin, bad).status_code == 422, bad
    assert db.query(User).count() == 1
