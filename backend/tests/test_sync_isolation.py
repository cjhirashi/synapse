"""Aislamiento del canal de sincronización entre usuarios (SPEC-0005 RF-001, RNF-003).

La base de cada petición sale sólo del token: B no ve nada de A por ninguna ruta del
canal, no puede nombrar la base de A en la URL y no puede escribir con el `owner_id` de A.
La base de A queda exactamente igual.
"""
import httpx

from app.core.config import settings
from tests.test_sync_api import (
    CHECKPOINT, change_ids, ensure_design, owner_of, push, reservation_id, vault_doc,
)
from tests.test_vaults_api import AUTH, assert_problem, create, stored_docs, user_db
from tests.test_vaults_isolation import GUEST, _guest


def _all_docs_with_local(db_name: str) -> dict:
    """Todo lo de la base de A, `_local` incluido, para comparar antes y después."""
    docs = stored_docs(db_name)
    local = httpx.get(f"{settings.COUCHDB_URL}/{db_name}/{CHECKPOINT}", auth=AUTH)
    return {**docs, CHECKPOINT: local.json() if local.status_code == 200 else None}


def test_rnf_003_another_users_data_is_invisible_and_untouchable(ready_admin, db):
    # A: una bóveda por REST (con reserva), otra por sync, `_design/vaults` y un checkpoint.
    a_rest = create(ready_admin, name="De A").json()
    a_owner, a_db = owner_of(db), user_db(db)
    a_synced = vault_doc(a_owner, name="Sync de A")
    assert push(ready_admin, [a_synced]).json() == []
    assert ready_admin.put(f"/sync/db/{CHECKPOINT}", json={"last_seq": "9"}).status_code == 201
    ensure_design(a_db)
    a_ids = [f"vault:{a_rest['id']}", a_synced["_id"]]
    before = _all_docs_with_local(a_db)

    guest = _guest(ready_admin, db)
    b_db = user_db(db, GUEST)
    assert b_db != a_db

    # Lectura: nada de A por ninguna ruta.
    assert change_ids(guest.get("/sync/db/_changes", params={"include_docs": "true"})) == []
    assert guest.get("/sync/db/_all_docs").json()["rows"] == []
    assert guest.post("/sync/db/_all_docs", json={"keys": a_ids}).json()["rows"] == [
        {"key": doc_id, "error": "not_found"} for doc_id in a_ids
    ]
    got = guest.post("/sync/db/_bulk_get", json={"docs": [{"id": i} for i in a_ids]}).json()["results"]
    assert all("error" in r["docs"][0] for r in got)
    diff = guest.post("/sync/db/_revs_diff", json={a_synced["_id"]: [a_synced["_rev"]]}).json()
    assert diff == {a_synced["_id"]: {"missing": [a_synced["_rev"]]}}
    assert_problem(guest.get(f"/sync/db/{CHECKPOINT}"), 404, "checkpoint-not-found")

    # La base de A en la URL: comodín, sin llegar a CouchDB.
    for method, path in (
        ("GET", f"/sync/{a_db}/"),
        ("GET", f"/sync/{a_db}/_all_docs"),
        ("POST", f"/sync/{a_db}/_bulk_docs"),
        ("PUT", f"/sync/{a_db}/{CHECKPOINT}"),
        ("GET", f"/sync/db/{a_db}"),
    ):
        assert_problem(guest.request(method, path, json={}), 404, "sync-endpoint-not-found")

    # Escritura con el `owner_id` de A → rechazada; con el suyo va a la base de B.
    as_a = vault_doc(a_owner, name="Intruso")
    assert push(guest, [as_a]).json() == [
        {"id": as_a["_id"], "rev": as_a["_rev"], "error": "forbidden", "reason": "owner-mismatch"},
    ]
    # Mismo `_id` que una bóveda de A y mismo nombre: no choca con nada de A.
    own = {**vault_doc(owner_of(db, GUEST), name="De A"), "_id": a_synced["_id"]}
    assert push(guest, [own]).json() == []
    assert guest.put(f"/sync/db/{CHECKPOINT}", json={"last_seq": "1"}).status_code == 201

    assert _all_docs_with_local(a_db) == before
    b_docs = stored_docs(b_db)
    assert set(b_docs) == {own["_id"], reservation_id("De A")}
    assert b_docs[own["_id"]]["owner_id"] == owner_of(db, GUEST)
    # Y A sigue sin ver nada de B.
    assert {r["id"] for r in ready_admin.get("/sync/db/_changes").json()["results"]} == set(a_ids)
    guest.close()
