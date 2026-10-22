"""Push validado con notas (SPEC-0008 RF-004, RF-005, RF-010, RF-011, RF-013, RF-014, RF-016,
RF-017; PLAN-0008 §2.3).

Zona de coordinación: sin CouchDB ni HTTP. Reutiliza el doble `InMemoryCouch` de 0005 (árbol de
revisiones; `VaultPort` y `ReplicationPort` sobre los mismos datos) y sus ayudas de bóveda.
"""
import uuid

import pytest
import pytest_asyncio

from app.core.note_rules import CONTENT_MAX_BYTES, NOTE_REQUIRED, path_key
from app.services.note_service import NoteService
from app.services.sync_push import SyncPushService
from app.services.vault_service import VaultService
from tests.test_sync_push import DB, OWNER, T0, T1, InMemoryCouch, _revisions, _vault
from tests.test_vault_service import TickingClock

pytestmark = pytest.mark.asyncio

VAULT_ID = str(uuid.uuid4())
OTHER_VAULT_ID = str(uuid.uuid4())


# --- Fixtures y ayudas ---

@pytest.fixture
def couch():
    return InMemoryCouch()


@pytest.fixture
def clock():
    return TickingClock()


@pytest.fixture
def push(couch, clock):
    return SyncPushService(
        VaultService(couch, DB, clock=clock), NoteService(couch, DB, clock),
        couch, couch, DB, OWNER)


@pytest_asyncio.fixture
async def vault(push):
    """La bóveda `VAULT_ID` ya está en el servidor y activa: las notas del test cuelgan de ella."""
    assert await push.push([_vault(f"vault:{VAULT_ID}", name="Bóveda")]) == []
    return VAULT_ID


def _note_id(vault_id: str = VAULT_ID) -> str:
    return f"note:{vault_id}:{uuid.uuid4()}"


def _note(doc_id: str | None = None, rev: str = "1-aaa", parents: tuple[str, ...] = (), **fields) -> dict:
    """Revisión válida de una nota, como la escribe el cliente (ya normalizada)."""
    doc_id = doc_id or _note_id()
    return {
        "_id": doc_id, "_rev": rev, "_revisions": _revisions(rev, parents),
        "type": "note", "vault_id": doc_id.split(":")[1], "path": "Nota.md",
        "frontmatter": {}, "content": "# Hola", "created_at": T0, "updated_at": T0,
        "deleted_at": None,
        **fields,
    }


def _rejected(doc: dict, reason: str) -> dict:
    return {"id": doc["_id"], "rev": doc["_rev"], "error": "forbidden", "reason": reason}


def _stored(couch, doc: dict) -> bool:
    return doc["_rev"] in couch.trees.get(DB, {}).get(doc["_id"], {})


# --- Forma (RF-005) ---

@pytest.mark.parametrize("extra", [
    "_attachments", "_conflicts", "owner_id", "color", "title",
])
async def test_rf_005_note_shape_rejects_keys_outside_the_list(push, couch, vault, extra):
    doc = _note(**{extra: "x"})
    assert await push.push([doc]) == [_rejected(doc, f"validation-error:{extra}")]
    assert not _stored(couch, doc)


@pytest.mark.parametrize("missing", [key for key in NOTE_REQUIRED if key not in ("_id", "_rev")])
async def test_rf_005_note_shape_rejects_a_missing_required_key(push, vault, missing):
    doc = _note()
    del doc[missing]
    assert await push.push([doc]) == [_rejected(doc, f"validation-error:{missing}")]


async def test_rf_005_note_shape_frontmatter_is_optional(push, couch, vault):
    doc = _note()
    del doc["frontmatter"]
    assert await push.push([doc]) == []
    assert _stored(couch, doc)


@pytest.mark.parametrize("wrong_type", ["vault", "Note", "", None])
async def test_rf_005_note_shape_type_must_be_note(push, vault, wrong_type):
    doc = _note(type=wrong_type)
    assert await push.push([doc]) == [_rejected(doc, "validation-error:type")]


async def test_rf_005_note_shape_valid_revision_is_saved_with_its_history(push, couch, vault):
    doc = _note(frontmatter={"tags": ["a"]}, content="# Título\n\ntexto 😀")
    assert await push.push([doc]) == []
    assert couch.winner(DB, doc["_id"]) == {k: v for k, v in doc.items() if k != "_revisions"}


# --- Campos (RF-005, RF-016) ---

@pytest.mark.parametrize(("change", "reason"), [
    ({"path": ""}, "validation-error:path"),
    ({"path": "a//b.md"}, "validation-error:path"),
    ({"path": "/a.md"}, "validation-error:path"),
    ({"path": "a/"}, "validation-error:path"),
    ({"path": "a\u0007b.md"}, "validation-error:path"),
    ({"path": "x" * 301}, "validation-error:path"),
    ({"path": 5}, "validation-error:path"),
    ({"path": None}, "validation-error:path"),
    ({"path": " Nota.md"}, "not-normalized:path"),
    ({"path": "Carpeta / Nota.md"}, "not-normalized:path"),
    ({"content": 5}, "validation-error:content"),
    ({"content": None}, "validation-error:content"),
    ({"content": "a\ud800b"}, "validation-error:content"),
    ({"content": "a" * (CONTENT_MAX_BYTES + 1)}, "validation-error:content"),
    ({"content": "é" * (CONTENT_MAX_BYTES // 2) + "a"}, "validation-error:content"),
    ({"frontmatter": []}, "validation-error:frontmatter"),
    ({"frontmatter": "x"}, "validation-error:frontmatter"),
    ({"frontmatter": None}, "validation-error:frontmatter"),
    ({"frontmatter": {"k": "a" * 65536}}, "validation-error:frontmatter"),
])
async def test_rf_016_note_fields_follow_the_rules_of_note_rules(push, couch, vault, change, reason):
    doc = _note(**change)
    assert await push.push([doc]) == [_rejected(doc, reason)]
    assert not _stored(couch, doc)


async def test_rf_016_note_field_content_of_exactly_two_mib_is_saved(push, couch, vault):
    doc = _note(content="é" * (CONTENT_MAX_BYTES // 2))
    assert await push.push([doc]) == []
    assert _stored(couch, doc)


async def test_rf_016_note_field_over_the_limit_keeps_the_previous_revision(push, couch, vault):
    doc = _note()
    await push.push([doc])
    too_big = _note(doc["_id"], "2-bbb", ("1-aaa",), content="a" * (CONTENT_MAX_BYTES + 1))
    assert await push.push([too_big]) == [_rejected(too_big, "validation-error:content")]
    assert couch.winner(DB, doc["_id"])["_rev"] == "1-aaa"


async def test_rf_005_note_field_vault_id_must_equal_the_one_in_the_id(push, vault):
    doc = _note(vault_id=OTHER_VAULT_ID)
    assert await push.push([doc]) == [_rejected(doc, "validation-error:vault_id")]


@pytest.mark.parametrize(("change", "reason"), [
    ({"created_at": "2026-10-12"}, "validation-error:created_at"),
    ({"created_at": None}, "validation-error:created_at"),
    ({"updated_at": "2026-10-12T09:00:00Z"}, "validation-error:updated_at"),
    ({"deleted_at": "yesterday"}, "validation-error:deleted_at"),
])
async def test_rf_005_note_field_timestamps_use_the_server_format(push, vault, change, reason):
    doc = _note(**change)
    assert await push.push([doc]) == [_rejected(doc, reason)]


async def test_rf_005_note_field_dates_are_not_compared_with_the_server_clock(push, vault):
    doc = _note(created_at="2099-01-01T00:00:00.000000Z", updated_at="1999-01-01T00:00:00.000000Z")
    assert await push.push([doc]) == []


async def test_rf_005_note_field_created_at_is_immutable(push, vault):
    doc = _note()
    await push.push([doc])
    changed = _note(doc["_id"], "2-bbb", ("1-aaa",), created_at=T1)
    assert await push.push([changed]) == [_rejected(changed, "immutable-field:created_at")]


async def test_rf_005_note_shape_one_rejection_per_document_with_the_first_failing_rule(push, vault):
    doc = _note(color="x", path="", content=5)
    assert await push.push([doc]) == [_rejected(doc, "validation-error:color")]


async def test_rf_005_note_shape_a_bad_note_does_not_stop_the_rest_of_the_batch(push, couch, vault):
    bad, good = _note(path=""), _note(path="Otra.md")
    assert await push.push([bad, good]) == [_rejected(bad, "validation-error:path")]
    assert _stored(couch, good) and not _stored(couch, bad)
