"""H-064: los eventos de membresía quedan en la BITACORA del propietario (invitar, permisos, cancelar, revocar, aceptar, rechazar, salir)."""
from datetime import UTC, datetime

import pytest

from app.core import bitacora_rules as bit
from app.core.config import settings
from app.core.models.change_log import ChangeLog
from app.core.models.user import User
from app.core.vault_context import user_db_name
from app.routers.vaults import get_vault_port
from app.services import agent_access_guard
from app.services.change_log_service import ChangeLogService
from tests.test_h030_api import find, vault_of
from tests.test_h064_invitations_api import ana, invite, person, problem  # noqa: F401

TZ = "America/Mexico_City"
OWNER = "cjhirashi@gmail.com"


@pytest.fixture(autouse=True)
def _docs_on(monkeypatch):
    monkeypatch.setattr(settings, "BITACORA_DOCS", True)
    agent_access_guard._CACHE.clear()
    yield
    agent_access_guard._CACHE.clear()


@pytest.fixture
def vault(ready_admin):
    return vault_of(ready_admin, name="Proyecto Azul")


def rows(db, vault_id):
    db.expire_all()
    return db.query(ChangeLog).filter(ChangeLog.vault_id == vault_id, ChangeLog.op.in_(bit.MEMBER_OPS)).order_by(ChangeLog.at).all()


def day_text(owner, vault_id) -> str:
    today = bit.local_date(datetime.now(UTC), TZ)
    item = find(owner, vault_id, bit.day_path(today))
    assert item is not None, "el documento del día no existe"
    return owner.get(f"/vaults/{vault_id}/notes/{item['id']}").json()["content"]


def test_the_whole_life_of_an_invitation_is_logged_with_who_and_what(ready_admin, vault, ana, db):
    grants = [{"folder": "Pub", "level": "lectura"}, {"folder": "*", "level": "escritura"}]
    member = invite(ready_admin, vault, "ana@example.com", grants).json()
    assert ana.post(f"/invitations/{member['id']}/accept").status_code == 200
    assert ready_admin.put(f"/vaults/{vault}/members/{member['id']}/grants", json={"grants": [{"folder": "Pub", "level": "escritura"}]}).status_code == 200
    assert ana.post(f"/invitations/{member['id']}/leave").status_code == 204

    got = rows(db, vault)
    assert [(r.op, r.author, r.author_kind, r.path, r.status, r.note_id) for r in got] == [
        ("invite", OWNER, "human", "ana@example.com", "applied", member["id"]),
        ("accept", "ana@example.com", "human", "ana@example.com", "applied", member["id"]),
        ("regrant", OWNER, "human", "ana@example.com", "applied", member["id"]),
        ("leave", "ana@example.com", "human", "ana@example.com", "applied", member["id"]),
    ]
    assert got[0].title == "lectura en `Pub`, escritura en toda la bóveda"
    assert got[2].title == "escritura en `Pub`"

    text = day_text(ready_admin, vault)
    assert f"{OWNER} (usuario) · invitación · invitado `ana@example.com` · lectura en `Pub`, escritura en toda la bóveda" in text
    assert "ana@example.com (usuario) · aceptación de invitación · invitado `ana@example.com`" in text
    assert f"{OWNER} (usuario) · cambio de permisos · invitado `ana@example.com` · escritura en `Pub`" in text
    assert "ana@example.com (usuario) · salida de la bóveda · invitado `ana@example.com`" in text
    assert "4 cambios." in text


@pytest.mark.parametrize("closer, op", [("cancel", "cancel"), ("reject", "reject")])
def test_a_pending_invitation_that_ends_is_logged_as_cancel_or_reject(ready_admin, vault, ana, db, closer, op):
    member = invite(ready_admin, vault, "ana@example.com").json()
    if closer == "cancel":
        assert ready_admin.delete(f"/vaults/{vault}/members/{member['id']}").status_code == 204
        author = OWNER
    else:
        assert ana.post(f"/invitations/{member['id']}/reject").status_code == 200
        author = "ana@example.com"
    assert [(r.op, r.author) for r in rows(db, vault)] == [("invite", OWNER), (op, author)]


def test_revoking_an_active_access_is_logged(ready_admin, vault, ana, db):
    member = invite(ready_admin, vault, "ana@example.com").json()
    assert ana.post(f"/invitations/{member['id']}/accept").status_code == 200
    assert ready_admin.delete(f"/vaults/{vault}/members/{member['id']}").status_code == 204
    assert [r.op for r in rows(db, vault)] == ["invite", "accept", "revoke"]
    assert f"{OWNER} (usuario) · revocación de acceso · invitado `ana@example.com`" in day_text(ready_admin, vault)


def test_a_rejected_request_leaves_no_entry(ready_admin, vault, ana, db):
    """Lo que el servidor rechaza no es un evento: ni una invitación a un correo inexistente ni una repetida."""
    assert invite(ready_admin, vault, "nadie@example.com").status_code == 404
    assert invite(ready_admin, vault, "ana@example.com").status_code == 201
    assert invite(ready_admin, vault, "ana@example.com").status_code == 409
    assert [r.op for r in rows(db, vault)] == ["invite"]


def test_the_guest_never_sees_the_bitacora_of_the_owner(ready_admin, vault, ana):
    member = invite(ready_admin, vault, "ana@example.com").json()
    assert ana.post(f"/invitations/{member['id']}/accept").status_code == 200
    today = bit.local_date(datetime.now(UTC), TZ)
    assert find(ready_admin, vault, bit.day_path(today)) is not None  # el propietario sí la tiene
    listing = ana.get(f"/vaults/{vault}/notes")
    assert listing.status_code == 200, listing.text
    assert all(not i["path"].startswith("BITACORA") for i in listing.json()["items"])


def test_if_the_day_document_cannot_be_written_the_change_and_its_row_stand(ready_admin, vault, ana, db, monkeypatch):
    """La fila entra en la transacción del cambio; el documento del día es de mejor esfuerzo y `rebuild` lo repara."""
    def down(self, vault_id, date):
        raise RuntimeError("couch down")

    monkeypatch.setattr(ChangeLogService, "write_day", down)
    res = invite(ready_admin, vault, "ana@example.com")
    assert res.status_code == 201, res.text
    assert [r.op for r in rows(db, vault)] == ["invite"]
    assert [m["status"] for m in ready_admin.get(f"/vaults/{vault}/members").json()["items"]] == ["pendiente"]


def test_rebuild_regenerates_the_membership_lines_from_the_table(ready_admin, vault, ana, db):
    member = invite(ready_admin, vault, "ana@example.com").json()
    assert ana.post(f"/invitations/{member['id']}/accept").status_code == 200
    owner = db.query(User).filter(User.email == OWNER).one()
    port = get_vault_port()
    days = ChangeLogService(port, user_db_name(owner.id), owner.id).rebuild(vault)
    assert days == [bit.local_date(datetime.now(UTC), TZ)]
    text = day_text(ready_admin, vault)
    assert "invitación · invitado `ana@example.com`" in text and "aceptación de invitación" in text


def test_a_member_entry_renders_without_line_counts():
    at = datetime(2026, 11, 20, 18, 0, tzinfo=UTC)
    entry = bit.Entry(at, "invite", "ana@example.com", None, "lectura en toda la bóveda", "human", "carlos@x.mx", "applied")
    assert bit._line(entry, TZ) == (
        "- **12:00:00** · carlos@x.mx (usuario) · invitación · invitado `ana@example.com` · lectura en toda la bóveda")
    pending = entry._replace(op="leave", title=None, status="pending")
    assert bit._line(pending, TZ) == "- **12:00:00** · carlos@x.mx (usuario) · salida de la bóveda · invitado `ana@example.com` [sin confirmar]"


def test_grants_summary_reads_as_a_sentence():
    assert bit.grants_summary([]) == "sin concesiones"
    assert bit.grants_summary([{"folder": "*", "level": "lectura"}]) == "lectura en toda la bóveda"
    assert bit.grants_summary([{"folder": "A/B", "level": "escritura"}, {"folder": "C", "level": "lectura"}]) == "escritura en `A/B`, lectura en `C`"
