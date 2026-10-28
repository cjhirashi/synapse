"""Casos límite del acceso con key (SPEC-0013 bloque F): 401 vs 403, 503, best-effort.

Se ejercita sobre `/vaults` (REST) con el `Session` de prueba, que es donde se simula el
fallo del control plane y el de la escritura best-effort de `last_used_at`.
"""
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.adapters.agent_key_repository import AgentKeyRepository
from app.main import app
from tests.test_agent_api_key_api import create_agent_key
from tests.test_vaults_api import assert_problem, create


def _bearer_client(admin_client, raw: str) -> TestClient:
    client = TestClient(app, base_url=str(admin_client.base_url))
    client.headers["Authorization"] = f"Bearer {raw}"
    return client


# --- RF-007: revocada → 401, no 403 (no revela que existió) ---

def test_rf_007_revoked_key_is_401_not_403(ready_admin):
    created = create_agent_key(ready_admin, "aira").json()
    ready_admin.delete(f"/auth/agent-keys/{created['id']}")
    res = _bearer_client(ready_admin, created["key"]).get("/vaults")
    assert res.status_code == 401  # nunca 403
    assert_problem(res, 401, "not-authenticated")


# --- RF-008: control plane caído → 503 ---

def test_rf_008_control_plane_down_is_503(ready_admin, monkeypatch):
    raw = create_agent_key(ready_admin, "aira").json()["key"]

    def boom(self, key_hash):
        raise OperationalError("SELECT agent_api_keys", {}, Exception("postgres down"))

    # La consulta de resolución falla como si Postgres no respondiera (sólo el camino nuevo).
    monkeypatch.setattr(AgentKeyRepository, "get_active_by_hash", boom)
    assert_problem(_bearer_client(ready_admin, raw).get("/vaults"), 503, "storage-unavailable")


# --- RF-009: last_used_at best-effort no tumba la petición ---

def test_rf_009_last_used_write_failure_does_not_break_request(ready_admin, monkeypatch):
    create(ready_admin, name="De AIRA")
    raw = create_agent_key(ready_admin, "aira").json()["key"]

    def boom(self, key_id, when):
        raise RuntimeError("touch failed")

    monkeypatch.setattr(AgentKeyRepository, "touch_last_used", boom)
    # La escritura best-effort falla, pero la petición principal sigue siendo 200 (RF-009).
    assert _bearer_client(ready_admin, raw).get("/vaults").status_code == 200
