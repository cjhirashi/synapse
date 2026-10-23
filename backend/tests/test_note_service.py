"""`NoteService` contra CouchDB real (SPEC-0008 RF-011, RF-013, RF-017; PLAN-0008 §2.2).

Cada test usa una base propia `synapse_user_test_{uuid}` que crea y borra él mismo. El reloj
es el de 0003 (`TickingClock`): `advance` deja vencer el arrendamiento de una reserva, así
sólo decide quién usa la ruta (las hojas vivas de la nota que la reservó).
"""
import hashlib
import threading
import uuid

import httpx
import pytest

from app.adapters.vault_repository import VaultRepository
from app.core.config import settings
from app.core.note_rules import path_key
from app.services.note_service import NotePathTaken, NoteService
from app.services.reservations import RESERVATION_LEASE
from tests.test_vault_service import TickingClock

AUTH = (settings.COUCHDB_USER, settings.COUCHDB_PASSWORD)
VAULT = str(uuid.uuid4())


@pytest.fixture
def db():
    name = f"synapse_user_test_{uuid.uuid4().hex}"
    httpx.put(f"{settings.COUCHDB_URL}/{name}", auth=AUTH).raise_for_status()
    yield name
    httpx.delete(f"{settings.COUCHDB_URL}/{name}", auth=AUTH)


@pytest.fixture
def repo():
    return VaultRepository()


@pytest.fixture
def clock():
    return TickingClock()


@pytest.fixture
def service(repo, db, clock):
    return NoteService(repo, db, clock)


def _note_id(vault_id: str = VAULT) -> str:
    return f"note:{vault_id}:{uuid.uuid4()}"


def _note(note_id: str, path: str, deleted_at: str | None = None) -> dict:
    return {"_id": note_id, "type": "note", "vault_id": note_id.split(":")[1], "path": path,
            "content": "", "created_at": "2026-10-12T10:00:00.000000Z",
            "updated_at": "2026-10-12T10:00:00.000000Z", "deleted_at": deleted_at}


def _reservation_id(path: str, vault_id: str = VAULT) -> str:
    return f"note-path:{vault_id}:{hashlib.sha256(path_key(path).encode()).hexdigest()}"


def _bulk_branch(db: str, doc: dict, rev_hash: str) -> None:
    """Escribe `doc` como una raíz propia (`1-{hash}`): dos así son dos hojas en conflicto."""
    body = {**doc, "_rev": f"1-{rev_hash}", "_revisions": {"start": 1, "ids": [rev_hash]}}
    response = httpx.post(f"{settings.COUCHDB_URL}/{db}/_bulk_docs", auth=AUTH,
                          json={"docs": [body], "new_edits": False})
    response.raise_for_status()


def test_rf_013_reserve_path_writes_the_reservation_of_the_vault_and_normalized_path(
        service, repo, db):
    note = _note_id()
    service.reserve_path(note, "Carpeta/Nota.md")
    stored = repo.get(db, _reservation_id("carpeta/nota.md"))
    assert (stored["type"], stored["note_id"]) == ("note-path", note)
    assert stored["_id"] == _reservation_id("Carpeta/Nota.md")
    assert stored["path_key"] == "carpeta/nota.md"


def test_rf_013_a_path_inside_the_lease_is_taken(service):
    service.reserve_path(_note_id(), "Nota.md")
    with pytest.raises(NotePathTaken):
        service.reserve_path(_note_id(), "Nota.md")


@pytest.mark.parametrize(("first", "second"), [
    ("Straße.md", "STRASSE.md"),          # ß / SS
    ("Café.md", "Café.md"),    # NFD / NFC
    ("Ａ/ｂ.md", "a/B.md"),               # anchura completa
])
def test_rf_013_equivalent_paths_are_taken_after_the_lease(
        service, repo, db, clock, first, second):
    # Vencido el arrendamiento sólo decide el uso: la nota que la reservó tiene una hoja
    # viva con esa ruta equivalente (NFKC + casefold).
    holder = _note_id()
    repo.put(db, _note(holder, first))
    service.reserve_path(holder, first)
    clock.advance(RESERVATION_LEASE)
    with pytest.raises(NotePathTaken):
        service.reserve_path(_note_id(), second)


def test_rf_013_the_same_path_in_another_vault_is_free(service):
    service.reserve_path(_note_id(), "Nota.md")
    service.reserve_path(_note_id(str(uuid.uuid4())), "Nota.md")


def test_rf_013_the_note_can_reserve_an_equivalent_path_again(service, repo, db):
    # Renombrar sólo mayúsculas conserva la misma reserva: no choca consigo misma.
    note = _note_id()
    repo.put(db, _note(note, "Nota.md"))
    service.reserve_path(note, "Nota.md")
    service.reserve_path(note, "NOTA.md")


def test_rf_013_two_simultaneous_reservations_of_one_path_let_only_one_win(repo, db, clock):
    outcomes = []
    barrier = threading.Barrier(2)

    def reserve():
        # Un servicio por hilo, como una instancia por petición.
        barrier.wait()
        try:
            NoteService(VaultRepository(), db, clock).reserve_path(_note_id(), "Misma.md")
            outcomes.append("won")
        except NotePathTaken:
            outcomes.append("lost")

    threads = [threading.Thread(target=reserve) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert sorted(outcomes) == ["lost", "won"]


def test_rf_013_a_losing_live_branch_keeps_its_path_reserved(service, repo, db, clock):
    # La nota está en conflicto: la hoja ganadora usa B.md y la perdedora A.md. Si el
    # conflicto se resuelve a favor de la perdedora, A.md debe seguir siendo suyo (P-4).
    note = _note_id()
    _bulk_branch(db, _note(note, "A.md"), "a" * 32)
    _bulk_branch(db, _note(note, "B.md"), "b" * 32)  # gana: hash mayor
    assert repo.get(db, note)["path"] == "B.md"
    service.reserve_path(note, "A.md")
    clock.advance(RESERVATION_LEASE)
    with pytest.raises(NotePathTaken):
        service.reserve_path(_note_id(), "A.md")


def test_rf_017_a_path_of_a_trashed_note_is_free_after_the_lease(service, repo, db, clock):
    # Una hoja en la papelera (`deleted_at`) no usa su ruta: restaurarla vuelve a reservar.
    trashed = _note_id()
    repo.put(db, _note(trashed, "Vieja.md", deleted_at="2026-10-12T11:00:00.000000Z"))
    service.reserve_path(trashed, "Vieja.md")
    clock.advance(RESERVATION_LEASE)
    service.reserve_path(_note_id(), "Vieja.md")


def test_rf_011_release_path_after_a_rename_frees_the_old_path(service, repo, db):
    note = _note_id()
    stored = _note(note, "Vieja.md")
    stored["_rev"] = repo.put(db, stored)
    service.reserve_path(note, "Vieja.md")
    service.reserve_path(note, "Nueva.md")
    repo.put(db, {**stored, "path": "Nueva.md"})  # el renombrado ya está escrito
    service.release_path(note, "Vieja.md")
    assert repo.get(db, _reservation_id("Vieja.md")) is None
    assert repo.get(db, _reservation_id("Nueva.md"))["note_id"] == note


def test_rf_011_release_path_keeps_a_path_still_used_by_a_live_leaf(service, repo, db):
    note = _note_id()
    repo.put(db, _note(note, "Sigue.md"))
    service.reserve_path(note, "Sigue.md")
    service.release_path(note, "Sigue.md")
    assert repo.get(db, _reservation_id("Sigue.md"))["note_id"] == note


def test_rf_011_release_path_never_deletes_the_reservation_of_another_note(
        service, repo, db, clock):
    left, taker = _note_id(), _note_id()
    service.reserve_path(left, "Mismo.md")
    clock.advance(RESERVATION_LEASE)
    service.reserve_path(taker, "Mismo.md")  # huérfana reasignada
    service.release_path(left, "Mismo.md")
    assert repo.get(db, _reservation_id("Mismo.md"))["note_id"] == taker


def test_rf_013_the_reservation_id_is_bounded_whatever_the_path_expands_to(service, repo, db):
    # NFKC expande "ﷺ" a 18 caracteres: la clave de una ruta de 300 mediría 5 400 y CouchDB
    # rechazaría el id (400). El id lleva el SHA-256 de la clave, que se guarda en el documento.
    path = "ﷺ" * 300
    note = _note_id()
    service.reserve_path(note, path)
    reservation_id = f"note-path:{VAULT}:{hashlib.sha256(path_key(path).encode()).hexdigest()}"
    stored = repo.get(db, reservation_id)
    assert len(reservation_id) < 128
    assert (stored["note_id"], stored["path_key"]) == (note, path_key(path))
    with pytest.raises(NotePathTaken):
        service.reserve_path(_note_id(), path)
