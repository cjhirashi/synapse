"""Errores de auth y admin como Problem Details (SPEC-0004 RF-004…RF-007, RF-009, RF-011).

Cada error conserva el código HTTP de SPEC-0002 y gana el `type` del catálogo. Que su
operación lo declare en el contrato (emitido ⊆ declarado) lo comprueba `ContractGuard`
para toda la suite (`tests/contract_guard.py`).
"""
import pytest

from app.core.models.user import User
from app.core.problems import PROBLEM_MEDIA_TYPE
from tests.conftest import SEED_EMAIL, SEED_PASSWORD, login

NEW = "a-brand-new-password"
URN = "urn:synapse:problem:"


def _assert_problem(response, status: int, slug: str) -> dict:
    assert response.status_code == status, response.text
    assert response.headers["content-type"] == PROBLEM_MEDIA_TYPE
    body = response.json()
    assert body["type"] == URN + slug
    assert body["status"] == status
    return body


def _set_cookie(client, name: str, value: str, path: str = "/") -> None:
    client.cookies.set(name, value, domain="testserver.local", path=path)


def _change(client, current=SEED_PASSWORD, new=NEW):
    return client.post(
        "/auth/change-password", json={"current_password": current, "new_password": new}
    )


def _create(client, email="guest@test.com", password=SEED_PASSWORD):
    return client.post("/admin/users", json={"email": email, "password": password})


# --- RF-006: cada error de auth/admin, con su código de siempre y su `type` ---

def _no_cookie(client, db):
    return client.get("/auth/me")


def _garbage_access_token(client, db):
    _set_cookie(client, "access_token", "not-a-jwt")
    return client.get("/auth/me")


def _access_token_of_previous_version(client, db):
    login(client)
    old_access = client.cookies.get("access_token")
    assert _change(client).status_code == 204
    client.cookies.delete("access_token")
    _set_cookie(client, "access_token", old_access)
    return client.get("/auth/me")


def _refresh_without_cookie(client, db):
    return client.post("/auth/refresh")


def _garbage_refresh_token(client, db):
    _set_cookie(client, "refresh_token", "garbage", path="/auth")
    return client.post("/auth/refresh")


def _reused_refresh_token(client, db):
    login(client)
    stolen = client.cookies.get("refresh_token")
    assert client.post("/auth/refresh").status_code == 200
    client.cookies.clear()
    _set_cookie(client, "refresh_token", stolen, path="/auth")
    return client.post("/auth/refresh")


def _wrong_credentials(client, db):
    return login(client, SEED_EMAIL, "not-the-password")


def _guest_on_admin(client, db):
    db.query(User).filter(User.email == SEED_EMAIL).update({"must_change_password": False})
    db.commit()
    login(client)
    assert _create(client).status_code == 201
    db.query(User).filter(User.email == "guest@test.com").update({"must_change_password": False})
    db.commit()
    client.cookies.clear()
    login(client, "guest@test.com", SEED_PASSWORD)
    return _create(client, "other@test.com")


def _pending_password_change(client, db):
    login(client)  # el admin sembrado nace con el cambio obligatorio
    return _create(client)


def _wrong_current_password(client, db):
    login(client)
    return _change(client, current="not-it")


def _email_taken(client, db):
    db.query(User).filter(User.email == SEED_EMAIL).update({"must_change_password": False})
    db.commit()
    login(client)
    assert _create(client).status_code == 201
    return _create(client)


AUTH_ERRORS = [
    (_no_cookie, 401, "not-authenticated"),
    (_garbage_access_token, 401, "invalid-token"),
    (_access_token_of_previous_version, 401, "invalid-token"),
    (_refresh_without_cookie, 401, "invalid-refresh-token"),
    (_garbage_refresh_token, 401, "invalid-refresh-token"),
    (_reused_refresh_token, 401, "invalid-refresh-token"),
    (_wrong_credentials, 401, "invalid-credentials"),
    (_guest_on_admin, 403, "admin-required"),
    (_pending_password_change, 403, "password-change-required"),
    (_wrong_current_password, 400, "wrong-current-password"),
    (_email_taken, 409, "email-taken"),
]


@pytest.mark.parametrize(
    "scenario, status, slug", AUTH_ERRORS, ids=[s.__name__.strip("_") for s, *_ in AUTH_ERRORS]
)
def test_auth_error_keeps_its_status_and_gains_its_type(client, db, scenario, status, slug):
    body = _assert_problem(scenario(client, db), status, slug)
    assert body["instance"].startswith(("/auth/", "/admin/"))


# --- RF-007: el login no revela si el email existe ---

def test_login_failure_is_identical_for_unknown_email_and_wrong_password(client):
    unknown = login(client, "nobody@test.com", "whatever-password")
    wrong = login(client, SEED_EMAIL, "whatever-password")
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.content == wrong.content


# --- RF-005 / RF-011: validación sin repetir valores del cliente ---

def test_password_policy_is_a_validation_problem_pointing_at_new_password(client):
    login(client)
    body = _assert_problem(_change(client, new="abc"), 422, "validation-error")
    assert [e["pointer"] for e in body["errors"]] == ["#/new_password"]
    assert "abc" not in body["errors"][0]["detail"]


def test_new_password_equal_to_current_is_a_validation_problem(client):
    # La semilla no cumple la longitud mínima: primero se pasa a una contraseña válida, así
    # el 422 sólo puede venir de la regla «distinta de la actual».
    login(client)
    assert _change(client).status_code == 204
    body = _assert_problem(_change(client, current=NEW, new=NEW), 422, "validation-error")
    assert body["errors"] == [
        {"pointer": "#/new_password", "detail": "New password must differ from the current one"}
    ]


def test_rejected_password_never_appears_in_the_response(client):
    secret = "Zq9-sec"  # más corta que el mínimo: la política la rechaza
    login(client)
    rejected = _change(client, new=secret)
    _assert_problem(rejected, 422, "validation-error")
    assert secret not in rejected.text
    assert secret not in _change(client, current=secret).text
    client.cookies.clear()
    assert secret not in login(client, SEED_EMAIL, secret).text
    # Tipo erróneo en el cuerpo: pydantic falla, pero el valor no vuelve.
    bad = client.post("/auth/login", json={"email": SEED_EMAIL, "password": [secret]})
    _assert_problem(bad, 422, "validation-error")
    assert secret not in bad.text


def test_invalid_email_on_user_creation_points_at_email(ready_admin):
    body = _assert_problem(_create(ready_admin, "not-an-email"), 422, "validation-error")
    assert body["errors"] == [{"pointer": "#/email", "detail": "Invalid email format"}]


# --- RF-004 / RF-006: almacenamiento caído ---

def test_couchdb_down_on_user_creation_is_503_without_internal_message(ready_admin, monkeypatch):
    from app.adapters.couchdb import CouchDBAdapter
    from app.core.errors import ProvisioningError

    def down(self, name):
        raise ProvisioningError("CouchDB inaccesible: connection refused at 10.0.0.7")

    monkeypatch.setattr(CouchDBAdapter, "ensure_user_db", down)
    response = _create(ready_admin)
    body = _assert_problem(response, 503, "storage-unavailable")
    assert body["detail"] == ProvisioningError.detail
    assert "10.0.0.7" not in response.text and "inaccesible" not in response.text
