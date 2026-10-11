import httpx

from app.core.config import settings
from app.core.models.user import User
from app.main import app
from tests.conftest import SEED_EMAIL, SEED_PASSWORD, login


def _couch_exists(name: str) -> bool:
    res = httpx.get(
        f"{settings.COUCHDB_URL}/{name}",
        auth=(settings.COUCHDB_USER, settings.COUCHDB_PASSWORD),
    )
    return res.status_code == 200


def test_rf_014_each_user_gets_their_own_couchdb_database(ready_admin, db):
    ready_admin.post("/admin/users", json={"email": "g@test.com", "password": SEED_PASSWORD})
    admin = db.query(User).filter(User.email == SEED_EMAIL).one()
    guest = db.query(User).filter(User.email == "g@test.com").one()

    assert admin.couchdb_name == f"synapse_user_{admin.id}"
    assert guest.couchdb_name == f"synapse_user_{guest.id}"
    assert admin.couchdb_name != guest.couchdb_name
    assert _couch_exists(admin.couchdb_name) and _couch_exists(guest.couchdb_name)


def test_rf_014_identity_comes_only_from_the_token(ready_admin, db):
    ready_admin.post("/admin/users", json={"email": "g@test.com", "password": SEED_PASSWORD})
    admin_id = db.query(User).filter(User.email == SEED_EMAIL).one().id
    guest_id = db.query(User).filter(User.email == "g@test.com").one().id

    assert ready_admin.get("/auth/me").json()["user_id"] == admin_id
    # Parámetros inyectados no cambian la identidad (P2, P3)
    assert ready_admin.get(f"/auth/me?user_id={guest_id}").json()["user_id"] == admin_id

    ready_admin.cookies.clear()
    db.query(User).filter(User.id == guest_id).update({"must_change_password": False})
    db.commit()
    login(ready_admin, "g@test.com", SEED_PASSWORD)
    assert ready_admin.get("/auth/me").json()["user_id"] == guest_id


def test_rf_014_no_endpoint_accepts_a_user_identifier():
    for path, methods in app.openapi()["paths"].items():
        assert "{user_id}" not in path and "{id}" not in path, path
        for method, op in methods.items():
            for param in op.get("parameters", []):
                assert param["name"].lower() not in {"user_id", "userid", "owner", "couchdb_name"}, (
                    path,
                    method,
                )
            schema = op.get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema", {})
            ref = schema.get("$ref", "").split("/")[-1]
            props = app.openapi()["components"]["schemas"].get(ref, {}).get("properties", {})
            assert not {"user_id", "owner", "couchdb_name"} & set(props), (path, method)
