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
    client.cookies.set("refresh_token", "garbage", domain="testserver", path="/auth")
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

    client.cookies.set("refresh_token", raw, domain="testserver", path="/auth")
    assert client.post("/auth/refresh").status_code == 401


def test_rf_009_logout_without_session_is_idempotent(client):
    assert client.post("/auth/logout").status_code == 204
