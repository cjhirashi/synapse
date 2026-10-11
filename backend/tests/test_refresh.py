from datetime import datetime, timedelta

from app.core.models.refresh_token import RefreshToken
from app.core.security import hash_refresh_token
from tests.conftest import login


def test_rf_010_refresh_token_is_stored_hashed(client, db):
    login(client)
    raw = client.cookies.get("refresh_token")
    stored = db.query(RefreshToken).one()
    assert stored.token_hash == hash_refresh_token(raw)
    assert stored.token_hash != raw
    assert stored.revoked is False
    assert timedelta(days=29) < stored.expires_at - datetime.utcnow() <= timedelta(days=30)


def test_rf_010_refresh_issues_new_access_token(client):
    login(client)
    client.cookies.delete("access_token")
    assert client.get("/auth/me").status_code == 401

    res = client.post("/auth/refresh")
    assert res.status_code == 200
    assert "access_token" in res.headers.get("set-cookie", "")
    assert client.get("/auth/me").status_code == 200


def test_rf_011_refresh_without_cookie_is_401(client):
    assert client.post("/auth/refresh").status_code == 401


def test_rf_011_refresh_with_garbage_token_is_401(client):
    client.cookies.set("refresh_token", "garbage", domain="testserver.local", path="/auth")
    assert client.post("/auth/refresh").status_code == 401


def test_rf_011_expired_refresh_token_is_401(client, db):
    login(client)
    db.query(RefreshToken).update({"expires_at": datetime.utcnow() - timedelta(seconds=1)})
    db.commit()
    assert client.post("/auth/refresh").status_code == 401


def test_rf_009_logout_clears_cookies_and_revokes_refresh(client, db):
    login(client)
    raw = client.cookies.get("refresh_token")

    res = client.post("/auth/logout")
    assert res.status_code == 204
    cleared = " ".join(res.headers.get_list("set-cookie")).lower()
    assert "access_token=" in cleared and "refresh_token=" in cleared
    assert db.query(RefreshToken).one().revoked is True

    client.cookies.set("refresh_token", raw, domain="testserver.local", path="/auth")
    assert client.post("/auth/refresh").status_code == 401


def test_rf_009_logout_without_session_is_idempotent(client):
    assert client.post("/auth/logout").status_code == 204


def _replay(client, raw):
    client.cookies.clear()
    client.cookies.set("refresh_token", raw, domain="testserver.local", path="/auth")
    return client.post("/auth/refresh")


def test_rf_010_refresh_rotates_the_refresh_token(client, db):
    login(client)
    old = client.cookies.get("refresh_token")
    res = client.post("/auth/refresh")
    assert res.status_code == 200
    assert "refresh_token=" in " ".join(res.headers.get_list("set-cookie"))
    new = client.cookies.get("refresh_token")
    assert new and new != old

    used = db.query(RefreshToken).filter(RefreshToken.token_hash == hash_refresh_token(old)).one()
    assert used.revoked is True
    fresh = db.query(RefreshToken).filter(RefreshToken.token_hash == hash_refresh_token(new)).one()
    assert fresh.revoked is False
    # La nueva cookie sirve para seguir renovando.
    assert client.post("/auth/refresh").status_code == 200


def test_rf_022_reusing_a_rotated_refresh_token_revokes_every_session(client, db):
    login(client)
    stolen = client.cookies.get("refresh_token")
    assert client.post("/auth/refresh").status_code == 200
    legit = client.cookies.get("refresh_token")

    assert _replay(client, stolen).status_code == 401
    assert db.query(RefreshToken).filter(RefreshToken.revoked.is_(False)).count() == 0
    assert _replay(client, legit).status_code == 401


def test_rf_022_token_revoked_by_logout_does_not_trigger_mass_revocation(client, db):
    from contextlib import closing

    from fastapi.testclient import TestClient

    from app.main import app

    login(client)
    raw = client.cookies.get("refresh_token")
    with closing(TestClient(app, base_url=str(client.base_url))) as other:
        login(other)
        assert client.post("/auth/logout").status_code == 204
        assert _replay(client, raw).status_code == 401
        # La otra sesión del mismo usuario sigue pudiendo renovar.
        assert other.post("/auth/refresh").status_code == 200
