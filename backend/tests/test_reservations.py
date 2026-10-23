"""Reservas de unicidad compartidas (SPEC-0008 RF-011, RF-013; PLAN-0008 §2.2).

`Reservations` es el algoritmo que `VaultService` usaba en línea para `vault-name:*`
(PLAN-0003 §12, §15), extraído para que lo compartan las rutas de nota. Se prueba aquí con
el doble de `VaultPort` de 0003 y un tipo de reserva distinto del de las bóvedas
(`note-path` / `note_id`), para fijar que nada depende de la forma de `vault-name`.
"""
from datetime import timedelta

import pytest

from app.core.errors import RevisionConflict, StorageUnavailable
from app.services.reservations import RESERVATION_LEASE, ReservationTaken, Reservations
from tests.test_vault_service import DB, InMemoryVaultPort, TickingClock

KEY = "note-path:v1:a.md"


@pytest.fixture
def port():
    return InMemoryVaultPort()


@pytest.fixture
def clock():
    return TickingClock()


@pytest.fixture
def reservations(port, clock):
    return Reservations(port, DB, clock, kind="note-path", owner_field="note_id")


def _never(_reservation) -> bool:
    return False


def _always(_reservation) -> bool:
    return True


def _expired_orphan(port, owner="gone"):
    """Reserva de un dueño que ya no la usa, tomada una hora antes del reloj de los tests."""
    port.put(DB, {"_id": KEY, "type": "note-path", "note_id": owner,
                  "reserved_at": "2026-10-12T09:00:00.000000Z"})


def test_rf_013_reserve_writes_the_reservation_document(reservations, port):
    reservations.reserve(KEY, "n1", _never)
    doc = port.docs[DB][KEY]
    assert {k: doc[k] for k in ("_id", "type", "note_id")} == {
        "_id": KEY, "type": "note-path", "note_id": "n1"}
    assert doc["reserved_at"].endswith("Z")


def test_rf_013_the_owner_can_rewrite_its_own_reservation(reservations, port):
    reservations.reserve(KEY, "n1", _never)
    first_rev = port.docs[DB][KEY]["_rev"]
    reservations.reserve(KEY, "n1", _never)
    # La reescritura cambia el `_rev`: así choca una liberación tardía que leyó el anterior.
    assert port.docs[DB][KEY]["_rev"] != first_rev
    assert port.docs[DB][KEY]["note_id"] == "n1"


def test_rf_013_a_reservation_in_use_by_its_holder_is_taken(reservations, port, clock):
    reservations.reserve(KEY, "n1", _never)
    clock.advance(RESERVATION_LEASE)  # fuera del arrendamiento: sólo decide `holds`
    with pytest.raises(ReservationTaken):
        reservations.reserve(KEY, "n2", _always)
    assert port.docs[DB][KEY]["note_id"] == "n1"


def test_rf_013_a_reservation_inside_its_lease_is_taken_even_if_unused(reservations, port):
    # La reserva se escribe antes que el documento: una escritura en curso no se distingue
    # de una que falló (PLAN-0003 §12).
    reservations.reserve(KEY, "n1", _never)
    with pytest.raises(ReservationTaken):
        reservations.reserve(KEY, "n2", _never)


def test_rf_013_an_expired_unused_reservation_is_reassigned(reservations, port):
    _expired_orphan(port)
    reservations.reserve(KEY, "n2", _never)
    assert port.docs[DB][KEY]["note_id"] == "n2"


@pytest.mark.parametrize(("age", "leased"), [
    (RESERVATION_LEASE - timedelta(microseconds=1), True),
    (RESERVATION_LEASE, False),
])
def test_rf_013_the_lease_is_exactly_thirty_seconds(port, age, leased):
    start = TickingClock()
    reserved = start()
    reservations = Reservations(port, DB, start, kind="note-path", owner_field="note_id")
    start.advance(age - timedelta(seconds=1))  # la llamada siguiente del reloj suma 1 s
    assert reservations.leased({"reserved_at": reserved}) is leased


def test_rf_013_a_reservation_deleted_between_the_conflict_and_the_read_is_recreated(
        reservations, port):
    reservations.reserve(KEY, "n1", _never)
    stale = port.docs[DB][KEY]["_rev"]
    # El primer `put` (sin `_rev`) choca; justo antes de releer, la reserva desaparece.
    port.before_next_get(lambda: port.delete(DB, KEY, stale))
    reservations.reserve(KEY, "n2", _never)
    assert port.docs[DB][KEY]["note_id"] == "n2"


def test_rf_013_the_losing_writer_of_an_interleaved_reservation_is_rejected(reservations, port):
    # Entre la lectura de la huérfana y su reescritura otra petición toma la reserva: el
    # `put` con el `_rev` leído choca y se vuelve a decidir (gana la primera).
    _expired_orphan(port)
    rival = Reservations(port, DB, TickingClock(), kind="note-path", owner_field="note_id")
    port.before_next_put(
        lambda: rival.reserve(KEY, "rival", _never),
        when=lambda doc: doc["_id"] == KEY and "_rev" in doc,
    )
    with pytest.raises(ReservationTaken):
        reservations.reserve(KEY, "n2", _never)
    assert port.docs[DB][KEY]["note_id"] == "rival"


def test_rf_011_release_deletes_an_unused_reservation_of_the_owner(reservations, port):
    reservations.reserve(KEY, "n1", _never)
    reservations.release(KEY, "n1", _never)
    assert KEY not in port.docs[DB]


def test_rf_011_release_keeps_a_reservation_still_in_use(reservations, port):
    reservations.reserve(KEY, "n1", _never)
    reservations.release(KEY, "n1", _always)
    assert port.docs[DB][KEY]["note_id"] == "n1"


def test_rf_011_release_keeps_a_reservation_reassigned_to_another_owner(
        reservations, port, clock):
    reservations.reserve(KEY, "n1", _never)
    clock.advance(RESERVATION_LEASE)
    reservations.reserve(KEY, "n2", _never)  # reasignada: la escritura de n2 puede estar en curso
    reservations.release(KEY, "n1", _never)
    assert port.docs[DB][KEY]["note_id"] == "n2"


def test_rf_011_release_of_a_missing_reservation_is_a_no_op(reservations, port):
    reservations.release(KEY, "n1", _never)
    assert KEY not in port.docs.get(DB, {})


def test_rf_011_a_late_release_does_not_delete_a_rewritten_reservation(reservations, port):
    # La liberación leyó la reserva y, antes de borrarla, su dueño la reescribió (otro
    # `_rev`): el borrado choca y la reserva sobrevive (PLAN-0003 §15, VA-1).
    reservations.reserve(KEY, "n1", _never)
    port.before_next_delete(lambda: reservations.reserve(KEY, "n1", _never))
    reservations.release(KEY, "n1", _never)
    assert port.docs[DB][KEY]["note_id"] == "n1"


@pytest.mark.parametrize("error", [RevisionConflict(KEY), StorageUnavailable("down")])
def test_rf_011_release_is_best_effort(reservations, port, error):
    reservations.reserve(KEY, "n1", _never)
    port.fail_next("delete", error=error)
    reservations.release(KEY, "n1", _never)  # no lanza: la reserva queda huérfana
    assert KEY in port.docs[DB]
