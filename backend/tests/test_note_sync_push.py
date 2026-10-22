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


# --- Bóveda activa (RF-004, RF-014) ---

def _vault_rev(vault_id: str, rev: str = "1-aaa", parents: tuple[str, ...] = (), **fields) -> dict:
    return _vault(f"vault:{vault_id}", rev, parents, **fields)


def _new_vault_id() -> str:
    return str(uuid.uuid4())


async def test_rf_004_note_of_a_missing_vault_is_rejected(push, couch):
    doc = _note(_note_id(_new_vault_id()))
    assert await push.push([doc]) == [_rejected(doc, "vault-not-found")]
    assert not _stored(couch, doc)


async def test_rf_004_note_of_a_deleted_vault_is_rejected(push, couch):
    vault_id = _new_vault_id()
    await push.push([_vault_rev(vault_id, name="Borrada", deleted_at=T1)])
    doc = _note(_note_id(vault_id))
    assert await push.push([doc]) == [_rejected(doc, "vault-not-found")]
    assert not _stored(couch, doc)


async def test_rf_014_note_of_a_vault_deleted_after_its_creation_is_rejected(push, vault):
    await push.push([_vault_rev(vault, "2-bbb", ("1-aaa",), name="Bóveda", deleted_at=T1)])
    doc = _note()
    assert await push.push([doc]) == [_rejected(doc, "vault-not-found")]


async def test_rf_014_notes_are_accepted_again_when_the_vault_is_restored(push, vault):
    await push.push([_vault_rev(vault, "2-bbb", ("1-aaa",), name="Bóveda", deleted_at=T1)])
    await push.push([_vault_rev(vault, "3-ccc", ("2-bbb", "1-aaa"), name="Bóveda")])
    assert await push.push([_note()]) == []


@pytest.mark.parametrize("vault_first", [True, False], ids=["vault-then-note", "note-then-vault"])
async def test_rf_004_note_of_a_vault_created_in_the_same_batch_is_accepted(push, couch, vault_first):
    # El feed de cambios puede entregar la nota antes que su bóveda (la bóveda se editó
    # después): el orden del lote no cambia el resultado (PLAN-0008 §2.3, paso 1).
    vault_id = _new_vault_id()
    vault_doc, note = _vault_rev(vault_id, name="Nueva"), _note(_note_id(vault_id))
    batch = [vault_doc, note] if vault_first else [note, vault_doc]
    assert await push.push(batch) == []
    assert _stored(couch, vault_doc) and _stored(couch, note)


async def test_rf_004_note_of_a_vault_rejected_in_the_same_batch_is_rejected(push, couch):
    vault_id = _new_vault_id()
    bad_vault, note = _vault_rev(vault_id, name=""), _note(_note_id(vault_id))
    assert await push.push([note, bad_vault]) == [
        _rejected(note, "vault-not-found"), _rejected(bad_vault, "validation-error:name")]
    assert not _stored(couch, note)


async def test_rf_014_note_of_a_vault_deleted_in_the_same_batch_is_rejected(push, vault):
    # La revisión de la bóveda del lote (borrada) sustituye a la del servidor en la proyección.
    deleted = _vault_rev(vault, "2-bbb", ("1-aaa",), name="Bóveda", deleted_at=T1)
    note = _note()
    assert await push.push([note, deleted]) == [_rejected(note, "vault-not-found")]


async def test_rf_004_note_of_a_vault_in_conflict_with_an_active_branch_is_accepted(push):
    # P-9: basta una rama viva y activa; la resolución de la bóveda decide después.
    vault_id = _new_vault_id()
    assert await push.push([
        _vault_rev(vault_id, "1-aaa", name="Uno"),
        _vault_rev(vault_id, "2-bbb", ("1-aaa",), name="Uno", deleted_at=T1),
        _vault_rev(vault_id, "2-ccc", ("1-aaa",), name="Uno"),
    ]) == []
    assert await push.push([_note(_note_id(vault_id))]) == []


async def test_rf_004_note_of_a_vault_in_conflict_with_every_branch_deleted_is_rejected(push):
    vault_id = _new_vault_id()
    await push.push([
        _vault_rev(vault_id, "1-aaa", name="Uno"),
        _vault_rev(vault_id, "2-bbb", ("1-aaa",), name="Uno", deleted_at=T1),
        _vault_rev(vault_id, "2-ccc", ("1-aaa",), name="Uno", deleted_at=T1),
    ])
    doc = _note(_note_id(vault_id))
    assert await push.push([doc]) == [_rejected(doc, "vault-not-found")]


async def test_rf_014_tombstone_of_a_note_of_a_deleted_vault_is_rejected(push, couch, vault):
    # Una lápida que cierra una rama del conflicto de la nota también exige la bóveda activa.
    note_id = _note_id()
    await push.push([
        _note(note_id, "1-aaa"),
        _note(note_id, "2-bbb", ("1-aaa",), content="uno"),
        _note(note_id, "2-ccc", ("1-aaa",), content="dos"),
    ])
    await push.push([_vault_rev(vault, "2-bbb", ("1-aaa",), name="Bóveda", deleted_at=T1)])
    tombstone = {"_id": note_id, "_rev": "3-ddd", "_revisions": _revisions("3-ddd", ("2-ccc", "1-aaa")),
                 "_deleted": True}
    assert await push.push([tombstone]) == [_rejected(tombstone, "vault-not-found")]
    assert len(couch.live_leaves(DB, note_id)) == 2


async def test_rf_014_tombstone_of_a_note_of_an_active_vault_is_accepted(push, couch, vault):
    note_id = _note_id()
    await push.push([
        _note(note_id, "1-aaa"),
        _note(note_id, "2-bbb", ("1-aaa",), content="uno"),
        _note(note_id, "2-ccc", ("1-aaa",), content="dos"),
    ])
    tombstone = {"_id": note_id, "_rev": "3-ddd", "_revisions": _revisions("3-ddd", ("2-ccc", "1-aaa")),
                 "_deleted": True}
    assert await push.push([tombstone]) == []
    assert [leaf["_rev"] for leaf in couch.live_leaves(DB, note_id)] == ["2-bbb"]


# --- Reservas de ruta (RF-010, RF-011, RF-013, RF-017) ---

def _reservation(couch, path: str, vault_id: str = VAULT_ID) -> dict | None:
    return couch.get(DB, f"note-path:{vault_id}:{path_key(path)}")


async def test_rf_013_new_note_reserves_its_path_in_its_vault(push, couch, vault):
    doc = _note(path="Carpeta/Nota.md")
    assert await push.push([doc]) == []
    reservation = _reservation(couch, "carpeta/nota.md")
    assert (reservation["type"], reservation["note_id"]) == ("note-path", doc["_id"])


@pytest.mark.parametrize(("first", "second"), [
    ("Nota.md", "Nota.md"),
    ("Nota.md", "NOTA.md"),
    ("Straße.md", "STRASSE.md"),
    ("Café.md", "Café.md"),
])
async def test_rf_013_reserved_path_taken_by_another_note_is_rejected_without_saving(push, couch, vault, first, second):
    await push.push([_note(path=first)])
    taken = _note(path=second)
    assert await push.push([taken]) == [_rejected(taken, "note-path-taken")]
    assert not _stored(couch, taken)


async def test_rf_013_the_same_reserved_path_in_another_vault_is_free(push, couch, vault):
    other_vault = _new_vault_id()
    await push.push([_vault_rev(other_vault, name="Otra")])
    await push.push([_note(path="Nota.md")])
    assert await push.push([_note(_note_id(other_vault), path="Nota.md")]) == []


async def test_rf_013_two_notes_reserving_one_path_in_the_same_batch_save_only_the_first(push, couch, vault):
    first, second = _note(path="Misma.md"), _note(path="misma.md")
    assert await push.push([first, second]) == [_rejected(second, "note-path-taken")]
    assert _stored(couch, first) and not _stored(couch, second)


async def test_rf_013_editing_a_note_keeps_its_own_reserved_path(push, couch, vault):
    doc = _note(path="Nota.md")
    await push.push([doc])
    edited = _note(doc["_id"], "2-bbb", ("1-aaa",), path="Nota.md", content="otro")
    assert await push.push([edited]) == []
    assert _reservation(couch, "Nota.md")["note_id"] == doc["_id"]


async def test_rf_011_rename_reserves_the_new_path_and_frees_the_old_one(push, couch, vault):
    doc = _note(path="Vieja.md")
    await push.push([doc])
    assert await push.push([_note(doc["_id"], "2-bbb", ("1-aaa",), path="Carpeta/Nueva.md")]) == []
    assert _reservation(couch, "Vieja.md") is None
    assert _reservation(couch, "Carpeta/Nueva.md")["note_id"] == doc["_id"]
    # La ruta liberada queda disponible para otra nota.
    assert await push.push([_note(path="Vieja.md")]) == []


async def test_rf_011_rename_to_a_taken_path_is_rejected_and_keeps_the_old_one(push, couch, vault):
    mine, other = _note(path="Mia.md"), _note(path="Otra.md")
    await push.push([mine, other])
    rename = _note(mine["_id"], "2-bbb", ("1-aaa",), path="OTRA.md")
    assert await push.push([rename]) == [_rejected(rename, "note-path-taken")]
    assert _reservation(couch, "Mia.md")["note_id"] == mine["_id"]


async def test_rf_011_renaming_only_the_case_keeps_the_reservation(push, couch, vault):
    doc = _note(path="nota.md")
    await push.push([doc])
    assert await push.push([_note(doc["_id"], "2-bbb", ("1-aaa",), path="NOTA.md")]) == []
    assert _reservation(couch, "nota.md")["note_id"] == doc["_id"]


async def test_rf_010_soft_delete_frees_the_path(push, couch, vault):
    doc = _note(path="Borrar.md")
    await push.push([doc])
    trashed = _note(doc["_id"], "2-bbb", ("1-aaa",), path="Borrar.md", deleted_at=T1)
    assert await push.push([trashed]) == []
    assert _reservation(couch, "Borrar.md") is None
    assert await push.push([_note(path="Borrar.md")]) == []


async def test_rf_010_a_note_created_in_the_trash_does_not_reserve(push, couch, vault):
    assert await push.push([_note(path="Papelera.md", deleted_at=T1)]) == []
    assert _reservation(couch, "Papelera.md") is None


async def test_rf_017_restore_reserves_the_path_again(push, couch, vault):
    doc = _note(path="Volver.md")
    await push.push([doc, _note(doc["_id"], "2-bbb", ("1-aaa",), path="Volver.md", deleted_at=T1)])
    assert _reservation(couch, "Volver.md") is None
    assert await push.push([_note(doc["_id"], "3-ccc", ("2-bbb", "1-aaa"), path="Volver.md")]) == []
    assert _reservation(couch, "Volver.md")["note_id"] == doc["_id"]


async def test_rf_017_restore_with_the_path_taken_meanwhile_is_rejected(push, couch, vault):
    doc = _note(path="Ocupada.md")
    await push.push([doc])
    await push.push([_note(doc["_id"], "2-bbb", ("1-aaa",), path="Ocupada.md", deleted_at=T1)])
    await push.push([_note(path="Ocupada.md")])  # otra nota se queda la ruta
    restore = _note(doc["_id"], "3-ccc", ("2-bbb", "1-aaa"), path="Ocupada.md")
    assert await push.push([restore]) == [_rejected(restore, "note-path-taken")]
    assert not _stored(couch, restore)


async def test_rf_013_every_live_branch_keeps_its_reserved_path(push, couch, vault):
    # Conflicto: una rama renombra la nota y la otra conserva la ruta vieja; mientras la
    # otra siga viva, la ruta vieja no se libera (P-4: una rama perdedora puede ganar).
    doc_id = _note_id()
    assert await push.push([
        _note(doc_id, "1-aaa", path="Vieja.md"),
        _note(doc_id, "2-bbb", ("1-aaa",), path="Vieja.md", content="uno"),
        _note(doc_id, "2-ccc", ("1-aaa",), path="Nueva.md", content="dos"),
    ]) == []
    assert _reservation(couch, "Vieja.md")["note_id"] == doc_id
    assert _reservation(couch, "Nueva.md")["note_id"] == doc_id
    taken = _note(path="Vieja.md")
    assert await push.push([taken]) == [_rejected(taken, "note-path-taken")]


async def test_rf_011_closing_a_branch_frees_a_path_no_live_leaf_uses(push, couch, vault):
    doc_id = _note_id()
    await push.push([
        _note(doc_id, "1-aaa", path="Vieja.md"),
        _note(doc_id, "2-bbb", ("1-aaa",), path="Vieja.md", content="uno"),
        _note(doc_id, "2-ccc", ("1-aaa",), path="Nueva.md", content="dos"),
    ])
    tombstone = {"_id": doc_id, "_rev": "3-ddd", "_revisions": _revisions("3-ddd", ("2-bbb", "1-aaa")),
                 "_deleted": True}
    assert await push.push([tombstone]) == []
    assert _reservation(couch, "Vieja.md") is None
    assert _reservation(couch, "Nueva.md")["note_id"] == doc_id


async def test_rf_013_mixed_batch_of_vaults_and_notes_rejects_only_the_bad_note(push, couch, vault):
    await push.push([_note(path="Ocupada.md")])
    vault_id = _new_vault_id()
    new_vault, good = _vault_rev(vault_id, name="Mezcla"), _note(_note_id(vault_id), path="Ocupada.md")
    taken = _note(path="ocupada.md")
    assert await push.push([taken, good, new_vault]) == [_rejected(taken, "note-path-taken")]
    assert _stored(couch, new_vault) and _stored(couch, good) and not _stored(couch, taken)


async def test_rf_013_a_rewrite_of_an_already_stored_revision_does_not_touch_the_reservation(
        push, couch, vault):
    doc = _note(path="Nota.md")
    await push.push([doc])
    reservation = _reservation(couch, "Nota.md")
    assert await push.push([doc]) == []
    assert _reservation(couch, "Nota.md") == reservation
