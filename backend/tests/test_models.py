from datetime import datetime, timedelta

from app.core.models.refresh_token import RefreshToken
from app.core.models.user import User


def _user(**kw):
    base = dict(
        id="u1",
        email="a@test.com",
        hashed_password="x",
        role_id="guest-role-id",
        couchdb_name="synapse_user_u1",
        created_at=datetime.utcnow(),
    )
    base.update(kw)
    return User(**base)


def test_rf_019_must_change_password_defaults_to_false(db):
    db.add(_user())
    db.commit()
    assert db.get(User, "u1").must_change_password is False


def test_rf_019_must_change_password_persists_true(db):
    db.add(_user(must_change_password=True))
    db.commit()
    assert db.get(User, "u1").must_change_password is True


def test_rf_010_refresh_token_persists_hash_not_raw(db):
    db.add(_user())
    db.add(
        RefreshToken(
            id="r1",
            user_id="u1",
            token_hash="a" * 64,
            expires_at=datetime.utcnow() + timedelta(days=30),
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    token = db.get(RefreshToken, "r1")
    assert token.revoked is False
    assert token.token_hash == "a" * 64
    assert token.user.email == "a@test.com"
