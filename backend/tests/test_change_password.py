from app.core.models.refresh_token import RefreshToken
from app.core.models.user import User
from tests.conftest import SEED_EMAIL, SEED_PASSWORD, login

NEW = "a-brand-new-password"


def _change(client, current=SEED_PASSWORD, new=NEW):
    return client.post(
        "/auth/change-password", json={"current_password": current, "new_password": new}
    )


def test_rf_017_change_password_clears_flag_and_revokes_refresh(client, db):
    login(client)
    assert _change(client).status_code == 204

    user = db.query(User).filter(User.email == SEED_EMAIL).one()
    assert user.must_change_password is False
    tokens = db.query(RefreshToken).all()
    # Los anteriores quedan revocados; sólo vive el emitido para la sesión actual.
    assert [t.revoked for t in tokens].count(False) == 1
    assert tokens[0].revoked is True

    client.cookies.clear()
    assert login(client, SEED_EMAIL, SEED_PASSWORD).status_code == 401
    assert login(client, SEED_EMAIL, NEW).status_code == 200


def test_rf_018_wrong_current_password_is_400_and_changes_nothing(client, db):
    login(client)
    assert _change(client, current="not-it").status_code == 400
    assert db.query(User).one().must_change_password is True
    client.cookies.clear()
    assert login(client).status_code == 200


def test_rf_018_policy_violations_are_422(client):
    login(client)
    assert _change(client, new="short").status_code == 422
    assert _change(client, current=SEED_PASSWORD, new=SEED_PASSWORD).status_code == 422


def test_rf_017_requires_authentication(client):
    assert _change(client).status_code == 401


def test_rf_021_access_token_issued_before_password_change_is_rejected(client):
    login(client)
    old_access = client.cookies.get("access_token")
    res = _change(client)
    assert res.status_code == 204
    set_cookie = " ".join(res.headers.get_list("set-cookie"))
    assert "access_token=" in set_cookie and "refresh_token=" in set_cookie

    # La sesión actual sigue viva con las cookies nuevas…
    assert client.get("/auth/me").status_code == 200
    # …pero el access token anterior ya no sirve, aunque no haya expirado.
    client.cookies.delete("access_token")
    client.cookies.set("access_token", old_access, domain="testserver.local")
    assert client.get("/auth/me").status_code == 401


def test_rf_021_other_session_loses_access_after_password_change(client):
    from contextlib import closing

    from fastapi.testclient import TestClient

    from app.main import app

    login(client)
    with closing(TestClient(app, base_url=str(client.base_url))) as other:
        assert login(other).status_code == 200
        assert other.get("/auth/me").status_code == 200
        assert _change(client).status_code == 204
        assert other.get("/auth/me").status_code == 401
        assert other.post("/auth/refresh").status_code == 401
