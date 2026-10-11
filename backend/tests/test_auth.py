from datetime import datetime, timedelta

import jwt

from app.core.config import settings
from app.core.schemas import TokenPayload
from tests.conftest import SEED_EMAIL, SEED_PASSWORD, login


def test_health_check(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_rf_004_login_sets_access_and_refresh_cookies(client):
    res = login(client)
    assert res.status_code == 200
    assert res.json()["role"] == "admin"
    cookies = {c.name: c for c in client.cookies.jar}
    assert "access_token" in cookies and "refresh_token" in cookies

    set_cookie = [h.lower() for h in res.headers.get_list("set-cookie")]
    access = next(h for h in set_cookie if h.startswith("access_token="))
    refresh = next(h for h in set_cookie if h.startswith("refresh_token="))
    for header in (access, refresh):
        assert "httponly" in header and "secure" in header and "samesite=lax" in header
    assert "max-age=86400" in access
    assert "max-age=2592000" in refresh and "path=/auth" in refresh


def test_rf_004_access_token_payload_has_only_sub_role_exp(client):
    login(client)
    token = client.cookies.get("access_token")
    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    assert set(payload) == {"sub", "role", "exp"}
    assert payload["role"] == "admin"
    remaining = payload["exp"] - datetime.utcnow().timestamp()
    assert 23 * 3600 < remaining <= 24 * 3600 + 5


def test_rf_005_wrong_password_and_unknown_email_look_identical(client):
    wrong_pw = login(client, SEED_EMAIL, "not-the-password")
    unknown = login(client, "nobody@test.com", SEED_PASSWORD)
    assert wrong_pw.status_code == unknown.status_code == 401
    assert wrong_pw.json() == unknown.json()


def test_rf_006_protected_endpoint_without_cookie(client):
    assert client.get("/auth/me").status_code == 401


def test_rf_006_invalid_token_is_rejected(client):
    client.cookies.set("access_token", "not-a-jwt", domain="testserver")
    assert client.get("/auth/me").status_code == 401


def test_rf_006_token_signed_with_other_secret_is_rejected(client):
    bad = jwt.encode(
        {"sub": "x", "role": "admin", "exp": datetime.utcnow() + timedelta(hours=1)},
        "another-secret",
        algorithm="HS256",
    )
    client.cookies.set("access_token", bad, domain="testserver")
    assert client.get("/auth/me").status_code == 401


def test_rf_006_expired_token_is_rejected(client):
    expired = jwt.encode(
        {"sub": "x", "role": "admin", "exp": datetime.utcnow() - timedelta(seconds=10)},
        settings.JWT_SECRET,
        algorithm="HS256",
    )
    client.cookies.set("access_token", expired, domain="testserver")
    assert client.get("/auth/me").status_code == 401


def test_rf_008_authorization_header_is_ignored(client):
    login(client)
    token = client.cookies.get("access_token")
    client.cookies.clear()
    res = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401


def test_rf_006_valid_cookie_grants_access(client, auth_cookies):
    res = client.get("/auth/me")
    assert res.status_code == 200
    assert res.json()["role"] == "admin"


def test_rf_007_require_admin_rejects_guest():
    import asyncio

    import pytest
    from fastapi import HTTPException

    from app.core.dependencies import require_admin

    guest = TokenPayload(sub="u", role="guest", exp=9999999999)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(require_admin(guest))
    assert exc.value.status_code == 403


def test_rf_001_public_register_endpoint_no_longer_exists(client):
    res = client.post("/auth/register", json={"email": "x@test.com", "password": "secret"})
    assert res.status_code == 404


def test_rf_013_login_is_case_insensitive(client):
    assert login(client, "  CJHirashi@Gmail.COM ", SEED_PASSWORD).status_code == 200


def test_rf_005_login_runs_argon2_even_for_unknown_or_inactive_user(client, db, monkeypatch):
    from app.core.models.user import User
    from app.services import auth_service

    calls = []
    real = auth_service.verify_password

    def spy(hashed, password):
        calls.append(hashed)
        return real(hashed, password)

    monkeypatch.setattr(auth_service, "verify_password", spy)
    assert login(client, "nobody@test.com", SEED_PASSWORD).status_code == 401
    assert len(calls) == 1

    db.query(User).filter(User.email == SEED_EMAIL).update({"is_active": False})
    db.commit()
    assert login(client, SEED_EMAIL, SEED_PASSWORD).status_code == 401
    assert len(calls) == 2
