"""Push validado de la sincronización (SPEC-0005 RF-005…RF-008, RF-011; PLAN-0005 §2.3).

Zona de coordinación: sin CouchDB ni HTTP. `InMemoryCouch` es un doble con árbol de
revisiones que implementa a la vez `VaultPort` (lo que usa `VaultService`) y
`ReplicationPort` (lo que usa el push): las dos vistas comparten los mismos datos, como en
CouchDB real.
"""
import inspect
import uuid
from collections.abc import Callable

import pytest

from app.core.errors import RevisionConflict, StorageUnavailable, VaultNameTaken
from app.core.ports.replication_port import ReplicationPort
from app.core.ports.vault_port import VaultPort
from app.core.schemas import VaultCreate
from app.services.sync_push import SyncPushService
from app.services.vault_service import RESERVATION_LEASE, VaultService, name_key
from tests.test_vault_service import TickingClock

pytestmark = pytest.mark.asyncio

DB = "synapse_user_owner"
OWNER = "7d1c9a8e-0000-4000-8000-000000000001"
OTHER_OWNER = "7d1c9a8e-0000-4000-8000-000000000002"
T0 = "2026-10-12T09:00:00.000000Z"
T1 = "2026-10-12T09:30:00.000000Z"


# --- T-018: doble de CouchDB con ramas ---

def _split(rev: str) -> tuple[int, str]:
    generation, rev_hash = rev.split("-", 1)
    return int(generation), rev_hash


class InMemoryCouch(VaultPort, ReplicationPort):
    """Árbol de revisiones por documento con la semántica de CouchDB que usa el push.

    - `put`/`delete` (`VaultPort`) exigen el `_rev` de la ganadora, como `new_edits: true`.
    - `bulk_docs_replicated` inserta revisiones con su historia (`new_edits: false`): crea
      ramas sin conflicto 409.
    - Ganadora determinista de CouchDB: hojas vivas antes que lápidas; luego mayor
      generación; luego mayor hash (comparado como texto).
    - `fail_next(op)` hace fallar la próxima llamada a `op`; `before_next(op, action)`
      ejecuta `action` (síncrona, o `async` en operaciones async) justo antes de ella, para
      intercalar escrituras ajenas. `calls` registra cada operación.
    Las lecturas del replicador que el push no usa no están implementadas.
    """

    def __init__(self):
        # db → doc_id → rev → (rev padre o None, cuerpo o None si sólo se conoce el id)
        self.trees: dict[str, dict[str, dict[str, tuple[str | None, dict | None]]]] = {}
        self.calls: list[tuple[str, str]] = []
        self.bulk_errors: list[dict] | None = None  # respuesta de error de la próxima escritura
        self._failures: list[tuple[str, Exception]] = []
        self._interleaved: list[tuple[str, Callable]] = []

    # --- Inyección ---

    def fail_next(self, op: str, error: Exception | None = None) -> None:
        self._failures.append((op, error or StorageUnavailable(f"{op} injected")))

    def before_next(self, op: str, action: Callable) -> None:
        self._interleaved.append((op, action))

    def _take(self, entries: list, op: str):
        for entry in entries:
            if entry[0] == op:
                entries.remove(entry)
                return entry[1]
        return None

    def _enter(self, op: str, doc_id: str) -> None:
        action = self._take(self._interleaved, op)
        if action:
            action()
        self._check(op, doc_id)

    async def _aenter(self, op: str, doc_id: str) -> None:
        action = self._take(self._interleaved, op)
        if action:
            result = action()
            if inspect.isawaitable(result):
                await result
        self._check(op, doc_id)

    def _check(self, op: str, doc_id: str) -> None:
        self.calls.append((op, doc_id))
        error = self._take(self._failures, op)
        if error:
            raise error

    # --- Árbol ---

    def _tree(self, db: str, doc_id: str) -> dict[str, tuple[str | None, dict | None]]:
        return self.trees.setdefault(db, {}).setdefault(doc_id, {})

    @staticmethod
    def _leaf_revs(tree: dict) -> list[str]:
        parents = {parent for parent, _ in tree.values() if parent}
        return [rev for rev in tree if rev not in parents]

    def _winner(self, tree: dict) -> str | None:
        leaves = self._leaf_revs(tree)
        if not leaves:
            return None
        return max(leaves, key=lambda rev: (not tree[rev][1].get("_deleted"), _split(rev)))

    def _with_history(self, tree: dict, rev: str) -> dict:
        ids, current = [], rev
        while current:
            ids.append(_split(current)[1])
            current = tree[current][0]
        return {**tree[rev][1], "_revisions": {"start": _split(rev)[0], "ids": ids}}

    def winner(self, db: str, doc_id: str) -> dict | None:
        """La revisión ganadora (viva o lápida), para las comprobaciones de los tests."""
        tree = self._tree(db, doc_id)
        rev = self._winner(tree)
        return dict(tree[rev][1]) if rev else None

    def live_leaves(self, db: str, doc_id: str) -> list[dict]:
        tree = self._tree(db, doc_id)
        return [dict(tree[r][1]) for r in self._leaf_revs(tree) if not tree[r][1].get("_deleted")]

    # --- VaultPort ---

    def get(self, db, doc_id):
        self._enter("get", doc_id)
        doc = self.winner(db, doc_id)
        return None if doc is None or doc.get("_deleted") else doc

    def put(self, db, doc):
        self._enter("put", doc["_id"])
        tree = self._tree(db, doc["_id"])
        winner = self._winner(tree)
        live = winner is not None and not tree[winner][1].get("_deleted")
        if (winner if live else None) != doc.get("_rev"):
            raise RevisionConflict(doc["_id"])
        generation = _split(winner)[0] + 1 if winner else 1
        rev = f"{generation}-{uuid.uuid4().hex}"
        tree[rev] = (winner, {**doc, "_rev": rev})
        return rev

    def delete(self, db, doc_id, rev):
        self._enter("delete", doc_id)
        tree = self._tree(db, doc_id)
        winner = self._winner(tree)
        if winner != rev or tree[winner][1].get("_deleted"):
            raise RevisionConflict(doc_id)
        tombstone = f"{_split(rev)[0] + 1}-{uuid.uuid4().hex}"
        tree[tombstone] = (rev, {"_id": doc_id, "_rev": tombstone, "_deleted": True})

    def list_page(self, db, deleted, limit, after):
        self._enter("list_page", "")
        vaults = [
            doc for doc_id in self.trees.get(db, {})
            if (doc := self.get(db, doc_id)) and doc.get("type") == "vault"
            and bool(doc.get("deleted_at")) is deleted
        ]
        vaults.sort(key=lambda d: (d["created_at"], d["_id"]), reverse=True)
        if after is not None:
            vaults = [d for d in vaults if (d["created_at"], d["_id"]) < after]
        return vaults[:limit]

    def leaves(self, db, doc_id):
        self._enter("leaves", doc_id)
        tree = self._tree(db, doc_id)
        return [
            self._with_history(tree, rev) for rev in self._leaf_revs(tree)
            if not tree[rev][1].get("_deleted")
        ]

    # --- ReplicationPort ---

    async def revs_diff(self, db, body):
        await self._aenter("revs_diff", ",".join(body))
        diff = {}
        for doc_id, revs in body.items():
            missing = [rev for rev in revs if rev not in self._tree(db, doc_id)]
            if missing:
                diff[doc_id] = {"missing": missing}
        return diff

    async def bulk_docs_replicated(self, db, docs):
        await self._aenter("bulk_docs_replicated", ",".join(d["_id"] for d in docs))
        if self.bulk_errors is not None:
            errors, self.bulk_errors = self.bulk_errors, None
            return errors
        for doc in docs:
            body = {k: v for k, v in doc.items() if k != "_revisions"}
            tree = self._tree(db, doc["_id"])
            history = doc.get("_revisions") or {"start": _split(doc["_rev"])[0], "ids": [_split(doc["_rev"])[1]]}
            revs = [f"{history['start'] - i}-{h}" for i, h in enumerate(history["ids"])]
            for i, rev in enumerate(revs):
                if rev not in tree:
                    parent = revs[i + 1] if i + 1 < len(revs) else None
                    tree[rev] = (parent, body if i == 0 else None)
        return []

    async def db_info(self, db):
        raise NotImplementedError("not used by the push")

    async def changes(self, db, query, body):
        raise NotImplementedError("not used by the push")

    async def bulk_get(self, db, query, body):
        raise NotImplementedError("not used by the push")

    async def all_docs(self, db, query, body):
        raise NotImplementedError("not used by the push")

    async def get_local(self, db, local_id):
        raise NotImplementedError("not used by the push")

    async def put_local(self, db, local_id, doc):
        raise NotImplementedError("not used by the push")


# --- Fixtures y ayudas ---

@pytest.fixture
def couch():
    return InMemoryCouch()


@pytest.fixture
def clock():
    return TickingClock()


@pytest.fixture
def vaults(couch, clock):
    return VaultService(couch, DB, clock=clock)


@pytest.fixture
def push(vaults, couch):
    return SyncPushService(vaults, couch, couch, DB, OWNER)


def _new_id() -> str:
    return f"vault:{uuid.uuid4()}"


def _revisions(rev: str, parents: tuple[str, ...]) -> dict:
    return {"start": _split(rev)[0], "ids": [_split(r)[1] for r in (rev, *parents)]}


def _vault(doc_id: str | None = None, rev: str = "1-aaa", parents: tuple[str, ...] = (), **fields) -> dict:
    """Revisión válida de una bóveda, como la escribe el cliente (ya normalizada)."""
    return {
        "_id": doc_id or _new_id(), "_rev": rev, "_revisions": _revisions(rev, parents),
        "type": "vault", "name": "Notas", "description": None, "tags": [],
        "owner_id": OWNER, "created_at": T0, "updated_at": T0, "deleted_at": None,
        **fields,
    }


def _tombstone(doc_id: str, rev: str, parents: tuple[str, ...], **extra) -> dict:
    return {"_id": doc_id, "_rev": rev, "_revisions": _revisions(rev, parents), "_deleted": True, **extra}


def _rejected(doc: dict, reason: str) -> dict:
    return {"id": doc["_id"], "rev": doc["_rev"], "error": "forbidden", "reason": reason}


def _reservation(couch, name: str) -> dict | None:
    return couch.get(DB, f"vault-name:{name_key(name)}")


def _stored(couch, doc: dict) -> bool:
    return doc["_rev"] in couch.trees.get(DB, {}).get(doc["_id"], {})


def _vault_id(doc: dict) -> str:
    return doc["_id"].removeprefix("vault:")


# --- T-019: id, revisión ya almacenada y lápidas (RF-005, RF-007) ---

INVALID_IDS = [
    "vault:not-a-uuid",
    "vault:6F1C2D3E-4A5B-4C6D-8E9F-0A1B2C3D4E5F",  # no canónico (mayúsculas)
    "vault-name:notas",
    "_design/vaults",
    "_local/checkpoint",  # los checkpoints van por su propia ruta
    "note:6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f",
]


@pytest.mark.parametrize("doc_id", INVALID_IDS)
async def test_rf_007_invalid_id_is_rejected_and_the_rest_is_saved(push, couch, doc_id):
    bad, good = _vault(doc_id), _vault(name="Otra")
    assert await push.push([bad, good]) == [_rejected(bad, "invalid-id")]
    assert not _stored(couch, bad) and _stored(couch, good)


async def test_rf_007_invalid_id_is_not_looked_up_in_couchdb(push, couch):
    await push.push([_vault("vault-name:notas")])
    assert not any("vault-name:notas" in doc_id for _, doc_id in couch.calls)


async def test_rf_005_valid_revision_is_saved_with_its_rev_and_history(push, couch):
    doc = _vault(description="d", tags=["a", "b"])
    assert await push.push([doc]) == []
    assert couch.winner(DB, doc["_id"]) == {k: v for k, v in doc.items() if k != "_revisions"}


async def test_rf_005_already_stored_revision_is_accepted_without_writing_or_reserving(push, couch):
    doc = _vault()
    await push.push([doc])
    reservation = _reservation(couch, "Notas")
    couch.calls.clear()
    assert await push.push([doc]) == []
    assert [op for op, _ in couch.calls] == ["revs_diff"]
    assert _reservation(couch, "Notas") == reservation


async def test_rf_005_tombstone_of_the_only_leaf_is_not_allowed(push, couch):
    doc = _vault()
    await push.push([doc])
    tombstone = _tombstone(doc["_id"], "2-ddd", ("1-aaa",))
    assert await push.push([tombstone]) == [_rejected(tombstone, "delete-not-allowed")]
    assert couch.winner(DB, doc["_id"])["_rev"] == "1-aaa"


async def _conflicted(push, doc_id: str, names=("Uno", "Dos")) -> None:
    """Bóveda con dos hojas vivas 2-bbb y 2-ccc sobre 1-aaa."""
    assert await push.push([
        _vault(doc_id, "1-aaa", name=names[0]),
        _vault(doc_id, "2-bbb", ("1-aaa",), name=names[0]),
        _vault(doc_id, "2-ccc", ("1-aaa",), name=names[1]),
    ]) == []


async def test_rf_005_tombstone_closing_one_branch_of_a_conflict_is_accepted(push, couch):
    doc_id = _new_id()
    await _conflicted(push, doc_id)
    assert await push.push([_tombstone(doc_id, "3-ddd", ("2-ccc", "1-aaa"))]) == []
    assert [leaf["_rev"] for leaf in couch.live_leaves(DB, doc_id)] == ["2-bbb"]


async def test_rf_005_tombstones_closing_every_branch_leave_the_last_one_alive(push, couch):
    doc_id = _new_id()
    await _conflicted(push, doc_id)
    first = _tombstone(doc_id, "3-ddd", ("2-ccc", "1-aaa"))
    second = _tombstone(doc_id, "3-eee", ("2-bbb", "1-aaa"))
    assert await push.push([first, second]) == [_rejected(second, "delete-not-allowed")]
    assert [leaf["_rev"] for leaf in couch.live_leaves(DB, doc_id)] == ["2-bbb"]


async def test_rf_005_each_batch_reads_the_current_leaves(push, couch, vaults):
    doc_id = _new_id()
    await push.push([_vault(doc_id)])
    other = SyncPushService(vaults, couch, couch, DB, OWNER)  # otra réplica abre un conflicto
    await other.push([_vault(doc_id, "2-bbb", ("1-aaa",)), _vault(doc_id, "2-ccc", ("1-aaa",), name="Dos")])
    assert await push.push([_tombstone(doc_id, "3-ddd", ("2-ccc", "1-aaa"))]) == []


@pytest.mark.parametrize("tombstone", [
    pytest.param(lambda doc_id: _tombstone(doc_id, "3-ddd", ("2-ccc", "1-aaa"), name="x"), id="extra-body"),
    pytest.param(lambda doc_id: _tombstone(doc_id, "3-ddd", ("2-zzz", "1-aaa")), id="unknown-parent"),
    pytest.param(lambda doc_id: _tombstone(doc_id, "2-ddd", ("1-aaa",)), id="parent-not-a-leaf"),
    pytest.param(lambda doc_id: _tombstone(doc_id, "1-ddd", ()), id="no-parent"),
])
async def test_rf_005_other_tombstones_are_not_allowed(push, couch, tombstone):
    doc_id = _new_id()
    await _conflicted(push, doc_id)
    doc = tombstone(doc_id)
    assert await push.push([doc]) == [_rejected(doc, "delete-not-allowed")]
    assert len(couch.live_leaves(DB, doc_id)) == 2


# --- T-020: forma, campos y reglas del servidor (RF-005, RF-001) ---

SHAPE_CASES = [
    ({"_attachments": {}}, "validation-error:_attachments"),
    ({"_conflicts": ["2-x"]}, "validation-error:_conflicts"),
    ({"_deleted": False}, "validation-error:_deleted"),  # sólo `_deleted: true` es lápida
    ({"_deleted": "yes"}, "validation-error:_deleted"),
    ({"color": "red"}, "validation-error:color"),
    ({"type": "note"}, "validation-error:type"),
    ({"_rev": "abc"}, "validation-error:_rev"),
    ({"_rev": "0-aaa", "_revisions": {"start": 0, "ids": ["aaa"]}}, "validation-error:_rev"),
    ({"_rev": 1}, "validation-error:_rev"),
    ({"_revisions": {"start": 2, "ids": ["aaa"]}}, "validation-error:_revisions"),
    ({"_revisions": {"start": 1, "ids": ["bbb"]}}, "validation-error:_revisions"),
    ({"_revisions": {"start": 1, "ids": []}}, "validation-error:_revisions"),
    ({"_revisions": None}, "validation-error:_revisions"),
]


@pytest.mark.parametrize(("change", "reason"), SHAPE_CASES)
async def test_rf_005_bad_shape_is_rejected(push, couch, change, reason):
    doc = _vault(**change)
    assert await push.push([doc]) == [_rejected(doc, reason)]
    assert _reservation(couch, "Notas") is None


@pytest.mark.parametrize("missing", ["_revisions", "type", "name", "description", "tags",
                                     "owner_id", "created_at", "updated_at", "deleted_at"])
async def test_rf_005_missing_key_is_rejected(push, missing):
    doc = _vault()
    del doc[missing]
    assert await push.push([doc]) == [_rejected(doc, f"validation-error:{missing}")]


FIELD_CASES = [
    ({"name": ""}, "validation-error:name"),
    ({"name": "x" * 101}, "validation-error:name"),
    ({"name": "a\u0007b"}, "validation-error:name"),
    ({"name": 5}, "validation-error:name"),
    ({"name": None}, "validation-error:name"),
    ({"name": " Notas"}, "not-normalized:name"),
    ({"description": "d" * 2001}, "validation-error:description"),
    ({"description": 3}, "validation-error:description"),
    ({"tags": "work"}, "validation-error:tags"),
    ({"tags": ["t"] * 21}, "validation-error:tags"),
    ({"tags": ["x" * 33]}, "validation-error:tags"),
    ({"tags": ["Work"]}, "not-normalized:tags"),
    ({"tags": ["a", "a"]}, "not-normalized:tags"),
    ({"tags": [" a"]}, "not-normalized:tags"),
]


@pytest.mark.parametrize(("change", "reason"), FIELD_CASES)
async def test_rf_005_fields_follow_the_rest_rules_without_normalizing(push, couch, change, reason):
    doc = _vault(**change)
    assert await push.push([doc]) == [_rejected(doc, reason)]
    assert not _stored(couch, doc)


async def test_rf_001_owner_must_be_the_session_user(push, couch):
    doc = _vault(owner_id=OTHER_OWNER)
    assert await push.push([doc]) == [_rejected(doc, "owner-mismatch")]


@pytest.mark.parametrize(("change", "reason"), [
    ({"created_at": "2026-10-12"}, "validation-error:created_at"),
    ({"created_at": None}, "validation-error:created_at"),
    ({"updated_at": "2026-10-12T09:00:00Z"}, "validation-error:updated_at"),
    ({"deleted_at": "yesterday"}, "validation-error:deleted_at"),
])
async def test_rf_005_timestamps_use_the_server_format(push, change, reason):
    doc = _vault(**change)
    assert await push.push([doc]) == [_rejected(doc, reason)]


async def test_rf_005_dates_are_not_compared_with_the_server_clock(push, couch):
    doc = _vault(created_at="2099-01-01T00:00:00.000000Z", updated_at="1999-01-01T00:00:00.000000Z")
    assert await push.push([doc]) == []


async def test_rf_005_created_at_is_immutable(push, couch):
    doc = _vault()
    await push.push([doc])
    changed = _vault(doc["_id"], "2-bbb", ("1-aaa",), created_at=T1)
    assert await push.push([changed]) == [_rejected(changed, "immutable-field:created_at")]


async def test_rf_005_one_rejection_per_document_with_the_first_failing_rule(push):
    doc = _vault("vault:bad", owner_id=OTHER_OWNER, name="")
    assert await push.push([doc]) == [_rejected(doc, "invalid-id")]


# --- T-021: reservas de nombre (RF-005, RF-006, RF-008, RF-011) ---

async def test_rf_008_new_vault_reserves_its_name(push, couch):
    doc = _vault(name="Mis Notas")
    await push.push([doc])
    assert _reservation(couch, "mis notas")["vault_id"] == _vault_id(doc)


async def test_rf_008_rename_reserves_the_new_name_and_frees_the_old(push, couch):
    doc = _vault(name="Viejo")
    await push.push([doc])
    assert await push.push([_vault(doc["_id"], "2-bbb", ("1-aaa",), name="Nuevo")]) == []
    assert _reservation(couch, "Viejo") is None
    assert _reservation(couch, "Nuevo")["vault_id"] == _vault_id(doc)


async def test_rf_011_delete_frees_the_name_and_restore_takes_it_again(push, couch):
    doc = _vault()
    await push.push([doc])
    await push.push([_vault(doc["_id"], "2-bbb", ("1-aaa",), deleted_at=T1)])
    assert _reservation(couch, "Notas") is None
    await push.push([_vault(doc["_id"], "3-ccc", ("2-bbb", "1-aaa"))])
    assert _reservation(couch, "Notas")["vault_id"] == _vault_id(doc)


async def test_rf_008_deleted_vault_does_not_reserve(push, couch):
    await push.push([_vault(deleted_at=T1)])
    assert _reservation(couch, "Notas") is None


async def test_rf_008_name_taken_by_another_vault_is_rejected(push, couch, vaults):
    vaults.create(VaultCreate(name="Notas"), OWNER)
    doc = _vault(name="NOTAS")
    assert await push.push([doc]) == [_rejected(doc, "vault-name-taken")]
    assert not _stored(couch, doc)


async def test_rf_008_losing_branch_with_the_name_of_another_vault_is_rejected(push, couch, vaults):
    vaults.create(VaultCreate(name="Notas"), OWNER)
    doc = _vault(name="Otro")
    await push.push([doc])
    branch = _vault(doc["_id"], "2-ccc", ("1-aaa",), name="Notas")
    assert await push.push([branch]) == [_rejected(branch, "vault-name-taken")]


async def test_rf_008_every_live_branch_keeps_its_reservation(push, couch, vaults):
    doc_id = _new_id()
    await _conflicted(push, doc_id, names=("Uno", "Dos"))
    for name in ("Uno", "Dos"):
        assert _reservation(couch, name)["vault_id"] == doc_id.removeprefix("vault:")
    with pytest.raises(VaultNameTaken):
        vaults.create(VaultCreate(name="Dos"), OWNER)


async def test_rf_008_only_names_no_leaf_uses_are_released(push, couch):
    doc_id = _new_id()
    await _conflicted(push, doc_id, names=("Uno", "Dos"))
    assert await push.push([_vault(doc_id, "3-ddd", ("2-bbb", "1-aaa"), name="Tres")]) == []
    assert _reservation(couch, "Uno") is None
    assert _reservation(couch, "Dos") and _reservation(couch, "Tres")


async def test_rf_008_losing_branch_that_becomes_the_winner_already_holds_its_name(
        push, couch, vaults, clock):
    doc_id = _new_id()
    await _conflicted(push, doc_id, names=("Uno", "Dos"))  # gana 2-ccc ("Dos")
    await push.push([_tombstone(doc_id, "3-ddd", ("2-ccc", "1-aaa"))])
    assert couch.winner(DB, doc_id)["name"] == "Uno"
    clock.advance(RESERVATION_LEASE)
    with pytest.raises(VaultNameTaken):
        vaults.create(VaultCreate(name="uno"), OWNER)
    assert _reservation(couch, "Dos") is None  # ya no lo usa ninguna hoja


async def test_rf_006_mixed_batch_rejects_one_and_saves_the_rest(push, couch, vaults):
    vaults.create(VaultCreate(name="Ocupado"), OWNER)
    first, taken, last = _vault(name="A"), _vault(name="Ocupado"), _vault(name="B")
    assert await push.push([first, taken, last]) == [_rejected(taken, "vault-name-taken")]
    assert _stored(couch, first) and _stored(couch, last) and not _stored(couch, taken)


async def test_rf_008_two_interleaved_batches_with_the_same_name_save_only_one(push, couch, vaults):
    rival = SyncPushService(vaults, couch, couch, DB, OWNER)
    mine, theirs = _vault(name="Mismo"), _vault(name="mismo")
    outcome = {}

    async def rival_push():  # entra entre la reserva y la escritura del primer lote
        outcome["rival"] = await rival.push([theirs])

    couch.before_next("bulk_docs_replicated", rival_push)
    assert await push.push([mine]) == []
    assert outcome["rival"] == [_rejected(theirs, "vault-name-taken")]
    assert _stored(couch, mine) and not _stored(couch, theirs)


async def test_rf_008_rest_and_sync_never_leave_two_active_vaults_with_one_name(push, couch, vaults):
    doc = _vault(name="Mismo")
    couch.before_next("bulk_docs_replicated",
                      lambda: pytest.raises(VaultNameTaken, vaults.create, VaultCreate(name="MISMO"), OWNER))
    assert await push.push([doc]) == []
    active = [d for d in couch.list_page(DB, deleted=False, limit=10, after=None)]
    assert [d["name"] for d in active] == ["Mismo"]


async def test_rf_019_write_error_is_storage_unavailable_and_the_name_frees_after_the_lease(
        push, couch, vaults, clock):
    doc = _vault()
    couch.fail_next("bulk_docs_replicated")
    with pytest.raises(StorageUnavailable):
        await push.push([doc])
    assert not _stored(couch, doc)
    clock.advance(RESERVATION_LEASE)
    created, _ = vaults.create(VaultCreate(name="Notas"), OWNER)
    assert _reservation(couch, "Notas")["vault_id"] == created.id


async def test_rf_019_per_document_write_error_is_storage_unavailable(push, couch):
    couch.bulk_errors = [{"id": "vault:x", "rev": "1-aaa", "error": "unknown_error", "reason": "x"}]
    with pytest.raises(StorageUnavailable):
        await push.push([_vault()])


async def test_rf_019_retry_after_a_write_error_is_accepted(push, couch):
    doc = _vault()
    couch.fail_next("bulk_docs_replicated")
    with pytest.raises(StorageUnavailable):
        await push.push([doc])
    assert await push.push([doc]) == []
    assert _stored(couch, doc) and _reservation(couch, "Notas")["vault_id"] == _vault_id(doc)


@pytest.mark.parametrize("op", ["revs_diff", "leaves", "put"])
async def test_rf_019_storage_failure_before_writing_propagates(push, couch, op):
    couch.fail_next(op)
    with pytest.raises(StorageUnavailable):
        await push.push([_vault()])


async def test_rf_005_empty_batch_touches_nothing(push, couch):
    assert await push.push([]) == []
    assert couch.calls == []
