"""`/vaults/**` de punta a punta: TestClient + CouchDB real (SPEC-0003).

Que cada error emitido esté declarado en el contrato lo comprueba `ContractGuard` en
toda la suite; aquí se comprueban códigos, cuerpos, cabeceras y lo que queda en CouchDB.
Los helpers de este módulo los reutilizan los tests de aislamiento y concurrencia.
"""
import uuid

import httpx
import pytest

from app.adapters.vault_repository import VaultRepository
from app.core.config import settings
from app.core.models.user import User
from app.core.problems import PROBLEM_MEDIA_TYPE
from app.main import app
from app.routers.vaults import get_vault_port
from tests.conftest import SEED_EMAIL

URN = "urn:synapse:problem:"
AUTH = (settings.COUCHDB_USER, settings.COUCHDB_PASSWORD)


# --- Helpers ---

def user_db(db, email: str = SEED_EMAIL) -> str:
    return db.query(User).filter(User.email == email).one().couchdb_name


def stored_docs(db_name: str) -> dict[str, dict]:
    """Todos los documentos de la base (sin los de diseño), por `_id`."""
    res = httpx.get(f"{settings.COUCHDB_URL}/{db_name}/_all_docs",
                    params={"include_docs": "true"}, auth=AUTH)
    res.raise_for_status()
    return {r["id"]: r["doc"] for r in res.json()["rows"] if not r["id"].startswith("_design/")}


def stored_vaults(db_name: str) -> list[dict]:
    return [d for d in stored_docs(db_name).values() if d.get("type") == "vault"]


def create(client, name: str = "Notas", **fields):
    return client.post("/vaults", json={"name": name, **fields})


def assert_problem(response, status: int, slug: str) -> dict:
    assert response.status_code == status, response.text
    assert response.headers["content-type"] == PROBLEM_MEDIA_TYPE
    body = response.json()
    assert (body["type"], body["status"]) == (URN + slug, status)
    return body


def etag_in_trash(client, vault_id: str) -> str:
    """El `ETag` de una bóveda borrada, sacado del listado de la Papelera como haría la UI
    (PLAN-0003 §13): `GET /vaults/{id}` de una borrada es 404."""
    items = client.get("/vaults", params={"deleted": "true", "limit": 200}).json()["items"]
    return next(v["etag"] for v in items if v["id"] == vault_id)


# --- T-025: flujos felices (RF-001, 002, 004, 006, 008, 009, 011, 012, 013, 022) ---

def test_rf_004_post_creates_the_vault_in_the_callers_database(ready_admin, db):
    res = create(ready_admin, name="  Notas ", description="d", tags=["Work", "work"])
    assert res.status_code == 201, res.text
    body = res.json()
    admin = db.query(User).filter(User.email == SEED_EMAIL).one()
    assert uuid.UUID(body["id"]).version == 4
    assert (body["name"], body["tags"], body["owner_id"]) == ("Notas", ["work"], admin.id)
    assert body["deleted_at"] is None and body["created_at"] == body["updated_at"]
    stored = stored_docs(admin.couchdb_name)[f"vault:{body['id']}"]
    assert res.headers["etag"] == f'"{stored["_rev"]}"' and stored["owner_id"] == admin.id


def test_rf_008_get_by_id_returns_the_vault_and_its_etag(ready_admin):
    created = create(ready_admin)
    res = ready_admin.get(f"/vaults/{created.json()['id']}")
    assert res.status_code == 200
    assert res.json() == created.json() and res.headers["etag"] == created.headers["etag"]


def test_rf_001_list_returns_active_vaults_newest_first(ready_admin):
    ids = [create(ready_admin, name=f"v{i}").json()["id"] for i in range(3)]
    res = ready_admin.get("/vaults")
    assert res.status_code == 200
    assert [v["id"] for v in res.json()["items"]] == ids[::-1]
    assert res.json()["next_cursor"] is None
    # PLAN-0003 §13: cada elemento lleva el mismo `ETag` que daría su `GET`.
    for item in res.json()["items"]:
        assert item["etag"] == ready_admin.get(f"/vaults/{item['id']}").headers["etag"]


def test_rf_002_pagination_walks_every_vault_once(ready_admin):
    ids = [create(ready_admin, name=f"v{i}").json()["id"] for i in range(5)]
    seen, cursor = [], None
    while True:
        params = {"limit": 2} | ({"cursor": cursor} if cursor else {})
        page = ready_admin.get("/vaults", params=params).json()
        assert len(page["items"]) <= 2
        seen += [v["id"] for v in page["items"]]
        if not (cursor := page["next_cursor"]):
            break
    assert seen == ids[::-1]


def test_rf_009_patch_updates_only_sent_fields_with_a_new_etag(ready_admin):
    created = create(ready_admin, description="d", tags=["a"])
    vault_id, etag = created.json()["id"], created.headers["etag"]
    res = ready_admin.patch(f"/vaults/{vault_id}", json={"description": None},
                            headers={"If-Match": etag})
    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["name"], body["description"], body["tags"]) == ("Notas", None, ["a"])
    assert body["updated_at"] > created.json()["updated_at"]
    assert res.headers["etag"] != etag
    assert ready_admin.get(f"/vaults/{vault_id}").headers["etag"] == res.headers["etag"]


def test_rf_011_delete_hides_the_vault_and_keeps_its_data(ready_admin, db):
    created = create(ready_admin, description="d")
    vault_id = created.json()["id"]
    res = ready_admin.delete(f"/vaults/{vault_id}", headers={"If-Match": created.headers["etag"]})
    assert res.status_code == 204 and res.content == b""
    assert ready_admin.get("/vaults").json()["items"] == []
    assert_problem(ready_admin.get(f"/vaults/{vault_id}"), 404, "vault-not-found")
    [stored] = stored_vaults(user_db(db))
    assert stored["deleted_at"] and stored["description"] == "d"


def test_rf_012_trash_lists_only_deleted_vaults_with_pagination(ready_admin):
    kept = create(ready_admin, name="kept").json()["id"]
    gone = []
    for i in range(3):
        res = create(ready_admin, name=f"gone{i}")
        ready_admin.delete(f"/vaults/{res.json()['id']}", headers={"If-Match": res.headers["etag"]})
        gone.append(res.json()["id"])
    first = ready_admin.get("/vaults", params={"deleted": "true", "limit": 2}).json()
    second = ready_admin.get(
        "/vaults", params={"deleted": "true", "limit": 2, "cursor": first["next_cursor"]}
    ).json()
    listed = first["items"] + second["items"]
    assert [v["id"] for v in listed] == gone[::-1] and second["next_cursor"] is None
    assert all(v["deleted_at"] for v in listed) and kept not in [v["id"] for v in listed]


def test_rf_012_trash_items_carry_the_etag_that_restore_needs(ready_admin, db):
    created = create(ready_admin)
    vault_id = created.json()["id"]
    ready_admin.delete(f"/vaults/{vault_id}", headers={"If-Match": created.headers["etag"]})
    [item] = ready_admin.get("/vaults", params={"deleted": "true"}).json()["items"]
    assert item["etag"] == f'"{stored_docs(user_db(db))[f"vault:{vault_id}"]["_rev"]}"'
    assert item["etag"] != created.headers["etag"]


def test_rf_013_restore_brings_the_vault_back(ready_admin, db):
    created = create(ready_admin)
    vault_id = created.json()["id"]
    ready_admin.delete(f"/vaults/{vault_id}", headers={"If-Match": created.headers["etag"]})
    res = ready_admin.post(f"/vaults/{vault_id}/restore",
                           headers={"If-Match": etag_in_trash(ready_admin, vault_id)})
    assert res.status_code == 200, res.text
    assert res.json()["deleted_at"] is None
    assert res.headers["etag"] == ready_admin.get(f"/vaults/{vault_id}").headers["etag"]
    assert [v["id"] for v in ready_admin.get("/vaults").json()["items"]] == [vault_id]


# --- T-026: 422 sin escribir nada (RF-003, RF-005, RF-023) ---

@pytest.mark.parametrize("limit", [0, 201, "x"])
def test_rf_003_limit_out_of_range_is_422(ready_admin, limit):
    body = assert_problem(ready_admin.get("/vaults", params={"limit": limit}), 422, "validation-error")
    assert [e.get("parameter") for e in body["errors"]] == ["limit"]


@pytest.mark.parametrize("deleted", [False, True])
def test_rf_003_garbage_or_foreign_cursor_is_422(ready_admin, deleted):
    for i in range(2):
        res = create(ready_admin, name=f"v{i}")
        if deleted:
            ready_admin.delete(f"/vaults/{res.json()['id']}", headers={"If-Match": res.headers["etag"]})
    # Cursor válido de la otra lista (papelera ↔ normal) y cursor basura.
    other = ready_admin.get("/vaults", params={"deleted": str(deleted).lower(), "limit": 1})
    emitted = other.json()["next_cursor"]
    # PLAN-0003 §15 (VA-2, VA-3): un cursor emitido con datos añadidos y uno enorme.
    tampered = ready_admin.get("/vaults", params={"deleted": str(deleted).lower(), "limit": 1})
    for cursor in (emitted, "%%%", tampered.json()["next_cursor"] + "AAAA", "A" * 10_000):
        res = ready_admin.get("/vaults", params={"deleted": str(not deleted).lower(), "cursor": cursor})
        body = assert_problem(res, 422, "validation-error")
        assert body["errors"] == [{"parameter": "cursor", "detail": "Invalid cursor."}]


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"name": "   "},
        {"name": "a" * 101},
        {"name": "n", "description": "d" * 2001},
        {"name": "n", "tags": [f"t{i}" for i in range(21)]},
        {"name": "n", "tags": ["t" * 33]},
        {"name": "n", "owner_id": "someone-else"},
        {"name": "n", "id": str(uuid.uuid4())},
        {"name": "n", "deleted_at": "2026-10-12T00:00:00Z"},
    ],
)
def test_rf_005_rf_023_invalid_post_body_is_422_without_saving(ready_admin, db, payload):
    assert_problem(ready_admin.post("/vaults", json=payload), 422, "validation-error")
    assert stored_docs(user_db(db)) == {}


@pytest.mark.parametrize("method", ["post", "patch"])
def test_rf_005_name_with_control_characters_is_422_without_saving(ready_admin, db, method):
    # SPEC-0003 enmienda 1 (E2): mensaje del catálogo de SPEC-0004, nunca el valor enviado.
    if method == "post":
        res = ready_admin.post("/vaults", json={"name": "a\u0000b"})
    else:
        created = create(ready_admin)
        res = ready_admin.patch(f"/vaults/{created.json()['id']}", json={"name": "a\u0000b"},
                                headers={"If-Match": created.headers["etag"]})
    before = stored_docs(user_db(db))
    body = assert_problem(res, 422, "validation-error")
    assert body["errors"] == [
        {"pointer": "#/name", "detail": "Must not contain control characters"}
    ]
    assert stored_docs(user_db(db)) == before
    assert not any(d.get("name") == "a\u0000b" for d in before.values())


@pytest.mark.parametrize(
    "payload",
    [{"name": None}, {"tags": None}, {"name": ""}, {"owner_id": "x"}, {"tags": ["t" * 33]}],
)
def test_rf_005_rf_023_invalid_patch_body_is_422_without_changes(ready_admin, db, payload):
    created = create(ready_admin)
    before = stored_docs(user_db(db))
    res = ready_admin.patch(f"/vaults/{created.json()['id']}", json=payload,
                            headers={"If-Match": created.headers["etag"]})
    assert_problem(res, 422, "validation-error")
    assert stored_docs(user_db(db)) == before


# --- T-027: 409, 428, 412, 404 y 503 (RF-007, 010, 017, 025, 026, 027) ---

def test_rf_007_same_name_ignoring_case_is_409_without_saving(ready_admin, db):
    create(ready_admin, name="Notas")
    assert_problem(create(ready_admin, name="notas"), 409, "vault-name-taken")
    assert len(stored_vaults(user_db(db))) == 1


def test_rf_007_equivalent_unicode_names_are_409_and_the_name_is_kept(ready_admin, db):
    # SPEC-0003 enmienda 1 (E1): NFKC + `casefold`; el nombre se guarda tal como llega.
    assert create(ready_admin, name="Straße").json()["name"] == "Straße"
    assert_problem(create(ready_admin, name="STRASSE"), 409, "vault-name-taken")
    assert create(ready_admin, name="caf\u00e9").status_code == 201
    assert_problem(create(ready_admin, name="cafe\u0301"), 409, "vault-name-taken")
    assert len(stored_vaults(user_db(db))) == 2


def test_rf_027_names_are_freed_by_delete_and_by_rename(ready_admin):
    first = create(ready_admin, name="Borrada")
    ready_admin.delete(f"/vaults/{first.json()['id']}", headers={"If-Match": first.headers["etag"]})
    assert create(ready_admin, name="borrada").status_code == 201
    second = create(ready_admin, name="Viejo")
    res = ready_admin.patch(f"/vaults/{second.json()['id']}", json={"name": "Nuevo"},
                            headers={"If-Match": second.headers["etag"]})
    assert res.status_code == 200
    assert create(ready_admin, name="viejo").status_code == 201
    assert_problem(create(ready_admin, name="NUEVO"), 409, "vault-name-taken")


def test_rf_025_restore_with_a_taken_name_is_409_and_stays_deleted(ready_admin, db):
    created = create(ready_admin, name="Notas")
    vault_id = created.json()["id"]
    ready_admin.delete(f"/vaults/{vault_id}", headers={"If-Match": created.headers["etag"]})
    create(ready_admin, name="NOTAS")
    res = ready_admin.post(f"/vaults/{vault_id}/restore",
                           headers={"If-Match": etag_in_trash(ready_admin, vault_id)})
    assert_problem(res, 409, "vault-name-taken")
    assert stored_docs(user_db(db))[f"vault:{vault_id}"]["deleted_at"]


def _write(client, operation: str, vault_id: str, headers: dict):
    if operation == "patch":
        return client.patch(f"/vaults/{vault_id}", json={"description": "x"}, headers=headers)
    if operation == "delete":
        return client.delete(f"/vaults/{vault_id}", headers=headers)
    return client.post(f"/vaults/{vault_id}/restore", headers=headers)


@pytest.mark.parametrize("operation", ["patch", "delete", "restore"])
def test_rf_010_writes_need_a_current_if_match(ready_admin, db, operation):
    created = create(ready_admin)
    vault_id = created.json()["id"]
    if operation == "restore":
        ready_admin.delete(f"/vaults/{vault_id}", headers={"If-Match": created.headers["etag"]})
    before = stored_docs(user_db(db))
    assert_problem(_write(ready_admin, operation, vault_id, {}), 428, "precondition-required")
    assert_problem(_write(ready_admin, operation, vault_id, {"If-Match": '"1-stale"'}),
                   412, "precondition-failed")
    assert stored_docs(user_db(db)) == before


def test_rf_026_delete_of_deleted_and_restore_of_active_are_404(ready_admin, db):
    active = create(ready_admin, name="activa")
    res = ready_admin.post(f"/vaults/{active.json()['id']}/restore",
                           headers={"If-Match": active.headers["etag"]})
    assert_problem(res, 404, "vault-not-found")
    gone = create(ready_admin, name="borrada")
    gone_id = gone.json()["id"]
    ready_admin.delete(f"/vaults/{gone_id}", headers={"If-Match": gone.headers["etag"]})
    res = ready_admin.delete(f"/vaults/{gone_id}",
                             headers={"If-Match": etag_in_trash(ready_admin, gone_id)})
    assert_problem(res, 404, "vault-not-found")


@pytest.mark.parametrize("form", ["upper", "no-hyphens", "braces", "urn"])
def test_rf_014_non_canonical_id_is_404_without_changes(ready_admin, db, form):
    # PLAN-0003 §15 (VA-5): la misma bóveda con un id en forma no canónica no existe.
    created = create(ready_admin)
    vault_id = created.json()["id"]
    other = {"upper": vault_id.upper(), "no-hyphens": vault_id.replace("-", ""),
             "braces": f"{{{vault_id}}}", "urn": f"urn:uuid:{vault_id}"}[form]
    headers = {"If-Match": created.headers["etag"]}
    before = stored_docs(user_db(db))
    assert_problem(ready_admin.get(f"/vaults/{other}"), 404, "vault-not-found")
    for operation in ("patch", "delete", "restore"):
        assert_problem(_write(ready_admin, operation, other, headers), 404, "vault-not-found")
    assert stored_docs(user_db(db)) == before


def test_rf_014_contract_declares_vault_id_as_uuid():
    spec = app.openapi()
    for path in ("/vaults/{vault_id}", "/vaults/{vault_id}/restore"):
        for operation in spec["paths"][path].values():
            [parameter] = [p for p in operation["parameters"] if p["name"] == "vault_id"]
            assert parameter["schema"] == {"type": "string", "format": "uuid", "title": "Vault Id"}


def test_rf_017_unreachable_couchdb_is_503(ready_admin):
    app.dependency_overrides[get_vault_port] = lambda: VaultRepository(url="http://127.0.0.1:1")
    try:
        assert_problem(ready_admin.get("/vaults"), 503, "storage-unavailable")
        assert_problem(create(ready_admin), 503, "storage-unavailable")
    finally:
        del app.dependency_overrides[get_vault_port]
