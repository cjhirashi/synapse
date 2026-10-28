"""Acceso de datos con una `Bearer` key (SPEC-0013 bloque F) — TestClient + CouchDB real.

El test que más importa (§5.2): una key resuelve al **mismo** alcance de datos que la cookie
de su dueño (RF-002), **nunca** al de otro usuario (RF-006/P2), en REST (`/vaults`) y en el
canal (`/sync`); una key revocada falla en la **siguiente** petición (RNF-001).
"""
from fastapi.testclient import TestClient

from app.core.models.user import User
from app.main import app
from tests.conftest import SEED_PASSWORD, login
from tests.test_agent_api_key_api import create_agent_key
from tests.test_vaults_api import assert_problem, create

GUEST = "guest-access@test.com"


# --- Helpers ---

def _bearer_client(admin_client, raw: str) -> TestClient:
    """Cliente sin cookie, que sólo lleva la API key en el header (como un agente OpenClaw)."""
    client = TestClient(app, base_url=str(admin_client.base_url))
    client.headers["Authorization"] = f"Bearer {raw}"
    return client


def _guest(admin_client, db) -> TestClient:
    admin_client.post("/admin/users", json={"email": GUEST, "password": SEED_PASSWORD})
    db.query(User).filter(User.email == GUEST).update({"must_change_password": False})
    db.commit()
    guest = TestClient(app, base_url=str(admin_client.base_url))
    assert login(guest, GUEST, SEED_PASSWORD).status_code == 200
    return guest


def _vault_ids(response) -> set[str]:
    return {v["id"] for v in response.json()["items"]}


def _all_docs_ids(client) -> set[str]:
    res = client.get("/sync/db/_all_docs", params={"include_docs": "true"})
    assert res.status_code == 200, res.text
    return {row["id"] for row in res.json()["rows"]}


# --- RF-002: misma bóveda/base que la cookie del dueño ---

def test_rf_002_bearer_reads_same_vaults_as_owner_cookie(ready_admin):
    vault_id = create(ready_admin, name="De AIRA").json()["id"]
    raw = create_agent_key(ready_admin, "aira").json()["key"]
    agent = _bearer_client(ready_admin, raw)
    # REST: la key ve exactamente las bóvedas del dueño.
    assert _vault_ids(agent.get("/vaults")) == _vault_ids(ready_admin.get("/vaults")) == {vault_id}


def test_rf_002_bearer_resolves_same_sync_base_as_owner(ready_admin):
    create(ready_admin, name="De AIRA")
    raw = create_agent_key(ready_admin, "aira").json()["key"]
    agent = _bearer_client(ready_admin, raw)
    # Canal: misma base synapse_user_{owner} → mismas filas que la cookie.
    assert _all_docs_ids(agent) == _all_docs_ids(ready_admin)
    assert _all_docs_ids(agent)  # no vacío: contiene la bóveda del dueño


# --- RF-006/P2: nunca el alcance de otro usuario ---

def test_rf_006_guest_key_never_sees_admin_data(ready_admin, db):
    admin_vault = create(ready_admin, name="Del admin").json()["id"]
    guest = _guest(ready_admin, db)
    guest_raw = create_agent_key(guest, "aira").json()["key"]
    agent = _bearer_client(ready_admin, guest_raw)  # key del guest, cliente sin cookie
    # La key del guest resuelve a SU base: no ve la bóveda del admin.
    assert _vault_ids(agent.get("/vaults")) == set()
    assert_problem(agent.get(f"/vaults/{admin_vault}"), 404, "vault-not-found")


def test_rf_006_admin_key_never_sees_guest_data(ready_admin, db):
    guest = _guest(ready_admin, db)
    guest_vault = create(guest, name="Del guest").json()["id"]
    admin_raw = create_agent_key(ready_admin, "aira").json()["key"]
    agent = _bearer_client(ready_admin, admin_raw)
    assert guest_vault not in _vault_ids(agent.get("/vaults"))
    assert_problem(agent.get(f"/vaults/{guest_vault}"), 404, "vault-not-found")


# --- RNF-001: revocar surte efecto en la siguiente petición ---

def test_rnf_001_revoked_key_fails_on_next_request(ready_admin):
    create(ready_admin, name="De AIRA")
    created = create_agent_key(ready_admin, "aira").json()
    raw, key_id = created["key"], created["id"]
    agent = _bearer_client(ready_admin, raw)
    assert agent.get("/vaults").status_code == 200       # vigente
    assert ready_admin.delete(f"/auth/agent-keys/{key_id}").status_code == 204
    # Sin caché de validez: la misma key, acto seguido, ya no vale (401, no 403).
    assert_problem(agent.get("/vaults"), 401, "not-authenticated")
