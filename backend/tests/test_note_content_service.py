"""Reglas de `NoteContentService` (historia 0014, H-004.1: sólo lectura) con un doble en
memoria de `VaultPort` (el mismo de `test_vault_service.py`). Zona de coordinación: sin
CouchDB ni HTTP.
"""
import uuid

import pytest

from app.core.errors import InvalidCursor, NoteNotFound, VaultNotFound
from app.services.note_content_service import NoteContentService, decode_cursor, encode_cursor
from tests.test_vault_service import InMemoryVaultPort

DB = "synapse_user_owner"
VAULT = "7d1c9a8e-0000-4000-8000-000000000001"
OTHER_VAULT = "7d1c9a8e-0000-4000-8000-000000000002"
WHEN = "2026-10-12T10:00:00.000000Z"

_LIST_ITEM_KEYS = {"id", "vault_id", "path", "created_at", "updated_at", "deleted_at", "etag"}


@pytest.fixture
def port():
    return InMemoryVaultPort()


@pytest.fixture
def service(port):
    return NoteContentService(port, DB)


def _vault_doc(vault_id: str = VAULT, *, deleted: bool = False) -> dict:
    return {
        "_id": f"vault:{vault_id}", "type": "vault", "name": "v",
        "created_at": WHEN, "deleted_at": WHEN if deleted else None,
    }


def _note_doc(path: str, *, vault_id: str = VAULT, note_id: str | None = None,
              created_at: str = WHEN, deleted: bool = False, **fields) -> dict:
    note_id = note_id or str(uuid.uuid4())
    return {
        "_id": f"note:{vault_id}:{note_id}", "type": "note", "vault_id": vault_id, "path": path,
        "content": "", "created_at": created_at, "updated_at": created_at,
        "deleted_at": created_at if deleted else None, **fields,
    }


def _note_id(doc: dict) -> str:
    return doc["_id"].split(":")[2]


def _put_vault(port, **kwargs) -> dict:
    doc = _vault_doc(**kwargs)
    port.put(DB, doc)
    return doc


def _put_note(port, path: str, **kwargs) -> dict:
    doc = _note_doc(path, **kwargs)
    port.put(DB, doc)
    return doc


# --- `vault_id` de la URL (§5: una bóveda borrada no bloquea leer sus notas) ---

def test_get_of_a_nonexistent_vault_is_vault_not_found(service):
    with pytest.raises(VaultNotFound):
        service.get(VAULT, str(uuid.uuid4()))


def test_list_of_a_nonexistent_vault_is_vault_not_found(service):
    with pytest.raises(VaultNotFound):
        service.list(VAULT, deleted=False, limit=10, cursor=None)


@pytest.mark.parametrize("vault_id", ["not-a-uuid", VAULT.upper(), f"{{{VAULT}}}"])
def test_non_canonical_vault_id_is_vault_not_found(service, vault_id):
    with pytest.raises(VaultNotFound):
        service.get(vault_id, str(uuid.uuid4()))


def test_a_trashed_vault_still_lets_its_notes_be_read(service, port):
    _put_vault(port, deleted=True)
    note = _put_note(port, "Nota.md")
    result = service.get(VAULT, _note_id(note))
    assert result.note.path == "Nota.md"
    page = service.list(VAULT, deleted=False, limit=10, cursor=None)
    assert [item.path for item in page.items] == ["Nota.md"]


# --- C-2 / C-3: `get` por id ---

def test_get_returns_full_content_frontmatter_and_etag(service, port):
    _put_vault(port)
    doc = _put_note(port, "Carpeta/Nota.md", frontmatter={"tags": ["a"]}, content="hola")
    result = service.get(VAULT, _note_id(doc))
    assert (result.note.path, result.note.content) == ("Carpeta/Nota.md", "hola")
    assert result.note.frontmatter == {"tags": ["a"]}
    assert result.note.vault_id == VAULT
    stored = port.docs[DB][doc["_id"]]
    assert result.etag == f'"{stored["_rev"]}"'


def test_note_without_frontmatter_reads_as_null(service, port):
    _put_vault(port)
    doc = _put_note(port, "Nota.md")
    assert service.get(VAULT, _note_id(doc)).note.frontmatter is None


def test_missing_note_is_note_not_found(service, port):
    _put_vault(port)
    with pytest.raises(NoteNotFound):
        service.get(VAULT, str(uuid.uuid4()))


def test_note_of_another_vault_is_note_not_found(service, port):
    _put_vault(port)
    _put_vault(port, vault_id=OTHER_VAULT)
    doc = _put_note(port, "Nota.md", vault_id=OTHER_VAULT)
    with pytest.raises(NoteNotFound):
        service.get(VAULT, _note_id(doc))


def test_deleted_note_is_not_found_by_plain_get(service, port):
    _put_vault(port)
    doc = _put_note(port, "Nota.md", deleted=True)
    with pytest.raises(NoteNotFound):
        service.get(VAULT, _note_id(doc))


@pytest.mark.parametrize("note_id", ["not-a-uuid", "x", ""])
def test_non_canonical_note_id_is_note_not_found(service, port, note_id):
    _put_vault(port)
    with pytest.raises(NoteNotFound):
        service.get(VAULT, note_id)


# --- C-1: listado ---

def test_list_returns_only_live_notes_without_content_or_frontmatter(service, port):
    _put_vault(port)
    _put_note(port, "Viva.md", content="x", frontmatter={"a": 1})
    _put_note(port, "Borrada.md", deleted=True)
    page = service.list(VAULT, deleted=False, limit=10, cursor=None)
    assert [item.path for item in page.items] == ["Viva.md"]
    assert set(page.items[0].model_dump()) == _LIST_ITEM_KEYS


def test_trash_lists_only_deleted_notes_with_their_etag(service, port):
    _put_vault(port)
    _put_note(port, "Viva.md")
    deleted_doc = _put_note(port, "Borrada.md", deleted=True)
    page = service.list(VAULT, deleted=True, limit=10, cursor=None)
    assert [item.path for item in page.items] == ["Borrada.md"]
    assert page.items[0].etag == f'"{port.docs[DB][deleted_doc["_id"]]["_rev"]}"'


def test_list_never_mixes_notes_of_two_vaults(service, port):
    _put_vault(port)
    _put_vault(port, vault_id=OTHER_VAULT)
    _put_note(port, "DeEsta.md")
    _put_note(port, "DeOtra.md", vault_id=OTHER_VAULT)
    page = service.list(VAULT, deleted=False, limit=10, cursor=None)
    assert [item.path for item in page.items] == ["DeEsta.md"]


def test_list_paginates_newest_first_with_a_cursor(service, port):
    _put_vault(port)
    for i in range(3):
        _put_note(port, f"n{i}.md", created_at=f"2026-10-1{i}T00:00:00.000000Z")
    first = service.list(VAULT, deleted=False, limit=2, cursor=None)
    assert [item.path for item in first.items] == ["n2.md", "n1.md"]
    assert first.next_cursor is not None
    second = service.list(VAULT, deleted=False, limit=2, cursor=first.next_cursor)
    assert [item.path for item in second.items] == ["n0.md"]
    assert second.next_cursor is None


def test_list_with_an_unreadable_cursor_is_invalid(service, port):
    _put_vault(port)
    with pytest.raises(InvalidCursor):
        service.list(VAULT, deleted=False, limit=10, cursor="%%%")


# --- Cursor: ligado a la bóveda y a la lista (vivas ↔ papelera) ---

def test_cursor_round_trip():
    note_id = str(uuid.uuid4())
    assert decode_cursor(encode_cursor(VAULT, False, WHEN, note_id), VAULT, False) == (WHEN, note_id)


def test_cursor_of_another_vault_is_invalid(service, port):
    _put_vault(port)
    for i in range(2):
        _put_note(port, f"n{i}.md", created_at=f"2026-10-1{i}T00:00:00.000000Z")
    page = service.list(VAULT, deleted=False, limit=1, cursor=None)
    with pytest.raises(InvalidCursor):
        decode_cursor(page.next_cursor, OTHER_VAULT, False)


def test_cursor_of_the_other_list_is_invalid():
    cursor = encode_cursor(VAULT, False, WHEN, str(uuid.uuid4()))
    with pytest.raises(InvalidCursor):
        decode_cursor(cursor, VAULT, True)
