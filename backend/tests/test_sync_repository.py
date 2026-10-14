"""`ReplicationRepository` contra CouchDB real (SPEC-0005, PLAN-0005 §2.2).

Cada test usa una base propia `synapse_user_test_{uuid}` que crea y borra él mismo. Los 5xx
y los cortes a mitad de flujo se simulan con un transporte de httpx: CouchDB real no los da
a voluntad.
"""
import asyncio
import json
import uuid

import httpx
import pytest

from app.adapters.replication_repository import ReplicationRepository
from app.core.config import settings
from app.core.errors import StorageUnavailable
from app.services import sync_filter as sf

pytestmark = pytest.mark.asyncio

AUTH = (settings.COUCHDB_USER, settings.COUCHDB_PASSWORD)
UNREACHABLE_URL = "http://127.0.0.1:1"
VAULT_A = "vault:6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f"
VAULT_B = "vault:00000000-0000-4000-8000-000000000001"


@pytest.fixture
def db():
    name = f"synapse_user_test_{uuid.uuid4().hex}"
    httpx.put(f"{settings.COUCHDB_URL}/{name}", auth=AUTH).raise_for_status()
    yield name
    httpx.delete(f"{settings.COUCHDB_URL}/{name}", auth=AUTH)


@pytest.fixture
def repo():
    return ReplicationRepository()


def _put(db: str, doc: dict) -> str:
    response = httpx.put(f"{settings.COUCHDB_URL}/{db}/{doc['_id']}", json=doc, auth=AUTH)
    response.raise_for_status()
    return response.json()["rev"]


def _revision(doc_id: str, rev: str, parents: list[str] = (), **fields) -> dict:
    """Revisión con historia explícita, como las que envía el replicador."""
    start, rev_hash = rev.split("-")
    return {
        "_id": doc_id, "_rev": rev, "type": "vault", **fields,
        "_revisions": {"start": int(start), "ids": [rev_hash, *(p.split("-")[1] for p in parents)]},
    }


async def _read_all(stream) -> bytes:
    return b"".join([chunk async for chunk in stream])


# --- T-010: info, revs_diff, bulk_get, all_docs, _local (RF-004, RF-010) ---

async def test_rf_004_db_info_returns_couchdb_info(repo, db):
    info = await repo.db_info(db)
    assert info["db_name"] == db and "update_seq" in info and "instance_start_time" in info


async def test_rf_010_revs_diff_reports_missing_revisions(repo, db):
    rev = _put(db, {"_id": VAULT_A, "type": "vault"})
    diff = await repo.revs_diff(db, {VAULT_A: [rev, "2-abc"], VAULT_B: ["1-def"]})
    # `possible_ancestors` (la hoja almacenada) es parte del protocolo y viaja tal cual.
    assert diff == {
        VAULT_A: {"missing": ["2-abc"], "possible_ancestors": [rev]},
        VAULT_B: {"missing": ["1-def"]},
    }


async def test_rf_010_bulk_get_returns_revisions_with_history(repo, db):
    rev = _put(db, {"_id": VAULT_A, "type": "vault", "name": "a"})
    result = await repo.bulk_get(db, {"revs": "true"}, {"docs": [{"id": VAULT_A, "rev": rev}]})
    doc = result["results"][0]["docs"][0]["ok"]
    assert doc["_rev"] == rev and doc["name"] == "a" and "_revisions" in doc


async def test_rf_004_all_docs_with_the_vault_range_skips_internal_docs(repo, db):
    _put(db, {"_id": VAULT_A, "type": "vault"})
    _put(db, {"_id": "vault-name:a", "vault_id": "x"})
    query, body = sf.all_docs_query({}, None)
    result = await repo.all_docs(db, query, body)
    assert [row["id"] for row in result["rows"]] == [VAULT_A]


async def test_rf_004_all_docs_with_keys_uses_post(repo, db):
    _put(db, {"_id": VAULT_A, "type": "vault"})
    result = await repo.all_docs(db, {"include_docs": "true"}, {"keys": [VAULT_A, VAULT_B]})
    assert result["rows"][0]["doc"]["_id"] == VAULT_A
    assert result["rows"][1] == {"key": VAULT_B, "error": "not_found"}


async def test_rf_010_local_documents_round_trip(repo, db):
    assert await repo.get_local(db, "checkpoint-1") is None
    saved = await repo.put_local(db, "checkpoint-1", {"last_seq": "5-x"})
    stored = await repo.get_local(db, "checkpoint-1")
    assert stored["last_seq"] == "5-x" and stored["_rev"] == saved["rev"]
    again = await repo.put_local(db, "checkpoint-1", {"_rev": saved["rev"], "last_seq": "9-y"})
    assert (await repo.get_local(db, "checkpoint-1"))["_rev"] == again["rev"]


@pytest.mark.parametrize("local_id", ["..", ".", "a.b", ".x"])
async def test_rf_004_local_ids_with_dots_never_leave_the_local_namespace(repo, db, local_id):
    """Segunda barrera de VC-1 (enmienda 1): un id con puntos nunca se vuelve un segmento
    `.`/`..` que `httpx` normalizaría hacia la raíz de la base; siempre es un `_local`."""
    await repo.put_local(db, local_id, {"last_seq": "1"})
    stored = await repo.get_local(db, local_id)
    assert stored["_id"] == f"_local/{local_id}"
    assert stored["last_seq"] == "1"


async def test_rf_010_local_put_with_stale_rev_keeps_the_last_write(repo, db):
    """CouchDB no valida el `_rev` de un `_local`: el puerto refleja eso, no lo inventa."""
    saved = await repo.put_local(db, "checkpoint-1", {"last_seq": "1"})
    await repo.put_local(db, "checkpoint-1", {"_rev": saved["rev"], "last_seq": "2"})
    await repo.put_local(db, "checkpoint-1", {"_rev": saved["rev"], "last_seq": "3"})
    assert (await repo.get_local(db, "checkpoint-1"))["last_seq"] == "3"


# --- T-011: escritura replicada y `_changes` en streaming (RF-004, RF-012) ---

async def test_rf_012_bulk_docs_replicated_creates_conflicting_branches_without_409(repo, db):
    errors = await repo.bulk_docs_replicated(db, [
        _revision(VAULT_A, "1-aaa", name="base"),
        _revision(VAULT_A, "2-bbb", ["1-aaa"], name="rama b"),
        _revision(VAULT_A, "2-ccc", ["1-aaa"], name="rama c"),
    ])
    assert errors == []
    response = httpx.get(f"{settings.COUCHDB_URL}/{db}/{VAULT_A}", params={"conflicts": "true"}, auth=AUTH)
    doc = response.json()
    assert {doc["_rev"], *doc["_conflicts"]} == {"2-bbb", "2-ccc"}


async def test_rf_004_changes_streams_only_vault_documents(repo, db):
    _put(db, {"_id": VAULT_A, "type": "vault"})
    _put(db, {"_id": "vault-name:a", "vault_id": "x"})
    query, body = sf.changes_query({})
    data = json.loads(await _read_all(await repo.changes(db, query, body)))
    assert [change["id"] for change in data["results"]] == [VAULT_A]


async def test_rf_004_longpoll_changes_ends_when_a_change_arrives(repo, db):
    info = await repo.db_info(db)
    query, body = sf.changes_query({"feed": "longpoll", "since": info["update_seq"], "timeout": "30000"})
    stream = await repo.changes(db, query, body)

    async def write_later():
        await asyncio.sleep(0.3)
        await asyncio.to_thread(_put, db, {"_id": VAULT_B, "type": "vault"})

    writer = asyncio.create_task(write_later())
    data = json.loads(await asyncio.wait_for(_read_all(stream), timeout=15))
    await writer
    assert [change["id"] for change in data["results"]] == [VAULT_B]


# --- T-012: almacén caído o 5xx → StorageUnavailable (RF-019) ---

def _failing(status: int) -> httpx.MockTransport:
    return httpx.MockTransport(lambda request: httpx.Response(status, json={"error": "x"}))


OPERATIONS = {
    "db_info": lambda r, db: r.db_info(db),
    "revs_diff": lambda r, db: r.revs_diff(db, {VAULT_A: ["1-a"]}),
    "bulk_get": lambda r, db: r.bulk_get(db, {}, {"docs": [{"id": VAULT_A}]}),
    "all_docs": lambda r, db: r.all_docs(db, {}, None),
    "bulk_docs_replicated": lambda r, db: r.bulk_docs_replicated(db, [_revision(VAULT_A, "1-a")]),
    "get_local": lambda r, db: r.get_local(db, "c"),
    "put_local": lambda r, db: r.put_local(db, "c", {}),
    "changes": lambda r, db: r.changes(db, *sf.changes_query({})),
}


@pytest.mark.parametrize("operation", sorted(OPERATIONS))
async def test_rf_019_unreachable_couchdb_raises_storage_unavailable(operation):
    repo = ReplicationRepository(url=UNREACHABLE_URL)
    with pytest.raises(StorageUnavailable):
        await OPERATIONS[operation](repo, "synapse_user_x")


@pytest.mark.parametrize("operation", sorted(OPERATIONS))
@pytest.mark.parametrize("status", [500, 503, 401, 409])
async def test_rf_019_unexpected_status_raises_storage_unavailable(operation, status):
    """Ninguna operación del canal interpreta un 409: CouchDB 3 no comprueba la revisión de un
    `_local` (`test_rf_010_local_put_with_stale_rev_keeps_the_last_write`) y el push usa
    `new_edits: false`. Si llegara, es una respuesta inesperada del almacén → 503 (VD-5)."""
    repo = ReplicationRepository(transport=_failing(status))
    with pytest.raises(StorageUnavailable):
        await OPERATIONS[operation](repo, "synapse_user_x")


class _BrokenStream(httpx.AsyncByteStream):
    """Cuerpo que entrega un trozo y luego se corta (CouchDB cae a mitad del flujo)."""

    async def __aiter__(self):
        yield b'{"results":['
        raise httpx.ReadError("connection reset")


async def test_rf_019_changes_failure_mid_stream_raises_storage_unavailable():
    transport = httpx.MockTransport(lambda request: httpx.Response(200, stream=_BrokenStream()))
    repo = ReplicationRepository(transport=transport)
    stream = await repo.changes("synapse_user_x", *sf.changes_query({}))
    with pytest.raises(StorageUnavailable):
        await _read_all(stream)
