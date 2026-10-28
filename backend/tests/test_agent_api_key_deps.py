"""Resolución del principal (SPEC-0013 bloque D) — `core/dependencies.py`.

Se prueba llamando a las dependencias directamente con un `Request` fabricado y el `db`
real: `get_current_principal` acepta cookie (sin regresión) o `Bearer`, y `get_current_user`
sigue siendo cookie-only (la superficie de admin/gestión no admite keys).
"""
from datetime import datetime, timedelta

import jwt
import pytest
from starlette.requests import Request

from app.adapters.agent_key_repository import AgentKeyRepository
from app.core.config import settings
from app.core.dependencies import get_current_principal, get_current_user
from app.core.errors import InvalidToken, NotAuthenticated
from app.core.models.user import User
from app.services.agent_key_service import AgentKeyService


# --- Helpers ---

def _user(db, user_id="u1", email="a@test.com") -> User:
    user = User(
        id=user_id,
        email=email,
        hashed_password="x",
        is_active=True,
        role_id="guest-role-id",
        couchdb_name=f"synapse_user_{user_id}",
        created_at=datetime.utcnow(),
    )
    db.add(user)
    db.commit()
    return user


def _cookie_jwt(user: User) -> str:
    return jwt.encode(
        {
            "sub": user.id,
            "role": user.role.name,
            "exp": datetime.utcnow() + timedelta(hours=1),
            "ver": user.token_version,
        },
        settings.JWT_SECRET,
        algorithm="HS256",
    )


def _request(*, cookie: str | None = None, bearer: str | None = None) -> Request:
    headers = []
    if cookie is not None:
        headers.append((b"cookie", f"access_token={cookie}".encode()))
    if bearer is not None:
        headers.append((b"authorization", f"Bearer {bearer}".encode()))
    return Request({"type": "http", "method": "GET", "path": "/", "headers": headers})


def _new_key(db, owner_id="u1", label="aira") -> str:
    _, raw = AgentKeyService(AgentKeyRepository(db)).create(owner_id, label)
    return raw


# --- Cookie: sin regresión ---

def test_rf_002_cookie_resolves_same_as_get_current_user(db):
    user = _user(db)
    req = _request(cookie=_cookie_jwt(user))
    principal = get_current_principal(req, db)
    legacy = get_current_user(req, db)
    assert (principal.sub, principal.role) == (legacy.sub, legacy.role) == ("u1", "guest")


def test_get_current_user_still_rejects_bad_cookie(db):
    _user(db)
    with pytest.raises(InvalidToken):
        get_current_user(_request(cookie="garbage"), db)


# --- Bearer ---

def test_rf_002_bearer_resolves_owner_principal(db):
    _user(db)
    req = _request(bearer=_new_key(db))
    principal = get_current_principal(req, db)
    assert (principal.sub, principal.role) == ("u1", "guest")


def test_rf_003_bearer_malformed_is_not_authenticated(db):
    _user(db)
    with pytest.raises(NotAuthenticated):
        get_current_principal(_request(bearer="not-a-key"), db)


def test_rf_007_bearer_revoked_is_not_authenticated(db):
    _user(db)
    svc = AgentKeyService(AgentKeyRepository(db))
    key, raw = svc.create("u1", "aira")
    svc.revoke("u1", key.id)
    with pytest.raises(NotAuthenticated):
        get_current_principal(_request(bearer=raw), db)


def test_rf_003_no_cookie_no_bearer_is_not_authenticated(db):
    _user(db)
    with pytest.raises(NotAuthenticated):
        get_current_principal(_request(), db)


def test_rf_002_cookie_takes_precedence_over_bearer(db):
    owner = _user(db, "u1", "a@test.com")
    other = _user(db, "u2", "b@test.com")
    bearer = _new_key(db, "u2", "aira")  # key de u2
    # Con cookie de u1 y Bearer de u2, manda la cookie (camino humano dominante).
    principal = get_current_principal(_request(cookie=_cookie_jwt(owner), bearer=bearer), db)
    assert principal.sub == "u1"
    assert other.id == "u2"


# --- La superficie cookie-only no admite keys ---

def test_bearer_cannot_reach_cookie_only_surface(db):
    _user(db)
    bearer = _new_key(db)
    # `get_current_user` (base de /auth/me, change-password, require_admin) ignora el Bearer.
    with pytest.raises(NotAuthenticated):
        get_current_user(_request(bearer=bearer), db)
