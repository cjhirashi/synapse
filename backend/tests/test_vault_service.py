"""Reglas de `VaultService` (SPEC-0003) con un doble en memoria de `VaultPort`.

Zona de coordinación: sin CouchDB ni HTTP.
"""
import base64
import copy
import json
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import pytest

from app.core.errors import (
    InvalidCursor, PreconditionFailed, PreconditionRequired, RevisionConflict,
    StorageUnavailable, VaultNameTaken, VaultNotFound,
)
from app.core.ports.vault_port import VaultPort
from app.core.schemas import VaultCreate, VaultUpdate
from app.services.vault_service import (
    RESERVATION_LEASE, VaultService, decode_cursor, encode_cursor,
)

CURSOR_ERROR = [{"parameter": "cursor", "detail": "Invalid cursor."}]


def _raw_cursor(payload) -> str:
    return base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")


# --- Cursor (RF-002, RF-003) ---

@pytest.mark.parametrize("deleted", [False, True])
def test_rf_002_cursor_round_trip(deleted):
    key = ("2026-10-12T10:00:00.000000Z", "0b8e2f4c-7b9d-4c2a-9a51-3f1e2d4c5b6a")
    assert decode_cursor(encode_cursor(deleted, *key), deleted) == key


def test_rf_002_cursor_is_opaque_url_safe_text():
    cursor = encode_cursor(False, "2026-10-12T10:00:00.000000Z", "id")
    assert set(cursor) <= set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")


@pytest.mark.parametrize(
    "cursor",
    [
        "%%%",                                   # no es base64url
        "bm90LWpzb24",                           # base64 de texto que no es JSON
        _raw_cursor([1, 2, 3]),                  # JSON que no es objeto
        _raw_cursor({"d": False, "c": "x"}),     # falta una clave
        _raw_cursor({"d": "no", "c": "x", "i": "y"}),  # tipos incorrectos
        _raw_cursor({"d": False, "c": 1, "i": "y"}),
    ],
)
def test_rf_003_unreadable_cursor_is_invalid(cursor):
    with pytest.raises(InvalidCursor) as exc:
        decode_cursor(cursor, False)
    assert exc.value.errors == CURSOR_ERROR


def test_rf_003_cursor_from_the_other_list_is_invalid():
    trash_cursor = encode_cursor(True, "2026-10-12T10:00:00.000000Z", "id")
    with pytest.raises(InvalidCursor) as exc:
        decode_cursor(trash_cursor, False)
    assert exc.value.errors == CURSOR_ERROR


# --- T-016: doble en memoria de VaultPort ---

class InMemoryVaultPort(VaultPort):
    """`VaultPort` en memoria con la semántica de `_rev` de CouchDB.

    Además permite inyectar un fallo en la próxima operación que cumpla una condición
    (`fail_next`) y ejecutar una escritura ajena justo antes del próximo `put` que la
    cumpla (`before_next_put`), para simular carreras entre lectura y escritura.
    """

    def __init__(self):
        self.docs: dict[str, dict[str, dict]] = {}
        self._failures: list[tuple[str, Callable[..., bool], Exception]] = []
        self._interleaved: list[tuple[Callable[[dict], bool], Callable[[], None]]] = []

    def fail_next(self, op: str, when: Callable[..., bool] = lambda *args: True,
                  error: Exception | None = None) -> None:
        self._failures.append((op, when, error or StorageUnavailable(f"{op} injected")))

    def before_next_put(self, action: Callable[[], None],
                        when: Callable[[dict], bool] = lambda doc: True) -> None:
        self._interleaved.append((when, action))

    def _maybe_fail(self, op: str, *args) -> None:
        for entry in self._failures:
            name, when, error = entry
            if name == op and when(*args):
                self._failures.remove(entry)
                raise error

    def get(self, db, doc_id):
        self._maybe_fail("get", db, doc_id)
        doc = self.docs.get(db, {}).get(doc_id)
        return copy.deepcopy(doc)

    def put(self, db, doc):
        for entry in self._interleaved:
            when, action = entry
            if when(doc):
                self._interleaved.remove(entry)
                action()
                break
        self._maybe_fail("put", db, doc)
        store = self.docs.setdefault(db, {})
        current = store.get(doc["_id"])
        if (current["_rev"] if current else None) != doc.get("_rev"):
            raise RevisionConflict(doc["_id"])
        generation = int(current["_rev"].split("-")[0]) + 1 if current else 1
        rev = f"{generation}-{uuid.uuid4().hex[:8]}"
        store[doc["_id"]] = {**copy.deepcopy(doc), "_rev": rev}
        return rev

    def delete(self, db, doc_id, rev):
        self._maybe_fail("delete", db, doc_id, rev)
        store = self.docs.get(db, {})
        if doc_id not in store or store[doc_id]["_rev"] != rev:
            raise RevisionConflict(doc_id)
        del store[doc_id]

    def list_page(self, db, deleted, limit, after):
        self._maybe_fail("list_page", db, deleted, limit, after)
        vaults = [
            d for d in self.docs.get(db, {}).values()
            if d.get("type") == "vault" and bool(d.get("deleted_at")) is deleted
        ]
        vaults.sort(key=lambda d: (d["created_at"], d["_id"]), reverse=True)
        if after is not None:
            vaults = [d for d in vaults if (d["created_at"], d["_id"]) < after]
        return copy.deepcopy(vaults[:limit])


DB = "synapse_user_owner"
OWNER = "7d1c9a8e-0000-4000-8000-000000000001"


class TickingClock:
    """Reloj determinista: cada llamada avanza un segundo (RFC 3339, UTC).

    `advance` salta en el tiempo, p. ej. para dejar vencer el arrendamiento de una reserva.
    """

    def __init__(self):
        self.now = datetime(2026, 10, 12, 10, 0, tzinfo=UTC)

    def __call__(self) -> str:
        self.now += timedelta(seconds=1)
        return self.now.strftime("%Y-%m-%dT%H:%M:%S.%fZ")

    def advance(self, delta: timedelta) -> None:
        self.now += delta


@pytest.fixture
def port():
    return InMemoryVaultPort()


@pytest.fixture
def clock():
    return TickingClock()


@pytest.fixture
def service(port, clock):
    return VaultService(port, DB, clock=clock)


def _create(service, name="Notas", **fields):
    return service.create(VaultCreate(name=name, **fields), OWNER)


def _reservation(port, name):
    return port.docs[DB].get(f"vault-name:{name.lower()}")


def _expired_orphan(port, name):
    """Reserva de una bóveda que no existe, tomada una hora antes del reloj de los tests."""
    port.put(DB, {"_id": f"vault-name:{name.lower()}", "type": "vault-name",
                  "vault_id": str(uuid.uuid4()), "reserved_at": "2026-10-12T09:00:00.000000Z"})


def _past_the_lease(clock):
    clock.advance(RESERVATION_LEASE)


def test_double_rejects_stale_rev_and_bumps_generation(port):
    rev1 = port.put(DB, {"_id": "x"})
    rev2 = port.put(DB, {"_id": "x", "_rev": rev1})
    assert rev2.startswith("2-")
    with pytest.raises(RevisionConflict):
        port.put(DB, {"_id": "x", "_rev": rev1})
    with pytest.raises(RevisionConflict):
        port.put(DB, {"_id": "x"})


# --- T-017: create (RF-004, RF-007, RF-017, RF-021, RF-022) ---

def test_rf_022_create_assigns_uuid4_and_stores_vault_doc(service, port):
    vault, etag = _create(service, tags=["Work"])
    assert uuid.UUID(vault.id).version == 4
    stored = port.docs[DB][f"vault:{vault.id}"]
    assert stored["type"] == "vault" and etag == f'"{stored["_rev"]}"'
    assert vault.tags == ["work"] and vault.deleted_at is None
    assert vault.created_at == vault.updated_at


def test_rf_004_create_takes_owner_from_the_caller(service):
    vault, _ = _create(service)
    assert vault.owner_id == OWNER


def test_rf_007_create_reserves_the_lowercased_name(service, port):
    vault, _ = _create(service, name="Mis Notas")
    reservation = _reservation(port, "mis notas")
    assert (reservation["type"], reservation["vault_id"]) == ("vault-name", vault.id)
    datetime.strptime(reservation["reserved_at"], "%Y-%m-%dT%H:%M:%S.%fZ")  # marca del arrendamiento


def test_rf_007_same_name_ignoring_case_is_taken_without_saving(service, port):
    _create(service, name="Notas")
    with pytest.raises(VaultNameTaken):
        _create(service, name="NOTAS")
    assert sum(d.get("type") == "vault" for d in port.docs[DB].values()) == 1


def test_rf_007_expired_orphan_reservation_is_reassigned(service, port):
    _expired_orphan(port, "Notas")
    vault, _ = _create(service, name="Notas")
    assert _reservation(port, "notas")["vault_id"] == vault.id


def test_rf_021_create_while_another_create_is_in_flight_is_409(service, port, clock):
    # PLAN-0003 §12: la reserva de `rival` ya está escrita pero su bóveda todavía no; está
    # vigente, así que bloquea aunque su bóveda aún no la use.
    rival = VaultService(port, DB, clock=clock)
    outcome = {}

    def second_create():
        with pytest.raises(VaultNameTaken):
            _create(service, name="NOTAS")
        outcome["blocked"] = True

    port.before_next_put(second_create, when=lambda doc: doc.get("type") == "vault")
    _create(rival, name="Notas")
    assert outcome == {"blocked": True}
    assert [d["name"] for d in port.docs[DB].values() if d.get("type") == "vault"] == ["Notas"]


def test_rf_021_interleaved_reservations_let_only_one_win(service, port):
    rival = VaultService(port, DB, clock=TickingClock())
    # La reserva de `rival` se cuela entre el primer intento fallido y la reasignación
    # de la huérfana: el `put` con el `_rev` leído choca y gana `rival`.
    _expired_orphan(port, "notas")
    port.before_next_put(
        lambda: _create(rival, name="notas"),
        when=lambda doc: doc["_id"] == "vault-name:notas" and "_rev" in doc,
    )
    with pytest.raises(VaultNameTaken):
        _create(service, name="Notas")
    vaults = [d for d in port.docs[DB].values() if d.get("type") == "vault"]
    assert [v["name"] for v in vaults] == ["notas"]


def test_rf_017_failed_vault_put_leaves_no_vault_and_frees_the_name_after_the_lease(
        service, port, clock):
    port.fail_next("put", when=lambda db, doc: doc["_id"].startswith("vault:"))
    with pytest.raises(StorageUnavailable):
        _create(service, name="Notas")
    assert not any(d.get("type") == "vault" for d in port.docs[DB].values())
    # Mientras el arrendamiento siga vigente, la reserva no se distingue de una en curso.
    with pytest.raises(VaultNameTaken):
        _create(service, name="Notas")
    _past_the_lease(clock)
    vault, _ = _create(service, name="Notas")  # ya es huérfana: se reasigna
    assert _reservation(port, "notas")["vault_id"] == vault.id


# --- T-019: get y update (RF-008, RF-009, RF-010, RF-014, RF-021, RF-027) ---

def test_rf_008_get_returns_the_vault_and_its_etag(service):
    created, etag = _create(service)
    assert service.get(created.id) == (created, etag)


@pytest.mark.parametrize("vault_id", [str(uuid.uuid4()), "not-a-uuid", "vault:x", ""])
def test_rf_014_missing_or_non_uuid_id_is_not_found(service, vault_id):
    with pytest.raises(VaultNotFound):
        service.get(vault_id)


def test_rf_014_doc_of_another_type_is_not_found(service, port):
    other = str(uuid.uuid4())
    port.put(DB, {"_id": f"vault:{other}", "type": "note"})
    with pytest.raises(VaultNotFound):
        service.get(other)


def test_rf_011_deleted_vault_is_not_found(service):
    created, etag = _create(service)
    service.delete(created.id, etag)
    with pytest.raises(VaultNotFound):
        service.get(created.id)


def test_rf_009_update_changes_only_sent_fields_and_renews_updated_at(service):
    created, etag = _create(service, description="d", tags=["a"])
    updated, new_etag = service.update(created.id, VaultUpdate(tags=["B"]), etag)
    assert (updated.name, updated.description, updated.tags) == ("Notas", "d", ["b"])
    assert updated.updated_at > created.updated_at and updated.created_at == created.created_at
    assert new_etag != etag


def test_rf_009_update_null_description_clears_it(service):
    created, etag = _create(service, description="d")
    updated, _ = service.update(created.id, VaultUpdate(description=None), etag)
    assert updated.description is None


def test_rf_027_rename_reserves_the_new_name_and_frees_the_old(service, port):
    created, etag = _create(service, name="Viejo")
    service.update(created.id, VaultUpdate(name="Nuevo"), etag)
    assert _reservation(port, "nuevo")["vault_id"] == created.id
    assert _reservation(port, "viejo") is None
    _create(service, name="viejo")


def test_rf_007_rename_to_a_taken_name_is_409_without_changes(service, port):
    _create(service, name="Ocupado")
    created, etag = _create(service, name="Libre")
    with pytest.raises(VaultNameTaken):
        service.update(created.id, VaultUpdate(name="ocupado"), etag)
    assert service.get(created.id) == (created, etag)


def test_rf_007_changing_only_the_case_does_not_clash_with_itself(service, port):
    created, etag = _create(service, name="notas")
    updated, _ = service.update(created.id, VaultUpdate(name="Notas"), etag)
    assert updated.name == "Notas" and _reservation(port, "notas")["vault_id"] == created.id


def test_rf_010_update_without_if_match_is_428(service):
    created, _ = _create(service)
    with pytest.raises(PreconditionRequired):
        service.update(created.id, VaultUpdate(name="Otro"), None)


def test_rf_010_update_with_stale_etag_is_412_without_changes(service, port):
    created, etag = _create(service, name="Notas")
    _, current = service.update(created.id, VaultUpdate(description="v2"), etag)
    with pytest.raises(PreconditionFailed):
        service.update(created.id, VaultUpdate(name="Otro"), etag)
    assert service.get(created.id)[1] == current
    assert _reservation(port, "otro") is None


def test_rf_010_write_between_read_and_put_is_412(service, port):
    created, etag = _create(service)
    rival = VaultService(port, DB, clock=TickingClock())
    port.before_next_put(
        lambda: rival.update(created.id, VaultUpdate(description="rival"), etag),
        when=lambda doc: doc["_id"] == f"vault:{created.id}",
    )
    with pytest.raises(PreconditionFailed):
        service.update(created.id, VaultUpdate(description="mine"), etag)
    assert service.get(created.id)[0].description == "rival"


def test_rf_021_lost_rename_race_frees_the_new_name_after_the_lease(service, port, clock):
    created, etag = _create(service, name="Viejo")
    rival = VaultService(port, DB, clock=TickingClock())
    port.before_next_put(
        lambda: rival.update(created.id, VaultUpdate(description="rival"), etag),
        when=lambda doc: doc["_id"] == f"vault:{created.id}",
    )
    with pytest.raises(PreconditionFailed):
        service.update(created.id, VaultUpdate(name="Nuevo"), etag)
    _past_the_lease(clock)
    _create(service, name="nuevo")  # la reserva que quedó apunta a una bóveda llamada "Viejo"


def test_rf_021_rename_while_another_rename_is_in_flight_is_409(service, port, clock):
    first, first_etag = _create(service, name="Uno")
    second, second_etag = _create(service, name="Dos")
    rival = VaultService(port, DB, clock=clock)
    outcome = {}

    def second_rename():
        with pytest.raises(VaultNameTaken):
            service.update(second.id, VaultUpdate(name="mismo"), second_etag)
        outcome["blocked"] = True

    port.before_next_put(second_rename, when=lambda doc: doc["_id"] == f"vault:{first.id}")
    rival.update(first.id, VaultUpdate(name="Mismo"), first_etag)
    assert outcome == {"blocked": True}
    assert service.get(second.id)[0].name == "Dos"


def test_rf_021_late_release_keeps_a_reservation_taken_by_another_vault(service, port, clock):
    # `left` deja "Mismo" pero su liberación falla; vencido el arrendamiento, `taker` reasigna
    # la reserva y, antes de que escriba su bóveda, llega la liberación tardía de `left`:
    # no debe borrar una reserva que ya no es suya (dejaría "Mismo" sin reserva).
    left, left_etag = _create(service, name="Mismo")
    taker, taker_etag = _create(service, name="Otro")
    port.fail_next("delete")
    service.update(left.id, VaultUpdate(name="Fuera"), left_etag)
    _past_the_lease(clock)
    port.before_next_put(lambda: service._release("Mismo", left.id),
                         when=lambda doc: doc["_id"] == f"vault:{taker.id}")
    service.update(taker.id, VaultUpdate(name="Mismo"), taker_etag)
    assert _reservation(port, "mismo")["vault_id"] == taker.id


# --- T-021: delete y restore (RF-010, RF-011, RF-013, RF-025, RF-026, RF-027) ---

def test_rf_011_delete_sets_deleted_at_and_keeps_the_data(service, port):
    created, etag = _create(service, description="d", tags=["a"])
    assert service.delete(created.id, etag) is None
    stored = port.docs[DB][f"vault:{created.id}"]
    assert stored["deleted_at"] and (stored["description"], stored["tags"]) == ("d", ["a"])


def test_rf_027_delete_frees_the_name(service, port):
    created, etag = _create(service, name="Notas")
    service.delete(created.id, etag)
    assert _reservation(port, "notas") is None
    _create(service, name="notas")


def test_rf_026_delete_of_a_deleted_vault_is_404(service):
    created, etag = _create(service)
    service.delete(created.id, etag)
    with pytest.raises(VaultNotFound):
        service.delete(created.id, etag)


def test_rf_013_restore_clears_deleted_at(service, port):
    created, etag = _create(service, name="Notas")
    service.delete(created.id, etag)
    deleted_etag = f'"{port.docs[DB][f"vault:{created.id}"]["_rev"]}"'
    restored, new_etag = service.restore(created.id, deleted_etag)
    assert restored.deleted_at is None and new_etag != deleted_etag
    assert service.get(created.id) == (restored, new_etag)
    assert _reservation(port, "notas")["vault_id"] == created.id


def test_rf_026_restore_of_an_active_vault_is_404(service):
    created, etag = _create(service)
    with pytest.raises(VaultNotFound):
        service.restore(created.id, etag)


def test_rf_025_restore_with_a_taken_name_is_409_and_stays_deleted(service, port):
    created, etag = _create(service, name="Notas")
    service.delete(created.id, etag)
    _create(service, name="NOTAS")
    deleted_etag = f'"{port.docs[DB][f"vault:{created.id}"]["_rev"]}"'
    with pytest.raises(VaultNameTaken):
        service.restore(created.id, deleted_etag)
    assert port.docs[DB][f"vault:{created.id}"]["deleted_at"]


@pytest.mark.parametrize("operation", ["delete", "restore"])
def test_rf_010_delete_and_restore_need_a_current_if_match(service, port, operation):
    created, etag = _create(service)
    if operation == "restore":
        service.delete(created.id, etag)
    stale = '"0-stale"'
    with pytest.raises(PreconditionRequired):
        getattr(service, operation)(created.id, None)
    with pytest.raises(PreconditionFailed):
        getattr(service, operation)(created.id, stale)


# --- T-023: list (RF-001, RF-002, RF-003, RF-012, RF-024) ---

class RecordingPort(InMemoryVaultPort):
    def __init__(self):
        super().__init__()
        self.calls = []

    def list_page(self, db, deleted, limit, after):
        self.calls.append((db, deleted, limit, after))
        return super().list_page(db, deleted, limit, after)


def test_rf_002_list_asks_one_more_and_sets_next_cursor_only_if_there_is_more():
    port = RecordingPort()
    service = VaultService(port, DB, clock=TickingClock())
    created = [_create(service, name=f"v{i}")[0] for i in range(3)]
    first = service.list(deleted=False, limit=2, cursor=None)
    assert port.calls[-1] == (DB, False, 3, None)
    assert [v.id for v in first.items] == [created[2].id, created[1].id]
    assert first.next_cursor is not None
    last = service.list(deleted=False, limit=2, cursor=first.next_cursor)
    assert port.calls[-1][3] == (created[1].created_at, f"vault:{created[1].id}")
    assert [v.id for v in last.items] == [created[0].id] and last.next_cursor is None


def test_rf_002_exact_fit_has_no_next_cursor(service):
    for i in range(2):
        _create(service, name=f"v{i}")
    assert service.list(deleted=False, limit=2, cursor=None).next_cursor is None


def test_rf_012_list_of_the_trash_passes_deleted_and_returns_deleted_vaults(service):
    kept, _ = _create(service, name="kept")
    gone, etag = _create(service, name="gone")
    service.delete(gone.id, etag)
    assert [v.id for v in service.list(deleted=False, limit=10, cursor=None).items] == [kept.id]
    [trashed] = service.list(deleted=True, limit=10, cursor=None).items
    assert trashed.id == gone.id and trashed.deleted_at


def test_rf_003_trash_cursor_on_the_normal_list_is_invalid(service):
    for i in range(2):
        created, etag = _create(service, name=f"v{i}")
        service.delete(created.id, etag)
    trash_cursor = service.list(deleted=True, limit=1, cursor=None).next_cursor
    with pytest.raises(InvalidCursor):
        service.list(deleted=False, limit=1, cursor=trash_cursor)
