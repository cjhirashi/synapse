"""H-031: protección de los INDICE.md por REST (`NoteContentService`) y por sync (`SyncPushService`)."""
import uuid

import pytest
import pytest_asyncio

from app.core.errors import ValidationFailed
from app.core.schemas import NoteCreate, NoteUpdate
from app.services.note_content_service import NoteContentService
from app.services.note_service import NoteService
from app.services.sync_push import SyncPushService
from app.services.vault_service import VaultService
from tests.test_note_content_service import DB as REST_DB, VAULT as REST_VAULT, _put_vault
from tests.test_note_sync_push import T0, T1, VAULT_ID, OWNER, DB, _note, _note_id, _rejected
from tests.test_sync_push import InMemoryCouch, _vault
from tests.test_vault_service import InMemoryVaultPort, TickingClock

pytestmark = pytest.mark.asyncio


# --- REST ---

@pytest.fixture
def rest():
    port = InMemoryVaultPort()
    _put_vault(port)
    return NoteContentService(port, REST_DB), port


def _paths(port) -> set[str]:
    return {d["path"] for d in port.docs[REST_DB].values() if d.get("type") == "note" and not d.get("deleted_at")}


def _by_path(port, path: str) -> dict:
    return next(d for d in port.docs[REST_DB].values() if d.get("type") == "note" and d["path"] == path and not d.get("deleted_at"))


def _create(service, path: str):
    return service.create(REST_VAULT, NoteCreate(path=path, content="x"))


async def test_rest_create_makes_the_index_of_every_ancestor_folder(rest):
    service, port = rest
    _create(service, "A/B/Nota.md")
    assert _paths(port) == {"A/B/Nota.md", "INDICE.md", "A/INDICE.md", "A/B/INDICE.md"}
    _create(service, "A/Otra.md")
    assert sum(p == "A/INDICE.md" for p in _paths(port)) == 1


@pytest.mark.parametrize("path", ["INDICE.md", "A/indice.md", "A/Indice.MD"])
async def test_rest_user_cannot_create_a_reserved_name(rest, path):
    service, _ = rest
    with pytest.raises(ValidationFailed):
        _create(service, path)


async def test_rest_accented_indice_is_a_normal_document(rest):
    service, port = rest
    _create(service, "A/ÍNDICE.md")
    assert "A/ÍNDICE.md" in _paths(port)


async def test_rest_cannot_rename_an_index_or_rename_a_note_into_one(rest):
    service, port = rest
    note = _create(service, "A/Nota.md")
    index = _by_path(port, "A/INDICE.md")
    with pytest.raises(ValidationFailed):
        service.update(REST_VAULT, index["_id"].split(":")[2], NoteUpdate(path="A/Otro.md"), f'"{index["_rev"]}"')
    with pytest.raises(ValidationFailed):
        service.update(REST_VAULT, note.note.id, NoteUpdate(path="A/INDICE.md"), note.etag)
    assert "A/Nota.md" in _paths(port)


async def test_rest_index_only_allows_editing_descripcion(rest):
    service, port = rest
    _create(service, "A/Nota.md")
    index = _by_path(port, "A/INDICE.md")
    note_id = index["_id"].split(":")[2]
    updated = service.update(REST_VAULT, note_id, NoteUpdate(frontmatter={"descripcion": "Texto"}), f'"{index["_rev"]}"')
    assert updated.note.frontmatter["descripcion"] == "Texto"
    for bad in (NoteUpdate(frontmatter={"descripcion": "Texto", "estado": "borrador"}), NoteUpdate(content="# Hola")):
        with pytest.raises(ValidationFailed):
            service.update(REST_VAULT, note_id, bad, updated.etag)


async def test_rest_index_is_deleted_only_when_its_folder_is_empty(rest):
    service, port = rest
    note = _create(service, "A/Nota.md")
    index = _by_path(port, "A/INDICE.md")
    index_id = index["_id"].split(":")[2]
    with pytest.raises(ValidationFailed):
        service.delete(REST_VAULT, index_id, f'"{index["_rev"]}"')
    service.delete(REST_VAULT, note.note.id, note.etag)
    service.delete(REST_VAULT, index_id, f'"{_by_path(port, "A/INDICE.md")["_rev"]}"')
    assert "A/INDICE.md" not in _paths(port)


async def test_rest_root_index_is_never_deleted(rest):
    service, port = rest
    note = _create(service, "Nota.md")
    service.delete(REST_VAULT, note.note.id, note.etag)
    root = _by_path(port, "INDICE.md")
    with pytest.raises(ValidationFailed):
        service.delete(REST_VAULT, root["_id"].split(":")[2], f'"{root["_rev"]}"')


# --- Sync ---

@pytest.fixture
def couch():
    return InMemoryCouch()


@pytest.fixture
def push(couch):
    clock = TickingClock()
    return SyncPushService(VaultService(couch, DB, clock=clock), NoteService(couch, DB, clock), couch, couch, DB, OWNER)


@pytest_asyncio.fixture
async def vault(push):
    assert await push.push([_vault(f"vault:{VAULT_ID}", name="Bóveda")]) == []


def _live(path: str, rev="1-aaa", **fields) -> dict:
    return _note(_note_id(), rev, path=path, **fields)


def _gone(doc: dict, rev: str) -> dict:
    """Revisión que manda `doc` a la papelera (la nota sigue con su ruta; sólo cambia `deleted_at`)."""
    return {**doc, "_rev": rev, "_revisions": {"start": 2, "ids": [rev.split("-")[1], doc["_rev"].split("-")[1]]}, "deleted_at": T1}


async def test_sync_new_index_must_have_empty_content(push, vault):
    assert await push.push([_live("A/INDICE.md", content="")]) == []
    bad = _live("B/INDICE.md", content="# a mano")
    assert await push.push([bad]) == [_rejected(bad, "index-readonly:content")]


async def test_sync_index_only_allows_changing_descripcion(push, vault):
    index = _live("A/INDICE.md", content="")
    assert await push.push([index]) == []
    ok = {**index, "_rev": "2-bbb", "_revisions": {"start": 2, "ids": ["bbb", "aaa"]}, "frontmatter": {"descripcion": "d"}}
    assert await push.push([ok]) == []
    bad = {**ok, "_rev": "3-ccc", "_revisions": {"start": 3, "ids": ["ccc", "bbb", "aaa"]}, "frontmatter": {"descripcion": "d", "estado": "x"}}
    assert await push.push([bad]) == [_rejected(bad, "index-readonly:attr")]
    moved = {**ok, "_rev": "3-ddd", "_revisions": {"start": 3, "ids": ["ddd", "bbb", "aaa"]}, "path": "B/INDICE.md"}
    assert await push.push([moved]) == [_rejected(moved, "index-readonly:path")]


async def test_sync_another_note_cannot_take_the_reserved_name(push, vault):
    note = _live("A/Nota.md")
    assert await push.push([note]) == []
    renamed = {**note, "_rev": "2-bbb", "_revisions": {"start": 2, "ids": ["bbb", "aaa"]}, "path": "A/INDICE.md"}
    assert await push.push([renamed]) == [_rejected(renamed, "reserved-name:path")]
    # Una nota nueva con ese nombre y contenido propio también se rechaza (el INDICE no lleva contenido).
    new = _live("C/indice.md")
    assert await push.push([new]) == [_rejected(new, "index-readonly:content")]


async def _folder(push, folder: str, notes: int):
    index = _live(f"{folder}/INDICE.md", content="")
    docs = [index] + [_live(f"{folder}/n{i}.md") for i in range(notes)]
    assert await push.push(docs) == []
    return docs


@pytest.mark.parametrize("index_first", [True, False])
async def test_sync_deleting_a_folder_deletes_its_index_with_it(push, vault, index_first):
    docs = await _folder(push, "A", 2)
    batch = [_gone(d, "2-bbb") for d in docs]
    if not index_first:
        batch.reverse()
    assert await push.push(batch) == []


async def test_sync_deleting_only_the_index_is_rejected_while_notes_remain(push, vault):
    docs = await _folder(push, "A", 2)
    index = _gone(docs[0], "2-bbb")
    assert await push.push([index, _gone(docs[1], "2-bbb")]) == [_rejected(index, "index-readonly:delete")]


async def test_sync_deleting_nested_folders_goes_deepest_first(push, vault):
    outer = await _folder(push, "A", 1)
    inner = await _folder(push, "A/B", 1)
    batch = [_gone(d, "2-bbb") for d in outer + inner]
    assert await push.push(batch) == []


async def test_sync_root_index_is_never_deleted(push, vault):
    root = _live("INDICE.md", content="")
    assert await push.push([root]) == []
    gone = _gone(root, "2-bbb")
    assert await push.push([gone]) == [_rejected(gone, "index-root:delete")]
