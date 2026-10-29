"""`/vaults/{vault_id}/notes/**` de punta a punta (historia 0014: H-004.1 lectura, H-004.2
escritura).

TestClient + CouchDB real, mismo estilo que `test_vaults_api.py`. H-004.2 añade
`POST`/`PATCH`/`DELETE`/`restore`: las pruebas de lectura siguen escribiendo notas directo en
CouchDB (como haría el push de `/sync`); las de escritura usan los endpoints nuevos.
"""
import uuid

import httpx
import pytest

from app.core.config import settings
from app.main import app
from tests.test_agent_api_key_access import _bearer_client
from tests.test_agent_api_key_api import create_agent_key
from tests.test_vaults_api import assert_problem, create, stored_docs, user_db

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


# --- C-4: `POST` crea la nota ---

def create_note(client, vault_id: str, path: str = "Nota.md", **fields):
    return client.post(f"/vaults/{vault_id}/notes", json={"path": path, "content": "", **fields})


def test_c4_post_creates_the_note_in_the_callers_database(ready_admin, db):
    vault_id = create(ready_admin).json()["id"]
    res = create_note(ready_admin, vault_id, "Carpeta/Nota.md", content="hola", frontmatter={"a": 1})
    assert res.status_code == 201, res.text
    body = res.json()
    assert uuid.UUID(body["id"]).version == 4
    assert (body["path"], body["content"], body["frontmatter"]) == ("Carpeta/Nota.md", "hola", {"a": 1})
    assert body["vault_id"] == vault_id
    assert body["deleted_at"] is None and body["created_at"] == body["updated_at"]
    stored = stored_docs(user_db(db))[f"note:{vault_id}:{body['id']}"]
    assert res.headers["etag"] == f'"{stored["_rev"]}"' and stored["type"] == "note"


def test_c4_post_with_a_missing_frontmatter_stores_null(ready_admin, db):
    vault_id = create(ready_admin).json()["id"]
    res = create_note(ready_admin, vault_id, "Nota.md")
    assert res.json()["frontmatter"] is None


def test_c4_post_of_a_missing_vault_is_404(ready_admin):
    assert_problem(create_note(ready_admin, str(uuid.uuid4())), 404, "vault-not-found")


def test_c4_post_of_a_trashed_vault_is_404(ready_admin):
    """A diferencia de la lectura (C-1), escribir exige la bóveda activa (C-10)."""
    created = create(ready_admin)
    vault_id = created.json()["id"]
    ready_admin.delete(f"/vaults/{vault_id}", headers={"If-Match": created.headers["etag"]})
    assert_problem(create_note(ready_admin, vault_id), 404, "vault-not-found")


# --- C-5: rechazo idéntico al que usa el push (`core/note_rules.py`) ---

def test_c5_invalid_path_is_422_with_the_pointer(ready_admin, db):
    vault_id = create(ready_admin).json()["id"]
    before = stored_docs(user_db(db))
    res = create_note(ready_admin, vault_id, "")
    body = assert_problem(res, 422, "validation-error")
    assert body["errors"] == [{"pointer": "#/path", "detail": "validation-error:path"}]
    assert stored_docs(user_db(db)) == before


def test_c5_unnormalized_path_is_422(ready_admin):
    vault_id = create(ready_admin).json()["id"]
    res = create_note(ready_admin, vault_id, " Nota.md")
    body = assert_problem(res, 422, "validation-error")
    assert body["errors"] == [{"pointer": "#/path", "detail": "not-normalized:path"}]


def test_c5_invalid_body_type_is_422(ready_admin):
    vault_id = create(ready_admin).json()["id"]
    res = ready_admin.post(f"/vaults/{vault_id}/notes", json={"path": "Nota.md", "content": 1})
    assert_problem(res, 422, "validation-error")


# --- C-6: `path` ya reservado por otra nota viva de la bóveda ---

def test_c6_path_taken_by_another_live_note_is_409(ready_admin, db):
    vault_id = create(ready_admin).json()["id"]
    create_note(ready_admin, vault_id, "Nota.md")
    before = stored_docs(user_db(db))
    assert_problem(create_note(ready_admin, vault_id, "Nota.md"), 409, "note-path-taken")
    assert stored_docs(user_db(db)).keys() == before.keys()


def test_c6_path_freed_by_delete_can_be_reused(ready_admin):
    vault_id = create(ready_admin).json()["id"]
    created = create_note(ready_admin, vault_id, "Nota.md")
    ready_admin.delete(f"/vaults/{vault_id}/notes/{created.json()['id']}",
                       headers={"If-Match": created.headers["etag"]})
    assert create_note(ready_admin, vault_id, "Nota.md").status_code == 201


# --- C-7/C-8: `PATCH` con `If-Match` ---

def test_c7_patch_without_if_match_is_428(ready_admin, db):
    vault_id = create(ready_admin).json()["id"]
    created = create_note(ready_admin, vault_id, "Nota.md")
    before = stored_docs(user_db(db))
    res = ready_admin.patch(f"/vaults/{vault_id}/notes/{created.json()['id']}", json={"content": "b"})
    assert_problem(res, 428, "precondition-required")
    assert stored_docs(user_db(db)) == before


def test_c8_patch_with_a_stale_if_match_is_412(ready_admin):
    vault_id = create(ready_admin).json()["id"]
    created = create_note(ready_admin, vault_id, "Nota.md")
    res = ready_admin.patch(f"/vaults/{vault_id}/notes/{created.json()['id']}",
                            json={"content": "b"}, headers={"If-Match": '"1-stale"'})
    assert_problem(res, 412, "precondition-failed")


def test_c8_patch_updates_only_sent_fields_with_a_new_etag(ready_admin):
    vault_id = create(ready_admin).json()["id"]
    created = create_note(ready_admin, vault_id, "Nota.md", content="a", frontmatter={"x": 1})
    note_id = created.json()["id"]
    res = ready_admin.patch(f"/vaults/{vault_id}/notes/{note_id}", json={"content": "b"},
                            headers={"If-Match": created.headers["etag"]})
    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["content"], body["path"], body["frontmatter"]) == ("b", "Nota.md", {"x": 1})
    assert res.headers["etag"] != created.headers["etag"]
    get_res = ready_admin.get(f"/vaults/{vault_id}/notes/{note_id}")
    assert get_res.headers["etag"] == res.headers["etag"]


def test_c8_patch_that_changes_path_releases_the_old_reservation(ready_admin):
    vault_id = create(ready_admin).json()["id"]
    created = create_note(ready_admin, vault_id, "Vieja.md")
    res = ready_admin.patch(f"/vaults/{vault_id}/notes/{created.json()['id']}",
                            json={"path": "Nueva.md"}, headers={"If-Match": created.headers["etag"]})
    assert res.status_code == 200 and res.json()["path"] == "Nueva.md"
    assert create_note(ready_admin, vault_id, "Vieja.md").status_code == 201


def test_c8_patch_to_a_path_taken_by_another_live_note_is_409(ready_admin):
    vault_id = create(ready_admin).json()["id"]
    create_note(ready_admin, vault_id, "A.md")
    b = create_note(ready_admin, vault_id, "B.md")
    res = ready_admin.patch(f"/vaults/{vault_id}/notes/{b.json()['id']}", json={"path": "A.md"},
                            headers={"If-Match": b.headers["etag"]})
    assert_problem(res, 409, "note-path-taken")


def test_patch_of_a_missing_note_is_404(ready_admin):
    vault_id = create(ready_admin).json()["id"]
    res = ready_admin.patch(f"/vaults/{vault_id}/notes/{uuid.uuid4()}", json={"content": "b"},
                            headers={"If-Match": '"1-x"'})
    assert_problem(res, 404, "note-not-found")


# --- C-9: `DELETE` ---

def test_c9_delete_soft_deletes_and_keeps_the_document(ready_admin, db):
    vault_id = create(ready_admin).json()["id"]
    created = create_note(ready_admin, vault_id, "Nota.md")
    note_id = created.json()["id"]
    res = ready_admin.delete(f"/vaults/{vault_id}/notes/{note_id}",
                             headers={"If-Match": created.headers["etag"]})
    assert res.status_code == 204
    stored = stored_docs(user_db(db))[f"note:{vault_id}:{note_id}"]
    assert stored["deleted_at"] is not None and stored["path"] == "Nota.md"
    assert_problem(ready_admin.get(f"/vaults/{vault_id}/notes/{note_id}"), 404, "note-not-found")
    # La ruta queda libre.
    assert create_note(ready_admin, vault_id, "Nota.md").status_code == 201


def test_c9_delete_without_if_match_is_428(ready_admin):
    vault_id = create(ready_admin).json()["id"]
    created = create_note(ready_admin, vault_id, "Nota.md")
    res = ready_admin.delete(f"/vaults/{vault_id}/notes/{created.json()['id']}")
    assert_problem(res, 428, "precondition-required")


def test_delete_with_a_stale_if_match_is_412(ready_admin):
    vault_id = create(ready_admin).json()["id"]
    created = create_note(ready_admin, vault_id, "Nota.md")
    res = ready_admin.delete(f"/vaults/{vault_id}/notes/{created.json()['id']}",
                             headers={"If-Match": '"1-stale"'})
    assert_problem(res, 412, "precondition-failed")


def test_delete_of_a_missing_note_is_404(ready_admin):
    vault_id = create(ready_admin).json()["id"]
    res = ready_admin.delete(f"/vaults/{vault_id}/notes/{uuid.uuid4()}",
                             headers={"If-Match": '"1-x"'})
    assert_problem(res, 404, "note-not-found")


# --- restore ---

def etag_in_trash(client, vault_id: str, note_id: str) -> str:
    """El `ETag` de una nota borrada, sacado del listado de la Papelera (`GET /notes` del
    `restore`): `GET /notes/{id}` de una borrada es 404 (mismo patrón que bóvedas)."""
    items = client.get(f"/vaults/{vault_id}/notes", params={"deleted": "true", "limit": 200}).json()["items"]
    return next(item["etag"] for item in items if item["id"] == note_id)


def test_restore_brings_the_note_back(ready_admin):
    vault_id = create(ready_admin).json()["id"]
    created = create_note(ready_admin, vault_id, "Nota.md")
    note_id = created.json()["id"]
    ready_admin.delete(f"/vaults/{vault_id}/notes/{note_id}", headers={"If-Match": created.headers["etag"]})
    res = ready_admin.post(f"/vaults/{vault_id}/notes/{note_id}/restore",
                           headers={"If-Match": etag_in_trash(ready_admin, vault_id, note_id)})
    assert res.status_code == 200, res.text
    assert res.json()["deleted_at"] is None and res.json()["path"] == "Nota.md"
    assert ready_admin.get(f"/vaults/{vault_id}/notes/{note_id}").status_code == 200


def test_restore_without_if_match_is_428(ready_admin):
    vault_id = create(ready_admin).json()["id"]
    created = create_note(ready_admin, vault_id, "Nota.md")
    note_id = created.json()["id"]
    ready_admin.delete(f"/vaults/{vault_id}/notes/{note_id}", headers={"If-Match": created.headers["etag"]})
    res = ready_admin.post(f"/vaults/{vault_id}/notes/{note_id}/restore")
    assert_problem(res, 428, "precondition-required")


def test_restore_of_an_active_note_is_404(ready_admin):
    vault_id = create(ready_admin).json()["id"]
    created = create_note(ready_admin, vault_id, "Nota.md")
    res = ready_admin.post(f"/vaults/{vault_id}/notes/{created.json()['id']}/restore",
                           headers={"If-Match": created.headers["etag"]})
    assert_problem(res, 404, "note-not-found")


def test_restore_with_a_taken_path_is_409_and_stays_deleted(ready_admin, db):
    vault_id = create(ready_admin).json()["id"]
    created = create_note(ready_admin, vault_id, "Nota.md")
    note_id = created.json()["id"]
    ready_admin.delete(f"/vaults/{vault_id}/notes/{note_id}", headers={"If-Match": created.headers["etag"]})
    taken_etag = etag_in_trash(ready_admin, vault_id, note_id)
    create_note(ready_admin, vault_id, "Nota.md")
    res = ready_admin.post(f"/vaults/{vault_id}/notes/{note_id}/restore", headers={"If-Match": taken_etag})
    assert_problem(res, 409, "note-path-taken")
    assert stored_docs(user_db(db))[f"note:{vault_id}:{note_id}"]["deleted_at"]


# --- Autenticación: cookie y agent-key resuelven lo mismo (SPEC-0013) ---

def test_bearer_key_can_write_notes_the_same_way_as_the_owner_cookie(ready_admin):
    vault_id = create(ready_admin).json()["id"]
    raw = create_agent_key(ready_admin, "aira").json()["key"]
    agent = _bearer_client(ready_admin, raw)
    created = create_note(agent, vault_id, "Nota.md")
    assert created.status_code == 201, created.text
    res = agent.patch(f"/vaults/{vault_id}/notes/{created.json()['id']}", json={"content": "b"},
                      headers={"If-Match": created.headers["etag"]})
    assert res.status_code == 200
    del_res = agent.delete(f"/vaults/{vault_id}/notes/{created.json()['id']}",
                           headers={"If-Match": res.headers["etag"]})
    assert del_res.status_code == 204


def test_revoked_key_cannot_write_notes(ready_admin):
    vault_id = create(ready_admin).json()["id"]
    created_key = create_agent_key(ready_admin, "aira").json()
    agent = _bearer_client(ready_admin, created_key["key"])
    ready_admin.delete(f"/auth/agent-keys/{created_key['id']}")
    assert_problem(create_note(agent, vault_id, "Nota.md"), 401, "not-authenticated")


# --- 503: almacén inaccesible ---

def test_write_endpoints_are_503_when_couchdb_is_unreachable(ready_admin):
    from app.adapters.vault_repository import VaultRepository
    from app.routers.vaults import get_vault_port

    vault_id = create(ready_admin).json()["id"]
    created = create_note(ready_admin, vault_id, "Nota.md")
    app.dependency_overrides[get_vault_port] = lambda: VaultRepository(url="http://127.0.0.1:1")
    try:
        assert_problem(create_note(ready_admin, vault_id, "Otra.md"), 503, "storage-unavailable")
        res = ready_admin.patch(f"/vaults/{vault_id}/notes/{created.json()['id']}",
                                json={"content": "b"}, headers={"If-Match": created.headers["etag"]})
        assert_problem(res, 503, "storage-unavailable")
        res = ready_admin.delete(f"/vaults/{vault_id}/notes/{created.json()['id']}",
                                 headers={"If-Match": created.headers["etag"]})
        assert_problem(res, 503, "storage-unavailable")
    finally:
        del app.dependency_overrides[get_vault_port]
