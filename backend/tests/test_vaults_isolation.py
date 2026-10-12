"""Aislamiento de bóvedas entre usuarios y acceso al router (SPEC-0003 RF-014, RF-015).

La base de cada petición sale sólo del token: el id de una bóveda ajena no existe en la
base de quien pregunta, y la respuesta no se distingue de la de un id inexistente.
"""
import uuid

from fastapi.testclient import TestClient

from app.core.models.user import User
from app.main import app
from tests.conftest import SEED_PASSWORD, login
from tests.test_vaults_api import assert_problem, create, stored_docs, user_db

GUEST = "b@test.com"


def _guest(admin_client, db, must_change: bool = False) -> TestClient:
    admin_client.post("/admin/users", json={"email": GUEST, "password": SEED_PASSWORD})
    db.query(User).filter(User.email == GUEST).update({"must_change_password": must_change})
    db.commit()
    guest = TestClient(app, base_url=str(admin_client.base_url))
    assert login(guest, GUEST, SEED_PASSWORD).status_code == 200
    return guest


def _six_requests(client, vault_id: str, etag: str = '"1-x"'):
    """Una petición a cada endpoint de bóvedas, con `If-Match` donde se exige."""
    headers = {"If-Match": etag}
    return {
        "list": client.get("/vaults"),
        "create": client.post("/vaults", json={"name": "B"}),
        "get": client.get(f"/vaults/{vault_id}"),
        "patch": client.patch(f"/vaults/{vault_id}", json={"name": "B"}, headers=headers),
        "delete": client.delete(f"/vaults/{vault_id}", headers=headers),
        "restore": client.post(f"/vaults/{vault_id}/restore", headers=headers),
    }


def _without_instance(body: dict) -> dict:
    return {k: v for k, v in body.items() if k != "instance"}


def test_rf_014_another_users_vault_is_invisible_and_untouchable(ready_admin, db):
    a_vault = create(ready_admin, name="De A")
    a_id, a_etag = a_vault.json()["id"], a_vault.headers["etag"]
    a_db = user_db(db)
    guest = _guest(ready_admin, db)
    before = stored_docs(a_db)

    assert guest.get("/vaults").json()["items"] == []
    missing = assert_problem(guest.get(f"/vaults/{uuid.uuid4()}"), 404, "vault-not-found")
    not_uuid = assert_problem(guest.get("/vaults/not-a-uuid"), 404, "vault-not-found")
    for name, res in _six_requests(guest, a_id, a_etag).items():
        if name in ("list", "create"):
            continue
        body = assert_problem(res, 404, "vault-not-found")
        # Mismo cuerpo que un id inexistente o no UUID; sólo `instance` (la ruta) cambia.
        assert _without_instance(body) == _without_instance(missing) == _without_instance(not_uuid)
        assert body["instance"] == res.request.url.path
    assert stored_docs(a_db) == before
    guest.close()


def test_rf_015_every_vault_endpoint_requires_a_session(client):
    for res in _six_requests(client, str(uuid.uuid4())).values():
        assert_problem(res, 401, "not-authenticated")


def test_rf_015_pending_password_change_blocks_every_vault_endpoint(ready_admin, db):
    guest = _guest(ready_admin, db, must_change=True)
    for res in _six_requests(guest, str(uuid.uuid4())).values():
        assert_problem(res, 403, "password-change-required")
    assert stored_docs(user_db(db, GUEST)) == {}
    guest.close()
