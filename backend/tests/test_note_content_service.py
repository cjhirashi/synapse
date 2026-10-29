"""Reglas de `NoteContentService` (historia 0014: H-004.1 lectura, H-004.2 escritura) con un
doble en memoria de `VaultPort` (el mismo de `test_vault_service.py`). Zona de coordinación:
sin CouchDB ni HTTP.
"""
import uuid

import pytest

from app.core.errors import (
    InvalidCursor, NoteNotFound, NotePathTaken, PreconditionFailed, PreconditionRequired,
    ValidationFailed, VaultNotFound,
)
from app.core.schemas import NoteCreate, NoteUpdate
from app.services.note_content_service import NoteContentService, decode_cursor, encode_cursor
from tests.test_note_rules import CASES, _frontmatter, _value
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


# --- C-4: `create` ---

def test_create_reserves_the_path_and_returns_etag(service, port):
    _put_vault(port)
    result = service.create(VAULT, NoteCreate(path="Nota.md", content="hola"))
    assert (result.note.path, result.note.content) == ("Nota.md", "hola")
    assert result.note.vault_id == VAULT and result.note.frontmatter is None
    assert result.note.created_at == result.note.updated_at and result.note.deleted_at is None
    stored = port.docs[DB][f"note:{VAULT}:{result.note.id}"]
    assert result.etag == f'"{stored["_rev"]}"'
    # La ruta queda reservada: otra nota con la misma ruta choca (C-6).
    with pytest.raises(NotePathTaken):
        service.create(VAULT, NoteCreate(path="Nota.md", content="otra"))


def test_create_accepts_frontmatter(service, port):
    _put_vault(port)
    result = service.create(VAULT, NoteCreate(path="Nota.md", content="x", frontmatter={"a": 1}))
    assert result.note.frontmatter == {"a": 1}


def test_create_of_a_missing_vault_is_vault_not_found(service):
    with pytest.raises(VaultNotFound):
        service.create(VAULT, NoteCreate(path="Nota.md", content="x"))


def test_create_of_a_trashed_vault_is_vault_not_found(service, port):
    """A diferencia de la lectura (§5), escribir exige la bóveda activa (C-10, igual al push)."""
    _put_vault(port, deleted=True)
    with pytest.raises(VaultNotFound):
        service.create(VAULT, NoteCreate(path="Nota.md", content="x"))


# --- C-5: `create`/`update` comparten `note_rules.check_*` con el push ---

def test_create_with_an_invalid_path_is_422_like_the_push(service, port):
    _put_vault(port)
    with pytest.raises(Exception) as exc:
        service.create(VAULT, NoteCreate(path="", content="x"))
    assert exc.value.errors == [{"pointer": "#/path", "detail": "validation-error:path"}]


def test_create_with_an_unnormalized_path_is_422_like_the_push(service, port):
    _put_vault(port)
    with pytest.raises(Exception) as exc:
        service.create(VAULT, NoteCreate(path=" Nota.md", content="x"))
    assert exc.value.errors == [{"pointer": "#/path", "detail": "not-normalized:path"}]


def test_create_with_invalid_frontmatter_is_422_like_the_push(service, port):
    _put_vault(port)
    deep: dict = {}
    for _ in range(40):
        deep = {"k": deep}
    with pytest.raises(Exception) as exc:
        service.create(VAULT, NoteCreate(path="Nota.md", content="x", frontmatter=deep))
    assert exc.value.errors == [{"pointer": "#/frontmatter", "detail": "validation-error:frontmatter"}]


# --- C-6: `path` ya reservado por otra nota viva ---

def test_create_with_a_path_taken_by_another_live_note_is_409(service, port):
    _put_vault(port)
    service.create(VAULT, NoteCreate(path="Nota.md", content="a"))
    with pytest.raises(NotePathTaken):
        service.create(VAULT, NoteCreate(path="Nota.md", content="b"))


def test_create_can_reuse_the_path_of_a_deleted_note(service, port):
    _put_vault(port)
    first = service.create(VAULT, NoteCreate(path="Nota.md", content="a"))
    service.delete(VAULT, first.note.id, first.etag)
    # Libre otra vez: otra nota puede tomar la misma ruta (RF-017 de 0008, vía `release_path`).
    second = service.create(VAULT, NoteCreate(path="Nota.md", content="b"))
    assert second.note.path == "Nota.md"


# --- C-7/C-8: `update` con `If-Match` ---

def test_update_without_if_match_is_428(service, port):
    _put_vault(port)
    created = service.create(VAULT, NoteCreate(path="Nota.md", content="a"))
    with pytest.raises(PreconditionRequired):
        service.update(VAULT, created.note.id, NoteUpdate(content="b"), None)


def test_update_with_a_stale_if_match_is_412(service, port):
    _put_vault(port)
    created = service.create(VAULT, NoteCreate(path="Nota.md", content="a"))
    with pytest.raises(PreconditionFailed):
        service.update(VAULT, created.note.id, NoteUpdate(content="b"), '"1-stale"')


def test_update_changes_only_sent_fields_with_a_new_etag(service, port):
    _put_vault(port)
    created = service.create(VAULT, NoteCreate(path="Nota.md", content="a", frontmatter={"x": 1}))
    result = service.update(VAULT, created.note.id, NoteUpdate(content="b"), created.etag)
    assert (result.note.content, result.note.path) == ("b", "Nota.md")
    assert result.note.frontmatter == {"x": 1}
    assert result.etag != created.etag
    assert result.note.updated_at >= created.note.created_at


def test_update_can_clear_frontmatter_with_explicit_null(service, port):
    _put_vault(port)
    created = service.create(VAULT, NoteCreate(path="Nota.md", content="a", frontmatter={"x": 1}))
    result = service.update(VAULT, created.note.id, NoteUpdate(frontmatter=None), created.etag)
    assert result.note.frontmatter is None


def test_update_that_changes_path_releases_the_old_reservation_and_takes_the_new_one(service, port):
    _put_vault(port)
    created = service.create(VAULT, NoteCreate(path="Vieja.md", content="a"))
    updated = service.update(VAULT, created.note.id, NoteUpdate(path="Nueva.md"), created.etag)
    assert updated.note.path == "Nueva.md"
    # La ruta vieja quedó libre.
    service.create(VAULT, NoteCreate(path="Vieja.md", content="otra"))
    # La ruta nueva ya es de esta nota: otra no puede tomarla.
    with pytest.raises(NotePathTaken):
        service.create(VAULT, NoteCreate(path="Nueva.md", content="otra"))


def test_update_to_a_path_taken_by_another_live_note_is_409(service, port):
    _put_vault(port)
    service.create(VAULT, NoteCreate(path="A.md", content="a"))
    b = service.create(VAULT, NoteCreate(path="B.md", content="b"))
    with pytest.raises(NotePathTaken):
        service.update(VAULT, b.note.id, NoteUpdate(path="A.md"), b.etag)


def test_update_with_an_invalid_path_is_422_like_the_push(service, port):
    _put_vault(port)
    created = service.create(VAULT, NoteCreate(path="Nota.md", content="a"))
    with pytest.raises(Exception) as exc:
        service.update(VAULT, created.note.id, NoteUpdate(path=""), created.etag)
    assert exc.value.errors == [{"pointer": "#/path", "detail": "validation-error:path"}]


def test_update_of_a_missing_note_is_note_not_found(service, port):
    _put_vault(port)
    with pytest.raises(NoteNotFound):
        service.update(VAULT, str(uuid.uuid4()), NoteUpdate(content="b"), '"1-x"')


# --- C-9: `delete` ---

def test_delete_soft_deletes_and_releases_the_path(service, port):
    _put_vault(port)
    created = service.create(VAULT, NoteCreate(path="Nota.md", content="a"))
    service.delete(VAULT, created.note.id, created.etag)
    stored = port.docs[DB][f"note:{VAULT}:{created.note.id}"]
    assert stored["deleted_at"] is not None
    # El documento no se borra (nunca lápida de CouchDB): `_load` lo ve en la papelera.
    with pytest.raises(NoteNotFound):
        service.get(VAULT, created.note.id)
    # Y la ruta queda libre.
    service.create(VAULT, NoteCreate(path="Nota.md", content="otra"))


def test_delete_without_if_match_is_428(service, port):
    _put_vault(port)
    created = service.create(VAULT, NoteCreate(path="Nota.md", content="a"))
    with pytest.raises(PreconditionRequired):
        service.delete(VAULT, created.note.id, None)


def test_delete_with_a_stale_if_match_is_412(service, port):
    _put_vault(port)
    created = service.create(VAULT, NoteCreate(path="Nota.md", content="a"))
    with pytest.raises(PreconditionFailed):
        service.delete(VAULT, created.note.id, '"1-stale"')


def test_delete_of_a_missing_note_is_note_not_found(service, port):
    _put_vault(port)
    with pytest.raises(NoteNotFound):
        service.delete(VAULT, str(uuid.uuid4()), '"1-x"')


# --- restore ---

def test_restore_brings_the_note_back_and_reserves_its_path(service, port):
    _put_vault(port)
    created = service.create(VAULT, NoteCreate(path="Nota.md", content="a"))
    deleted = service.delete(VAULT, created.note.id, created.etag)
    trashed_etag = f'"{port.docs[DB][f"note:{VAULT}:{created.note.id}"]["_rev"]}"'
    restored = service.restore(VAULT, created.note.id, trashed_etag)
    assert restored.note.deleted_at is None and restored.note.path == "Nota.md"
    assert service.get(VAULT, created.note.id).note.path == "Nota.md"
    # La ruta vuelve a estar reservada: otra nota no puede tomarla.
    with pytest.raises(NotePathTaken):
        service.create(VAULT, NoteCreate(path="Nota.md", content="otra"))


def test_restore_without_if_match_is_428(service, port):
    _put_vault(port)
    created = service.create(VAULT, NoteCreate(path="Nota.md", content="a"))
    service.delete(VAULT, created.note.id, created.etag)
    with pytest.raises(PreconditionRequired):
        service.restore(VAULT, created.note.id, None)


def test_restore_of_an_active_note_is_note_not_found(service, port):
    _put_vault(port)
    created = service.create(VAULT, NoteCreate(path="Nota.md", content="a"))
    with pytest.raises(NoteNotFound):
        service.restore(VAULT, created.note.id, created.etag)


def test_restore_with_a_path_taken_by_another_live_note_is_409(service, port):
    _put_vault(port)
    created = service.create(VAULT, NoteCreate(path="Nota.md", content="a"))
    service.delete(VAULT, created.note.id, created.etag)
    trashed_etag = f'"{port.docs[DB][f"note:{VAULT}:{created.note.id}"]["_rev"]}"'
    service.create(VAULT, NoteCreate(path="Nota.md", content="otra"))
    with pytest.raises(NotePathTaken):
        service.restore(VAULT, created.note.id, trashed_etag)


# --- C-5/C-10: `create`/`update` rechazan por REST exactamente lo mismo que el push,
# recorriendo la misma batería común de `fixtures/note_rules_cases.json` que
# `test_note_rules.py` ya prueba contra `core/note_rules.py` directamente. Esto es lo que
# cierra, con una prueba y no sólo con disciplina, el riesgo que P-1 señalaba (duplicar
# validación entre los dos canales de escritura).
#
# Sólo los casos cuyo tipo nativo es el que `NoteCreate` admite (`str` para `path`/`content`,
# `dict` para `frontmatter`) llegan al servicio: un tipo distinto (`5`, `None`, una lista…) lo
# rechaza antes `pydantic` con su propio 422 de tipo (`string_type`/`dict_type`), no
# `check_path`/`check_content`/`check_frontmatter` — mismo código HTTP (422) en los dos
# canales, pero el código textual de `errors[].detail` no aplica a un valor que REST ni
# siquiera deja entrar a esas funciones.

def _rejection(service, port, **fields) -> str | None:
    """`code` del rechazo de `service.create` para `fields` (sobre `path`/`content` por
    defecto válidos), o `None` si se acepta. Bóveda nueva por llamada: así `path` nunca
    choca entre casos de la batería (C-6 es otra prueba)."""
    vault_id = str(uuid.uuid4())
    _put_vault(port, vault_id=vault_id)
    data = {"path": "Nota.md", "content": "", **fields}
    try:
        service.create(vault_id, NoteCreate(**data))
    except ValidationFailed as exc:
        [entry] = exc.errors
        return entry["detail"]
    return None


_STRING_PATH_CASES = [c for c in CASES["path"] if isinstance(_value(c), str)]
_STRING_CONTENT_CASES = [c for c in CASES["content"] if isinstance(_value(c), str)]
_DICT_FRONTMATTER_CASES = [
    c for c in CASES["frontmatter"]
    if "depth" in c or "nonfinite" in c or "build" in c or isinstance(c["input"], dict)
]


@pytest.mark.parametrize("case", _STRING_PATH_CASES, ids=lambda c: _value(c)[:40])
def test_create_rejects_path_exactly_like_the_push(service, port, case):
    assert _rejection(service, port, path=_value(case)) == case["code"]


@pytest.mark.parametrize("case", _STRING_CONTENT_CASES, ids=lambda c: _value(c)[:40])
def test_create_rejects_content_exactly_like_the_push(service, port, case):
    expected = None if case["valid"] else "validation-error:content"
    assert _rejection(service, port, content=_value(case)) == expected


@pytest.mark.parametrize(
    "case", _DICT_FRONTMATTER_CASES,
    ids=lambda c: __import__("json").dumps(c["input"])[:40] + (f"depth{c['depth']}" if "depth" in c else ""))
def test_create_rejects_frontmatter_exactly_like_the_push(service, port, case):
    expected = None if case["valid"] else "validation-error:frontmatter"
    assert _rejection(service, port, frontmatter=_frontmatter(case)) == expected
