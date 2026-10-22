"""Aislamiento de las notas entre usuarios en `/sync/**` (SPEC-0008 RF-004, RF-006; Art. 5).

La base de cada petición sale sólo del token: B no ve notas ni reservas de A por ninguna ruta,
una nota de B no puede colgarse de una bóveda de A, y las reservas `note-path:*` no se pueden
empujar. La base de A queda exactamente igual.
"""
import httpx

from app.core.config import settings
from tests.test_note_sync_api import note_doc, rejection
from tests.test_sync_api import CHECKPOINT, change_ids, owner_of, push, vault_doc
from tests.test_vaults_api import AUTH, stored_docs, user_db
from tests.test_vaults_isolation import GUEST, _guest


def _snapshot(db_name: str) -> dict:
    """Todo lo de la base de A, `_local` incluido, para comparar antes y después."""
    local = httpx.get(f"{settings.COUCHDB_URL}/{db_name}/{CHECKPOINT}", auth=AUTH)
    return {**stored_docs(db_name), CHECKPOINT: local.json() if local.status_code == 200 else None}


def test_rf_004_another_users_notes_and_reservations_are_invisible_and_untouchable(ready_admin, db):
    # A: una bóveda con dos notas (cada una con su reserva `note-path:*`).
    a_vault = vault_doc(owner_of(db), name="Bóveda de A")
    a_vault_id = a_vault["_id"].removeprefix("vault:")
    first, second = note_doc(a_vault_id, path="Uno.md"), note_doc(a_vault_id, path="Carpeta/Dos.md")
    assert push(ready_admin, [a_vault, first, second]).json() == []
    a_db = user_db(db)
    reservations = [i for i in stored_docs(a_db) if i.startswith("note-path:")]
    assert len(reservations) == 2
    a_ids = [first["_id"], second["_id"]]
    before = _snapshot(a_db)

    guest = _guest(ready_admin, db)
    b_db = user_db(db, GUEST)
    assert b_db != a_db

    # Lectura: nada de A (ni notas ni reservas) por ninguna ruta del canal.
    assert change_ids(guest.get("/sync/db/_changes", params={"include_docs": "true"})) == []
    assert guest.get("/sync/db/_all_docs").json()["rows"] == []
    probe = [*a_ids, *reservations]
    assert guest.post("/sync/db/_all_docs", json={"keys": probe}).json()["rows"] == [
        {"key": doc_id, "error": "not_found"} for doc_id in a_ids
    ]
    got = guest.post("/sync/db/_bulk_get", json={"docs": [{"id": i} for i in probe]}).json()["results"]
    assert all("error" in r["docs"][0] for r in got)
    diff = guest.post("/sync/db/_revs_diff", json={first["_id"]: [first["_rev"]]}).json()
    assert diff == {first["_id"]: {"missing": [first["_rev"]]}}

    # Escritura: una nota de B con el `vault_id` de una bóveda de A → `vault-not-found`; la
    # base de A no cambia (no hay bóveda de A en la base de B, y el id lo ata a la de A).
    intruder = note_doc(a_vault_id, path="Intruso.md")
    assert push(guest, [intruder]).json() == [rejection(intruder, "vault-not-found")]
    assert _snapshot(a_db) == before

    # Una nota de B en una bóveda de B con la misma ruta que una de A: no choca con A.
    b_vault = vault_doc(owner_of(db, GUEST), name="Bóveda de B")
    b_note = note_doc(b_vault["_id"].removeprefix("vault:"), path="Uno.md")
    assert push(guest, [b_vault, b_note]).json() == []
    assert _snapshot(a_db) == before
    assert set(stored_docs(b_db)) == {
        b_vault["_id"], b_note["_id"], f"note-path:{b_note['vault_id']}:uno.md",
        "vault-name:bóveda de b",
    }
    # Y A sigue sin ver nada de B.
    assert {r["id"] for r in ready_admin.get("/sync/db/_changes").json()["results"]} == {
        a_vault["_id"], *a_ids}
    guest.close()


def test_rf_006_a_note_path_reservation_cannot_be_pushed(ready_admin, db):
    vault = vault_doc(owner_of(db), name="Bóveda")
    vault_id = vault["_id"].removeprefix("vault:")
    assert push(ready_admin, [vault]).json() == []
    forged = {**note_doc(vault_id), "_id": f"note-path:{vault_id}:nota.md"}
    assert push(ready_admin, [forged]).json() == [rejection(forged, "invalid-id")]
    assert f"note-path:{vault_id}:nota.md" not in stored_docs(user_db(db))
