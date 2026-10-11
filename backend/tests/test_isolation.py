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


def _ready_guest(admin_client, db, email="g@test.com"):
    from fastapi.testclient import TestClient

    admin_client.post("/admin/users", json={"email": email, "password": SEED_PASSWORD})
    db.query(User).filter(User.email == email).update({"must_change_password": False})
    db.commit()
    guest = TestClient(app, base_url=str(admin_client.base_url))
    assert login(guest, email, SEED_PASSWORD).status_code == 200
    return guest


def _protected_get_paths():
    """Todo GET sin parámetros de ruta salvo los públicos: crece solo cuando se añadan
    endpoints de datos (SPEC-0003 y siguientes)."""
    public = {"/health"}
    paths = []
    for path, ops in app.openapi()["paths"].items():
        if "get" in ops and "{" not in path and path not in public:
            paths.append(path)
    return paths


def test_rf_014_no_protected_response_leaks_another_users_identifiers(ready_admin, db):
    guest = _ready_guest(ready_admin, db)
    admin = db.query(User).filter(User.email == SEED_EMAIL).one()
    other = db.query(User).filter(User.email == "g@test.com").one()

    paths = _protected_get_paths()
    assert "/auth/me" in paths  # el recorrido no es vacío
    for client, me, them in ((ready_admin, admin, other), (guest, other, admin)):
        for path in paths:
            res = client.get(path)
            assert res.status_code < 500, path
            body = res.text
            for marker in (them.id, them.email, them.couchdb_name):
                assert marker not in body, (me.email, path, marker)
    guest.close()


def test_rf_014_user_databases_are_not_readable_without_couchdb_credentials(ready_admin, db):
    guest = _ready_guest(ready_admin, db)
    for user in db.query(User).all():
        res = httpx.get(f"{settings.COUCHDB_URL}/{user.couchdb_name}")
        assert res.status_code == 401, user.couchdb_name
        res = httpx.get(f"{settings.COUCHDB_URL}/{user.couchdb_name}/_all_docs")
        assert res.status_code == 401, user.couchdb_name
    guest.close()
