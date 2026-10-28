"""Servicio de API keys de agente (SPEC-0013, bloque C) — BD real (SQLite, control plane).

Cada test lleva su RF-. El valor plano sólo existe en memoria del test (nunca en un fixture,
P5/P4): se captura del retorno de `create` y se usa en `resolve` acto seguido.
"""
from datetime import datetime

import pytest

from app.adapters.agent_key_repository import AgentKeyRepository
from app.core.errors import AgentKeyLabelTaken, AgentKeyNotFound
from app.core.models.user import User
from app.core.security import hash_api_key, is_well_formed_api_key
from app.services.agent_key_service import AgentKeyService


# --- Helpers ---

def _user(db, user_id="u1", email="a@test.com", is_active=True) -> User:
    user = User(
        id=user_id,
        email=email,
        hashed_password="x",
        is_active=is_active,
        role_id="guest-role-id",
        couchdb_name=f"synapse_user_{user_id}",
        created_at=datetime.utcnow(),
    )
    db.add(user)
    db.commit()
    return user


def _service(db) -> AgentKeyService:
    return AgentKeyService(AgentKeyRepository(db))


# --- RF-001: crear (plano una vez, hash persistido) ---

def test_rf_001_create_persists_hash_and_returns_plaintext_once(db):
    _user(db)
    service = _service(db)
    key, raw = service.create("u1", "aira")
    # El plano es una key bien formada y NO se guarda: en reposo sólo su hash.
    assert is_well_formed_api_key(raw)
    assert key.key_hash == hash_api_key(raw)
    assert raw != key.key_hash
    assert key.owner_id == "u1" and key.label == "aira"
    assert key.revoked_at is None and key.last_used_at is None


# --- RF-002/RF-003: resolver ---

def test_rf_002_resolve_accepts_active_key_and_returns_owner(db):
    _user(db)
    service = _service(db)
    _, raw = service.create("u1", "aira")
    resolved = service.resolve(raw)
    assert resolved is not None and resolved.owner_id == "u1"


def test_rf_003_resolve_rejects_malformed_key(db):
    _user(db)
    assert _service(db).resolve("not-a-key") is None


def test_rf_003_resolve_rejects_unknown_but_wellformed_key(db):
    _user(db)
    # Bien formada pero jamás emitida: no existe su hash.
    assert _service(db).resolve("syn_ak_" + "a" * 43) is None


def test_rf_007_resolve_rejects_revoked_key(db):
    _user(db)
    service = _service(db)
    key, raw = service.create("u1", "aira")
    service.revoke("u1", key.id)
    assert service.resolve(raw) is None


def test_rf_002_resolve_rejects_inactive_owner(db):
    _user(db)
    service = _service(db)
    _, raw = service.create("u1", "aira")
    db.query(User).filter(User.id == "u1").update({"is_active": False})
    db.commit()
    assert service.resolve(raw) is None


# --- RF-004: listar (scoped por dueño) ---

def test_rf_004_list_is_scoped_to_owner(db):
    _user(db, "u1", "a@test.com")
    _user(db, "u2", "b@test.com")
    svc = _service(db)
    svc.create("u1", "aira")
    svc.create("u1", "liza")
    svc.create("u2", "main")
    labels_u1 = {k.label for k in svc.list("u1")}
    assert labels_u1 == {"aira", "liza"}
    assert {k.label for k in svc.list("u2")} == {"main"}


def test_rf_004_list_includes_revoked_with_timestamp(db):
    _user(db)
    svc = _service(db)
    key, _ = svc.create("u1", "aira")
    svc.revoke("u1", key.id)
    listed = svc.list("u1")
    assert len(listed) == 1 and listed[0].revoked_at is not None


# --- RF-005: revocar (propia; no afecta a las demás) ---

def test_rf_005_revoke_one_leaves_the_others_active(db):
    _user(db)
    svc = _service(db)
    k1, raw1 = svc.create("u1", "aira")
    _, raw2 = svc.create("u1", "liza")
    svc.revoke("u1", k1.id)
    assert svc.resolve(raw1) is None        # la revocada ya no vale
    assert svc.resolve(raw2) is not None     # la otra sigue viva (RF-005)


def test_rf_005_revoke_foreign_key_raises_not_found(db):
    _user(db, "u1", "a@test.com")
    _user(db, "u2", "b@test.com")
    svc = _service(db)
    k, _ = svc.create("u1", "aira")
    # u2 no puede revocar una key de u1: 404, no revela que exista (P3).
    with pytest.raises(AgentKeyNotFound):
        svc.revoke("u2", k.id)
    # y la key de u1 sigue intacta.
    assert svc.list("u1")[0].revoked_at is None


# --- RF-009: last_used_at best-effort ---

def test_rf_009_resolve_updates_last_used_at(db):
    _user(db)
    svc = _service(db)
    _, raw = svc.create("u1", "aira")
    resolved = svc.resolve(raw)
    assert resolved.last_used_at is not None


def test_rf_009_resolve_survives_last_used_write_failure(db):
    _user(db)
    repo = AgentKeyRepository(db)
    svc = AgentKeyService(repo)
    _, raw = svc.create("u1", "aira")

    def boom(*a, **k):
        raise RuntimeError("touch failed")

    repo.touch_last_used = boom  # el UPDATE best-effort falla
    # La resolución no debe caer por eso (RF-009): la petición principal sigue.
    assert svc.resolve(raw) is not None


# --- RF-010: label único por dueño entre keys vigentes ---

def test_rf_010_duplicate_active_label_raises_label_taken(db):
    _user(db)
    svc = _service(db)
    svc.create("u1", "aira")
    with pytest.raises(AgentKeyLabelTaken):
        svc.create("u1", "aira")


def test_rf_010_label_reusable_after_revoke(db):
    _user(db)
    svc = _service(db)
    k, _ = svc.create("u1", "aira")
    svc.revoke("u1", k.id)
    # Revocada la vieja, el mismo label vuelve a estar libre (rotación).
    key2, _ = svc.create("u1", "aira")
    assert key2.label == "aira" and key2.id != k.id


def test_rf_010_same_label_allowed_for_different_owners(db):
    _user(db, "u1", "a@test.com")
    _user(db, "u2", "b@test.com")
    svc = _service(db)
    svc.create("u1", "aira")
    key2, _ = svc.create("u2", "aira")  # unicidad por dueño, nunca global
    assert key2.owner_id == "u2"
