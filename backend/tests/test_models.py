from datetime import datetime, timedelta

import pytest
from sqlalchemy.exc import IntegrityError

from app.core.models.agent_api_key import AgentApiKey
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


# --- Keys de agente (SPEC-0013) ---

def _agent_key(**kw):
    base = dict(
        id="k1",
        owner_id="u1",
        label="aira",
        key_hash="h" * 64,
        created_at=datetime.utcnow(),
    )
    base.update(kw)
    return AgentApiKey(**base)


def test_rf_001_agent_api_key_persists_hash_and_owner(db):
    db.add(_user())
    db.add(_agent_key())
    db.commit()
    key = db.get(AgentApiKey, "k1")
    # Sólo el hash en reposo; el valor plano nunca toca la tabla (P4/RNF-002).
    assert key.key_hash == "h" * 64
    assert key.label == "aira"
    assert key.last_used_at is None and key.revoked_at is None
    assert key.owner.email == "a@test.com"  # FK a users


def test_rf_004_agent_api_key_hash_is_unique(db):
    db.add(_user())
    db.add(_agent_key(id="k1", label="aira"))
    db.add(_agent_key(id="k2", label="liza"))  # mismo key_hash por defecto
    with pytest.raises(IntegrityError):
        db.commit()


def test_rf_010_active_label_is_unique_per_owner(db):
    db.add(_user())
    db.add(_agent_key(id="k1", key_hash="a" * 64))
    db.add(_agent_key(id="k2", key_hash="b" * 64))  # mismo owner + label, ambas vigentes
    with pytest.raises(IntegrityError):
        db.commit()


def test_rf_010_label_is_reusable_after_revoke(db):
    db.add(_user())
    db.add(_agent_key(id="k1", key_hash="a" * 64, revoked_at=datetime.utcnow()))
    db.commit()
    # Revocada la anterior, el mismo label vuelve a estar libre (rotación).
    db.add(_agent_key(id="k2", key_hash="b" * 64))
    db.commit()
    assert db.get(AgentApiKey, "k2").label == "aira"


def test_rf_006_owner_id_is_indexed_for_scoped_lookups(db):
    # El listado/revocación filtran por owner_id; debe estar indexado (P2/P3).
    index_names = {ix.name for ix in AgentApiKey.__table__.indexes}
    assert "ix_agent_api_keys_owner_id" in index_names
