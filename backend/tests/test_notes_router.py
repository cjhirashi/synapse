"""`/vaults/{vault_id}/notes/**` de punta a punta (historia 0014, H-004.1: sólo lectura).

TestClient + CouchDB real, mismo estilo que `test_vaults_api.py`. H-004.1 no expone
`POST`/`PATCH`/`DELETE` de notas (eso es H-004.2): las notas de prueba se escriben directo en
CouchDB, como haría el push de `/sync` que ya las crea en producción.
"""
import uuid

import httpx
import pytest

from app.core.config import settings
from app.main import app
from tests.test_agent_api_key_access import _bearer_client
from tests.test_agent_api_key_api import create_agent_key
from tests.test_vaults_api import assert_problem, create, user_db

AUTH = (settings.COUCHDB_USER, settings.COUCHDB_PASSWORD)


# --- Helpers ---

def _note(vault_id: str, path: str, *, note_id: str | None = None, deleted: bool = False,
          created_at: str = "2026-10-12T10:00:00.000000Z", **fields) -> dict:
    note_id = note_id or str(uuid.uuid4())
    return {
        "_id": f"note:{vault_id}:{note_id}", "type": "note", "vault_id": vault_id, "path": path,
        "content": "", "created_at": created_at, "updated_at": created_at,
        "deleted_at": created_at if deleted else None, **fields,
    }


def put_note(db_name: str, doc: dict) -> dict:
    """Escribe `doc` directo en CouchDB (como el push de `/sync`) y devuelve el documento
    con su `_rev`."""
    res = httpx.put(f"{settings.COUCHDB_URL}/{db_name}/{doc['_id']}", json=doc, auth=AUTH)
    res.raise_for_status()
    return {**doc, "_rev": res.json()["rev"]}


def note_id_of(doc: dict) -> str:
    return doc["_id"].split(":")[2]


# --- C-1: listado ---

def test_c1_list_returns_live_notes_without_content_or_frontmatter(ready_admin, db):
    vault_id = create(ready_admin).json()["id"]
    stored = put_note(user_db(db), _note(vault_id, "Nota.md", frontmatter={"a": 1}, content="x"))
    res = ready_admin.get(f"/vaults/{vault_id}/notes")
    assert res.status_code == 200, res.text
    [item] = res.json()["items"]
    assert item["path"] == "Nota.md" and item["vault_id"] == vault_id
    assert item["etag"] == f'"{stored["_rev"]}"'
    assert set(item) == {"id", "vault_id", "path", "created_at", "updated_at", "deleted_at", "etag"}
    assert res.json()["next_cursor"] is None


def test_c1_list_orders_newest_first_and_paginates(ready_admin, db):
    vault_id = create(ready_admin).json()["id"]
    for i in range(3):
        put_note(user_db(db), _note(vault_id, f"n{i}.md", created_at=f"2026-10-1{i}T00:00:00.000000Z"))
    first = ready_admin.get(f"/vaults/{vault_id}/notes", params={"limit": 2}).json()
    assert [i["path"] for i in first["items"]] == ["n2.md", "n1.md"]
    second = ready_admin.get(
        f"/vaults/{vault_id}/notes", params={"limit": 2, "cursor": first["next_cursor"]}
    ).json()
    assert [i["path"] for i in second["items"]] == ["n0.md"] and second["next_cursor"] is None


def test_c1_deleted_true_lists_only_the_trash(ready_admin, db):
    vault_id = create(ready_admin).json()["id"]
    put_note(user_db(db), _note(vault_id, "Viva.md"))
    put_note(user_db(db), _note(vault_id, "Borrada.md", deleted=True))
    res = ready_admin.get(f"/vaults/{vault_id}/notes", params={"deleted": "true"})
    assert [i["path"] for i in res.json()["items"]] == ["Borrada.md"]


def test_c1_list_never_mixes_notes_of_two_vaults(ready_admin, db):
    vault_a = create(ready_admin, name="A").json()["id"]
    vault_b = create(ready_admin, name="B").json()["id"]
    put_note(user_db(db), _note(vault_a, "DeA.md"))
    put_note(user_db(db), _note(vault_b, "DeB.md"))
    res = ready_admin.get(f"/vaults/{vault_a}/notes")
    assert [i["path"] for i in res.json()["items"]] == ["DeA.md"]


def test_c1_list_of_a_trashed_vault_still_works(ready_admin, db):
    created = create(ready_admin)
    vault_id = created.json()["id"]
    put_note(user_db(db), _note(vault_id, "Nota.md"))
    ready_admin.delete(f"/vaults/{vault_id}", headers={"If-Match": created.headers["etag"]})
    res = ready_admin.get(f"/vaults/{vault_id}/notes")
    assert res.status_code == 200 and [i["path"] for i in res.json()["items"]] == ["Nota.md"]


def test_c1_list_of_a_foreign_or_missing_vault_is_404(ready_admin, db):
    create(ready_admin)
    assert_problem(ready_admin.get(f"/vaults/{uuid.uuid4()}/notes"), 404, "vault-not-found")


# --- C-2 / C-3: `GET .../notes/{note_id}` ---

def test_c2_get_by_id_returns_content_frontmatter_and_etag(ready_admin, db):
    vault_id = create(ready_admin).json()["id"]
    stored = put_note(
        user_db(db), _note(vault_id, "Carpeta/Nota.md", frontmatter={"tags": ["a"]}, content="hola"))
    res = ready_admin.get(f"/vaults/{vault_id}/notes/{note_id_of(stored)}")
    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["path"], body["content"], body["frontmatter"]) == ("Carpeta/Nota.md", "hola", {"tags": ["a"]})
    assert body["vault_id"] == vault_id
    assert res.headers["etag"] == f'"{stored["_rev"]}"'


def test_c2_note_without_frontmatter_reads_as_null(ready_admin, db):
    vault_id = create(ready_admin).json()["id"]
    stored = put_note(user_db(db), _note(vault_id, "Nota.md"))
    assert ready_admin.get(f"/vaults/{vault_id}/notes/{note_id_of(stored)}").json()["frontmatter"] is None


def test_c3_missing_note_is_404(ready_admin, db):
    vault_id = create(ready_admin).json()["id"]
    assert_problem(ready_admin.get(f"/vaults/{vault_id}/notes/{uuid.uuid4()}"), 404, "note-not-found")


def test_c3_note_of_another_vault_is_404(ready_admin, db):
    vault_a = create(ready_admin, name="A").json()["id"]
    vault_b = create(ready_admin, name="B").json()["id"]
    stored = put_note(user_db(db), _note(vault_b, "DeB.md"))
    assert_problem(ready_admin.get(f"/vaults/{vault_a}/notes/{note_id_of(stored)}"), 404, "note-not-found")


def test_c3_deleted_note_is_404_by_plain_get(ready_admin, db):
    vault_id = create(ready_admin).json()["id"]
    stored = put_note(user_db(db), _note(vault_id, "Borrada.md", deleted=True))
    assert_problem(
        ready_admin.get(f"/vaults/{vault_id}/notes/{note_id_of(stored)}"), 404, "note-not-found")


@pytest.mark.parametrize("form", ["upper", "no-hyphens", "braces"])
def test_c3_non_canonical_note_id_is_404(ready_admin, db, form):
    vault_id = create(ready_admin).json()["id"]
    stored = put_note(user_db(db), _note(vault_id, "Nota.md"))
    note_id = note_id_of(stored)
    other = {"upper": note_id.upper(), "no-hyphens": note_id.replace("-", ""),
             "braces": f"{{{note_id}}}"}[form]
    assert_problem(ready_admin.get(f"/vaults/{vault_id}/notes/{other}"), 404, "note-not-found")


def test_get_of_a_nonexistent_vault_is_vault_not_found_not_note_not_found(ready_admin, db):
    assert_problem(ready_admin.get(f"/vaults/{uuid.uuid4()}/notes/{uuid.uuid4()}"), 404, "vault-not-found")


# --- Autenticación: cookie y agent-key resuelven lo mismo (SPEC-0013) ---

def test_bearer_key_reads_the_same_notes_as_the_owner_cookie(ready_admin, db):
    vault_id = create(ready_admin).json()["id"]
    put_note(user_db(db), _note(vault_id, "Nota.md"))
    raw = create_agent_key(ready_admin, "aira").json()["key"]
    agent = _bearer_client(ready_admin, raw)
    cookie_items = ready_admin.get(f"/vaults/{vault_id}/notes").json()["items"]
    key_items = agent.get(f"/vaults/{vault_id}/notes").json()["items"]
    assert cookie_items == key_items and len(key_items) == 1


def test_revoked_key_cannot_read_notes(ready_admin, db):
    vault_id = create(ready_admin).json()["id"]
    put_note(user_db(db), _note(vault_id, "Nota.md"))
    created = create_agent_key(ready_admin, "aira").json()
    agent = _bearer_client(ready_admin, created["key"])
    assert agent.get(f"/vaults/{vault_id}/notes").status_code == 200
    ready_admin.delete(f"/auth/agent-keys/{created['id']}")
    assert_problem(agent.get(f"/vaults/{vault_id}/notes"), 401, "not-authenticated")


# --- 503: almacén inaccesible ---

def test_unreachable_couchdb_is_503(ready_admin):
    from app.adapters.vault_repository import VaultRepository
    from app.routers.vaults import get_vault_port

    vault_id = create(ready_admin).json()["id"]
    app.dependency_overrides[get_vault_port] = lambda: VaultRepository(url="http://127.0.0.1:1")
    try:
        assert_problem(ready_admin.get(f"/vaults/{vault_id}/notes"), 503, "storage-unavailable")
        assert_problem(ready_admin.get(f"/vaults/{vault_id}/notes/{uuid.uuid4()}"), 503, "storage-unavailable")
    finally:
        del app.dependency_overrides[get_vault_port]
