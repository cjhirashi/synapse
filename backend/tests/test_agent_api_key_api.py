"""Router de gestión `/auth/agent-keys` (SPEC-0013 bloque E) — TestClient, sesión cookie real.

El plano sólo existe en memoria del test (P5/P4): se captura del cuerpo de `POST` y se
reutiliza. La gestión es **sólo cookie** (P-4/P-9): una `Bearer` key no acuña ni revoca keys.
"""
from fastapi.testclient import TestClient

from app.core.models.user import User
from app.core.security import is_well_formed_api_key
from app.main import app
from tests.conftest import SEED_PASSWORD, login
from tests.test_vaults_api import assert_problem

GUEST = "guest-keys@test.com"


# --- Helpers ---

def create_agent_key(client, label: str = "aira"):
    return client.post("/auth/agent-keys", json={"label": label})


def _raw(client, label: str = "aira") -> str:
    res = create_agent_key(client, label)
    assert res.status_code == 201, res.text
    return res.json()["key"]


def _guest(admin_client, db) -> TestClient:
    admin_client.post("/admin/users", json={"email": GUEST, "password": SEED_PASSWORD})
    db.query(User).filter(User.email == GUEST).update({"must_change_password": False})
    db.commit()
    guest = TestClient(app, base_url=str(admin_client.base_url))
    assert login(guest, GUEST, SEED_PASSWORD).status_code == 200
    return guest


# --- RF-001: crear (plano una sola vez) ---

def test_rf_001_post_returns_plaintext_key_once(ready_admin):
    res = create_agent_key(ready_admin, "aira")
    assert res.status_code == 201, res.text
    body = res.json()
    assert is_well_formed_api_key(body["key"])
    assert body["label"] == "aira" and "id" in body and "created_at" in body


def test_rf_001_plaintext_never_reappears_in_listing(ready_admin):
    create_agent_key(ready_admin, "aira")
    listed = ready_admin.get("/auth/agent-keys")
    assert listed.status_code == 200
    for item in listed.json():
        assert "key" not in item and "key_hash" not in item  # RF-004/RNF-002


# --- RF-004: listar sin exponer secreto ---

def test_rf_004_list_exposes_only_safe_fields(ready_admin):
    create_agent_key(ready_admin, "aira")
    item = ready_admin.get("/auth/agent-keys").json()[0]
    assert set(item) == {"id", "label", "created_at", "last_used_at", "revoked_at"}
    assert item["last_used_at"] is None and item["revoked_at"] is None


# --- RF-005: revocar (204; luego aparece revocada; ajena → 404) ---

def test_rf_005_delete_revokes_own_key(ready_admin):
    key_id = create_agent_key(ready_admin, "aira").json()["id"]
    assert ready_admin.delete(f"/auth/agent-keys/{key_id}").status_code == 204
    item = next(k for k in ready_admin.get("/auth/agent-keys").json() if k["id"] == key_id)
    assert item["revoked_at"] is not None


def test_rf_005_delete_foreign_key_is_not_found(ready_admin, db):
    guest = _guest(ready_admin, db)
    guest_key_id = create_agent_key(guest, "aira").json()["id"]
    # El admin no puede revocar la key del guest: 404, sin revelar que existe (P3).
    assert_problem(ready_admin.delete(f"/auth/agent-keys/{guest_key_id}"), 404, "agent-key-not-found")
    # y la del guest sigue intacta.
    assert guest.get("/auth/agent-keys").json()[0]["revoked_at"] is None


# --- Gestión sólo cookie (P-4/P-9) ---

def test_bearer_cannot_manage_keys(ready_admin):
    raw = _raw(ready_admin, "aira")
    bare = TestClient(app, base_url=str(ready_admin.base_url))  # sin cookie de sesión
    headers = {"Authorization": f"Bearer {raw}"}
    assert_problem(bare.get("/auth/agent-keys", headers=headers), 401, "not-authenticated")
    assert_problem(
        bare.post("/auth/agent-keys", json={"label": "x"}, headers=headers), 401, "not-authenticated"
    )
    assert_problem(
        bare.delete("/auth/agent-keys/whatever", headers=headers), 401, "not-authenticated"
    )


# --- RF-010: label único por dueño entre vigentes ---

def test_rf_010_duplicate_active_label_returns_409_without_leaking(ready_admin):
    first = create_agent_key(ready_admin, "aira").json()["key"]
    dup = create_agent_key(ready_admin, "aira")
    body = assert_problem(dup, 409, "agent-key-label-taken")
    # El 409 no filtra el plano de la key existente (RNF-002).
    assert first not in dup.text and "key" not in body


def test_rf_010_label_reusable_after_revoke(ready_admin):
    key_id = create_agent_key(ready_admin, "aira").json()["id"]
    assert ready_admin.delete(f"/auth/agent-keys/{key_id}").status_code == 204
    # Revocada la vieja, el mismo label vuelve a crearse (rotación).
    assert create_agent_key(ready_admin, "aira").status_code == 201


# --- Validación del cuerpo (422) ---

def test_label_is_required_and_bounded(ready_admin):
    assert ready_admin.post("/auth/agent-keys", json={}).status_code == 422
    assert ready_admin.post("/auth/agent-keys", json={"label": ""}).status_code == 422
    assert ready_admin.post("/auth/agent-keys", json={"label": "a" * 65}).status_code == 422
    assert ready_admin.post("/auth/agent-keys", json={"label": "x", "extra": 1}).status_code == 422
