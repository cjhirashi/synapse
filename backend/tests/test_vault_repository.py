"""`VaultRepository` contra CouchDB real (SPEC-0003, PLAN-0003 §3).

Cada test usa una base propia `synapse_user_test_{uuid}` que crea y borra él mismo.
Los 5xx se simulan con un transporte de httpx: CouchDB real no los da a voluntad.
"""
import uuid

import httpx
import pytest

from app.adapters.vault_repository import VaultRepository
from app.core.config import settings
from app.core.errors import RevisionConflict, StorageUnavailable

AUTH = (settings.COUCHDB_USER, settings.COUCHDB_PASSWORD)
UNREACHABLE_URL = "http://127.0.0.1:1"


@pytest.fixture
def db():
    name = f"synapse_user_test_{uuid.uuid4().hex}"
    httpx.put(f"{settings.COUCHDB_URL}/{name}", auth=AUTH).raise_for_status()
    yield name
    httpx.delete(f"{settings.COUCHDB_URL}/{name}", auth=AUTH)


@pytest.fixture
def repo():
    return VaultRepository()


def _vault(created_at: str, *, deleted: bool = False, vault_id: str | None = None) -> dict:
    return {
        "_id": f"vault:{vault_id or uuid.uuid4()}",
        "type": "vault",
        "name": f"n-{uuid.uuid4().hex[:8]}",
        "created_at": created_at,
        "deleted_at": "2026-10-12T00:00:00Z" if deleted else None,
    }


def _ids(docs: list[dict]) -> list[str]:
    return [d["_id"] for d in docs]


# --- T-011: get / put / delete con `_rev` (RF-004, RF-010) ---

def test_rf_004_put_creates_and_returns_the_new_rev(repo, db):
    rev = repo.put(db, {"_id": "vault:a", "type": "vault"})
    stored = repo.get(db, "vault:a")
    assert stored["_rev"] == rev and stored["type"] == "vault"


def test_rf_010_put_with_current_rev_replaces_the_doc(repo, db):
    rev = repo.put(db, {"_id": "vault:a", "name": "old"})
    new_rev = repo.put(db, {"_id": "vault:a", "_rev": rev, "name": "new"})
    stored = repo.get(db, "vault:a")
    assert new_rev != rev and stored["_rev"] == new_rev and stored["name"] == "new"


def test_rf_010_put_with_stale_rev_raises_revision_conflict(repo, db):
    rev = repo.put(db, {"_id": "vault:a", "name": "v1"})
    repo.put(db, {"_id": "vault:a", "_rev": rev, "name": "v2"})
    with pytest.raises(RevisionConflict):
        repo.put(db, {"_id": "vault:a", "_rev": rev, "name": "v3"})
    assert repo.get(db, "vault:a")["name"] == "v2"


def test_rf_004_put_without_rev_over_existing_doc_raises_revision_conflict(repo, db):
    repo.put(db, {"_id": "vault-name:notas", "vault_id": "a"})
    with pytest.raises(RevisionConflict):
        repo.put(db, {"_id": "vault-name:notas", "vault_id": "b"})
    assert repo.get(db, "vault-name:notas")["vault_id"] == "a"


def test_rf_004_get_missing_doc_returns_none(repo, db):
    assert repo.get(db, "vault:missing") is None


def test_rf_010_delete_with_current_rev_removes_the_doc(repo, db):
    rev = repo.put(db, {"_id": "vault-name:notas", "vault_id": "a"})
    repo.delete(db, "vault-name:notas", rev)
    assert repo.get(db, "vault-name:notas") is None


def test_rf_010_delete_with_stale_rev_raises_revision_conflict(repo, db):
    rev = repo.put(db, {"_id": "vault-name:notas", "vault_id": "a"})
    repo.put(db, {"_id": "vault-name:notas", "_rev": rev, "vault_id": "b"})
    with pytest.raises(RevisionConflict):
        repo.delete(db, "vault-name:notas", rev)


def test_rf_010_delete_of_missing_doc_raises_revision_conflict(repo, db):
    rev = repo.put(db, {"_id": "vault-name:notas", "vault_id": "a"})
    repo.delete(db, "vault-name:notas", rev)
    with pytest.raises(RevisionConflict):
        repo.delete(db, "vault-name:notas", rev)


# --- T-012: list_page (RF-001, RF-002, RF-012, RF-024) ---

def test_rf_001_list_page_returns_only_vaults_of_the_requested_list(repo, db):
    live = _vault("2026-10-01T00:00:00Z")
    trashed = _vault("2026-10-02T00:00:00Z", deleted=True)
    for doc in (live, trashed, {"_id": "vault-name:x", "type": "vault-name", "vault_id": "x"}):
        repo.put(db, doc)
    assert _ids(repo.list_page(db, deleted=False, limit=10, after=None)) == [live["_id"]]
    assert _ids(repo.list_page(db, deleted=True, limit=10, after=None)) == [trashed["_id"]]


def test_rf_001_list_page_returns_full_docs(repo, db):
    doc = _vault("2026-10-01T00:00:00Z")
    repo.put(db, doc)
    [listed] = repo.list_page(db, deleted=False, limit=10, after=None)
    assert listed["name"] == doc["name"] and "_rev" in listed


def test_rf_024_order_is_created_at_desc_then_id_desc(repo, db):
    tie_a = _vault("2026-10-02T00:00:00Z", vault_id="aaaa")
    tie_b = _vault("2026-10-02T00:00:00Z", vault_id="bbbb")
    newest = _vault("2026-10-03T00:00:00Z")
    oldest = _vault("2026-10-01T00:00:00Z")
    for doc in (tie_a, oldest, newest, tie_b):
        repo.put(db, doc)
    listed = repo.list_page(db, deleted=False, limit=10, after=None)
    assert _ids(listed) == [newest["_id"], tie_b["_id"], tie_a["_id"], oldest["_id"]]


def test_rf_002_limit_caps_the_page(repo, db):
    for day in range(1, 6):
        repo.put(db, _vault(f"2026-10-0{day}T00:00:00Z"))
    assert len(repo.list_page(db, deleted=False, limit=3, after=None)) == 3


def _walk(repo, db, limit: int) -> list[str]:
    """Recorre la lista completa página a página, como haría el servicio con el cursor."""
    seen, after = [], None
    while page := repo.list_page(db, deleted=False, limit=limit, after=after):
        seen += _ids(page)
        after = (page[-1]["created_at"], page[-1]["_id"])
    return seen


def test_rf_002_pages_cover_everything_once_with_created_at_ties(repo, db):
    docs = [_vault(f"2026-10-0{1 + i // 3}T00:00:00Z") for i in range(9)]  # tríos empatados
    for doc in docs:
        repo.put(db, doc)
    full = _ids(repo.list_page(db, deleted=False, limit=100, after=None))
    for limit in (1, 2, 4):
        assert _walk(repo, db, limit) == full


def test_rf_012_insertions_between_pages_cause_no_repeats_or_gaps(repo, db):
    docs = [_vault(f"2026-10-0{day}T00:00:00Z") for day in range(1, 7)]
    for doc in docs:
        repo.put(db, doc)
    first = repo.list_page(db, deleted=False, limit=3, after=None)
    # Una bóveda nueva (más reciente que todo) aparece entre la página 1 y la 2.
    repo.put(db, _vault("2026-10-09T00:00:00Z"))
    after = (first[-1]["created_at"], first[-1]["_id"])
    second = repo.list_page(db, deleted=False, limit=3, after=after)
    assert _ids(first) + _ids(second) == _ids(reversed(docs))  # docs va del día 1 al 6


def test_rf_012_after_key_still_works_when_that_vault_left_the_list(repo, db):
    docs = [_vault(f"2026-10-0{day}T00:00:00Z") for day in range(1, 5)]
    revs = {doc["_id"]: repo.put(db, doc) for doc in docs}
    first = repo.list_page(db, deleted=False, limit=2, after=None)
    # La última bóveda vista se manda a la papelera antes de pedir la página 2.
    last = first[-1]
    repo.put(db, {**last, "_rev": revs[last["_id"]], "deleted_at": "2026-10-12T00:00:00Z"})
    second = repo.list_page(db, deleted=False, limit=2, after=(last["created_at"], last["_id"]))
    assert _ids(second) == [docs[1]["_id"], docs[0]["_id"]]


def test_rf_001_design_doc_is_created_idempotently(repo, db):
    repo.put(db, _vault("2026-10-01T00:00:00Z"))
    repo.list_page(db, deleted=False, limit=10, after=None)
    # Otra instancia (otro proceso) no tiene la memoria: el PUT ya existente no debe fallar.
    assert len(VaultRepository().list_page(db, deleted=False, limit=10, after=None)) == 1
    design = httpx.get(f"{settings.COUCHDB_URL}/{db}/_design/vaults", auth=AUTH).json()
    assert "by_created" in design["views"]


def test_rnf_001_design_doc_is_written_once_per_db_and_process():
    # PLAN-0003 §15 (VA-8): el `PUT _design/vaults` no se repite en cada listado (RNF-001).
    # Un transporte que registra las peticiones; las respuestas imitan a CouchDB.
    requests: list[tuple[str, str]] = []

    def couchdb(request: httpx.Request) -> httpx.Response:
        requests.append((request.method, request.url.path))
        if request.method == "PUT":
            return httpx.Response(201, json={"ok": True})
        return httpx.Response(200, json={"rows": []})

    repo = VaultRepository(transport=httpx.MockTransport(couchdb))
    for db in ("synapse_user_a", "synapse_user_a", "synapse_user_b", "synapse_user_a"):
        repo.list_page(db, deleted=False, limit=10, after=None)
    design_puts = [path for method, path in requests if method == "PUT"]
    assert design_puts == ["/synapse_user_a/_design/vaults", "/synapse_user_b/_design/vaults"]
    assert sum(method == "GET" for method, _ in requests) == 4


# --- SPEC-0005 T-014: hojas vivas de un documento, también en conflicto (RF-008) ---

def _replicate(db: str, docs: list[dict]) -> None:
    """Escribe revisiones con historia explícita (`new_edits: false`), como el replicador."""
    response = httpx.post(
        f"{settings.COUCHDB_URL}/{db}/_bulk_docs", json={"docs": docs, "new_edits": False}, auth=AUTH
    )
    response.raise_for_status()
    assert response.json() == []


def _revision(doc_id: str, rev: str, parents: list[str] = (), **fields) -> dict:
    start, rev_hash = rev.split("-")
    return {
        "_id": doc_id, "_rev": rev, **fields,
        "_revisions": {"start": int(start), "ids": [rev_hash, *(p.split("-")[1] for p in parents)]},
    }


def test_rf_008_leaves_of_a_doc_without_conflict_is_the_current_revision(repo, db):
    doc = _vault("2026-10-01T00:00:00Z")
    rev = repo.put(db, doc)
    leaves = repo.leaves(db, doc["_id"])
    assert [leaf["_rev"] for leaf in leaves] == [rev]
    assert leaves[0]["name"] == doc["name"] and leaves[0]["_revisions"]["start"] == 1


def test_rf_008_leaves_returns_every_live_branch_and_skips_tombstones(repo, db):
    doc_id = f"vault:{uuid.uuid4()}"
    _replicate(db, [
        _revision(doc_id, "1-aaa", type="vault", name="base"),
        _revision(doc_id, "2-bbb", ["1-aaa"], type="vault", name="rama b"),
        _revision(doc_id, "2-ccc", ["1-aaa"], _deleted=True),
        _revision(doc_id, "2-ddd", ["1-aaa"], type="vault", name="rama d"),
    ])
    leaves = repo.leaves(db, doc_id)
    assert sorted((leaf["_rev"], leaf["name"]) for leaf in leaves) == [("2-bbb", "rama b"), ("2-ddd", "rama d")]
    assert all(leaf["_revisions"]["ids"][-1] == "aaa" for leaf in leaves)


def test_rf_008_leaves_of_a_missing_or_deleted_doc_is_empty(repo, db):
    assert repo.leaves(db, f"vault:{uuid.uuid4()}") == []
    doc = _vault("2026-10-01T00:00:00Z")
    repo.delete(db, doc["_id"], repo.put(db, doc))
    assert repo.leaves(db, doc["_id"]) == []


# --- Historia 0014 (H-004.1): list_notes, clon de list_page con `vault_id` como dimensión extra ---

def _note(created_at: str, *, vault_id: str = "vault-a", deleted: bool = False,
         note_id: str | None = None) -> dict:
    return {
        "_id": f"note:{vault_id}:{note_id or uuid.uuid4()}",
        "type": "note",
        "vault_id": vault_id,
        "path": f"p-{uuid.uuid4().hex[:8]}.md",
        "content": "",
        "created_at": created_at,
        "deleted_at": "2026-10-12T00:00:00Z" if deleted else None,
    }


def test_rf_004_list_notes_returns_only_the_requested_vault_and_list(repo, db):
    live = _note("2026-10-01T00:00:00Z")
    trashed = _note("2026-10-02T00:00:00Z", deleted=True)
    other_vault = _note("2026-10-03T00:00:00Z", vault_id="vault-b")
    for doc in (live, trashed, other_vault):
        repo.put(db, doc)
    assert _ids(repo.list_notes(db, "vault-a", deleted=False, limit=10, after=None)) == [live["_id"]]
    assert _ids(repo.list_notes(db, "vault-a", deleted=True, limit=10, after=None)) == [trashed["_id"]]
    assert _ids(repo.list_notes(db, "vault-b", deleted=False, limit=10, after=None)) == [other_vault["_id"]]


def test_rf_004_list_notes_returns_full_docs(repo, db):
    doc = _note("2026-10-01T00:00:00Z")
    repo.put(db, doc)
    [listed] = repo.list_notes(db, "vault-a", deleted=False, limit=10, after=None)
    assert listed["path"] == doc["path"] and "_rev" in listed


def test_rf_004_list_notes_order_is_created_at_desc_then_id_desc(repo, db):
    tie_a = _note("2026-10-02T00:00:00Z", note_id="aaaa")
    tie_b = _note("2026-10-02T00:00:00Z", note_id="bbbb")
    newest = _note("2026-10-03T00:00:00Z")
    oldest = _note("2026-10-01T00:00:00Z")
    for doc in (tie_a, oldest, newest, tie_b):
        repo.put(db, doc)
    listed = repo.list_notes(db, "vault-a", deleted=False, limit=10, after=None)
    assert _ids(listed) == [newest["_id"], tie_b["_id"], tie_a["_id"], oldest["_id"]]


def test_rf_004_list_notes_limit_caps_the_page(repo, db):
    for day in range(1, 6):
        repo.put(db, _note(f"2026-10-0{day}T00:00:00Z"))
    assert len(repo.list_notes(db, "vault-a", deleted=False, limit=3, after=None)) == 3


def _walk_notes(repo, db, vault_id, limit):
    seen, after = [], None
    while page := repo.list_notes(db, vault_id, deleted=False, limit=limit, after=after):
        seen += _ids(page)
        after = (page[-1]["created_at"], page[-1]["_id"])
    return seen


def test_rf_004_list_notes_pages_cover_everything_once_with_ties(repo, db):
    docs = [_note(f"2026-10-0{1 + i // 3}T00:00:00Z") for i in range(9)]  # tríos empatados
    for doc in docs:
        repo.put(db, doc)
    full = _ids(repo.list_notes(db, "vault-a", deleted=False, limit=100, after=None))
    for limit in (1, 2, 4):
        assert _walk_notes(repo, db, "vault-a", limit) == full


def test_rf_004_list_notes_design_doc_is_created_idempotently(repo, db):
    repo.put(db, _note("2026-10-01T00:00:00Z"))
    repo.list_notes(db, "vault-a", deleted=False, limit=10, after=None)
    # Otra instancia (otro proceso) no tiene la memoria: el PUT ya existente no debe fallar.
    assert len(VaultRepository().list_notes(db, "vault-a", deleted=False, limit=10, after=None)) == 1
    design = httpx.get(f"{settings.COUCHDB_URL}/{db}/_design/notes", auth=AUTH).json()
    assert "by_created" in design["views"]


# --- T-013: almacén inaccesible o 5xx → StorageUnavailable (RF-017) ---

_CALLS = {
    "get": lambda r: r.get("synapse_user_x", "vault:a"),
    "leaves": lambda r: r.leaves("synapse_user_x", "vault:a"),
    "put": lambda r: r.put("synapse_user_x", {"_id": "vault:a"}),
    "delete": lambda r: r.delete("synapse_user_x", "vault:a", "1-a"),
    "list_page": lambda r: r.list_page("synapse_user_x", deleted=False, limit=10, after=None),
    "list_notes": lambda r: r.list_notes("synapse_user_x", "vault-a", deleted=False, limit=10, after=None),
}


@pytest.mark.parametrize("call", _CALLS.values(), ids=_CALLS.keys())
def test_rf_017_unreachable_couchdb_raises_storage_unavailable(call):
    with pytest.raises(StorageUnavailable):
        call(VaultRepository(url=UNREACHABLE_URL))


@pytest.mark.parametrize("call", _CALLS.values(), ids=_CALLS.keys())
def test_rf_017_server_error_raises_storage_unavailable(call):
    failing = httpx.MockTransport(lambda request: httpx.Response(500, json={"error": "boom"}))
    with pytest.raises(StorageUnavailable):
        call(VaultRepository(transport=failing))
