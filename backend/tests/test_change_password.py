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
    assert all(t.revoked for t in db.query(RefreshToken).all())

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
