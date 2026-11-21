"""H-064 F1/F2, revisión independiente: las transiciones de una membresía no se pisan entre peticiones simultáneas.

Se simula la carrera con un objeto leído antes de que otra petición cambie la fila: la guarda del `UPDATE` debe impedir que
una aceptación tardía resucite una invitación cancelada o que una salida pise una revocación.
"""
import pytest
from sqlalchemy import update

from app.adapters.vault_member_repository import VaultMemberRepository
from app.core.errors import InvitationNotPending, MemberAlreadyExists
from app.core.models.vault_member import VaultMember
from app.core.vault_member_rules import check_grants
from app.services.vault_member_service import VaultMemberService
from tests.test_h064_invitations_api import invite, person, problem, vault  # noqa: F401  (fixture `vault`)


def _service(db):
    return VaultMemberService(VaultMemberRepository(db))


def _row(db, member_id):
    db.expire_all()
    return db.query(VaultMember).filter(VaultMember.id == member_id).one()


def _stale(db, member_id):
    """La fila tal como la leyó una petición que aún no ha escrito (queda en memoria con su estado de entonces)."""
    member = _row(db, member_id)
    return member, member.status


def _move_elsewhere(db, member_id, **values):
    """Otra petición cambia la fila por su cuenta: un `UPDATE` directo no toca el objeto que esta petición ya tiene en memoria."""
    db.execute(update(VaultMember).where(VaultMember.id == member_id).values(**values).execution_options(synchronize_session=False))


@pytest.fixture
def pending(ready_admin, db, vault):
    person(ready_admin, db, "ana@example.com")
    return invite(ready_admin, vault, "ana@example.com").json()["id"]


def test_a_late_accept_never_revives_a_cancelled_invitation(db, pending):
    member, _ = _stale(db, pending)
    _move_elsewhere(db, pending, status="revocado", ended_reason="cancelada")
    with pytest.raises(InvitationNotPending):
        _service(db).accept(member)
    row = _row(db, pending)
    assert (row.status, row.ended_reason) == ("revocado", "cancelada") and row.responded_at is None


def test_a_late_reject_does_not_overwrite_a_cancellation(db, pending):
    member, _ = _stale(db, pending)
    _move_elsewhere(db, pending, status="revocado", ended_reason="cancelada")
    with pytest.raises(InvitationNotPending):
        _service(db).reject(member)
    assert _row(db, pending).ended_reason == "cancelada"


def test_a_late_leave_does_not_overwrite_a_revocation(ready_admin, db, pending):
    assert _service(db).accept(_row(db, pending)).status == "activo"
    db.commit()
    stale, _ = _stale(db, pending)
    _move_elsewhere(db, pending, status="revocado", ended_reason="revocada")
    with pytest.raises(InvitationNotPending):
        _service(db).leave(stale)
    assert _row(db, pending).ended_reason == "revocada"


def test_a_late_owner_cancel_after_the_guest_accepted_does_not_leave_a_zombie(db, pending):
    member, _ = _stale(db, pending)  # el propietario leyó «pendiente»
    _move_elsewhere(db, pending, status="activo")  # el invitado aceptó entretanto
    with pytest.raises(InvitationNotPending):
        _service(db).end_by_owner(member)
    row = _row(db, pending)
    assert row.status == "activo" and row.ended_reason is None


def test_a_reinvitation_that_lost_the_race_is_reported_as_already_existing(ready_admin, db, vault, pending):
    assert ready_admin.delete(f"/vaults/{vault}/members/{pending}").status_code == 204
    member, _ = _stale(db, pending)  # revocado, listo para reabrir
    _move_elsewhere(db, pending, status="pendiente", ended_reason=None, ended_at=None)  # otra invitación ya la reabrió
    with pytest.raises(MemberAlreadyExists):
        VaultMemberService(VaultMemberRepository(db)).invite(member.owner_id, vault, "ana@example.com", [{"folder": "*", "level": "lectura"}])
    assert _row(db, pending).status == "pendiente"


def test_rejecting_records_the_response_time_equal_to_the_end(db, pending):
    row = _service(db).reject(_row(db, pending))
    assert row.status == "revocado" and row.ended_reason == "rechazada" and row.responded_at == row.ended_at is not None


def test_accepting_an_invitation_to_a_deleted_vault_is_a_404(ready_admin, db, vault, pending):
    assert ready_admin.delete(f"/vaults/{vault}", headers={"If-Match": ready_admin.get(f"/vaults/{vault}").headers["ETag"]}).status_code in (200, 204)
    from fastapi.testclient import TestClient
    from app.main import app
    from tests.conftest import SEED_PASSWORD, login
    ana = TestClient(app, base_url=str(ready_admin.base_url))
    assert login(ana, "ana@example.com", SEED_PASSWORD).status_code == 200
    problem(ana.post(f"/invitations/{pending}/accept"), 404, "vault-not-found")
    assert _row(db, pending).status == "pendiente"


@pytest.mark.parametrize("grants", [
    [{"folder": "Pub", "level": "lectura"}, {"folder": "pub", "level": "escritura"}],
    [{"folder": "Notas/Ñ", "level": "lectura"}, {"folder": "notas/ñ", "level": "lectura"}],
])
def test_grants_that_name_the_same_folder_are_invalid(grants):
    assert check_grants(grants) == "validation-error:grants"
