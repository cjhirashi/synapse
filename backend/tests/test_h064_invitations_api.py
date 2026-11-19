"""H-064 F2: invitaciones y membresías de bóveda por API, con avisos y aislamiento entre propietarios."""
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.adapters.vault_member_repository import VaultMemberRepository
from app.core.errors import VaultNotFound
from app.core.models.user import User
from app.core.models.vault_member import VaultMember
from app.main import app
from app.services import vault_member_service
from app.services.vault_member_service import VaultMemberService
from tests.conftest import SEED_PASSWORD, login
from tests.test_h030_api import agent_client, vault_of

READ_ALL = [{"folder": "*", "level": "lectura"}]


def person(admin, db, email: str) -> TestClient:
    """Usuario invitado con su propio cliente (sesión aparte de la del administrador)."""
    assert admin.post("/admin/users", json={"email": email}).status_code == 201
    db.query(User).filter(User.email == email).update({"must_change_password": False})
    db.commit()
    client = TestClient(app, base_url=str(admin.base_url))
    assert login(client, email, SEED_PASSWORD).status_code == 200
    return client


def invite(owner, vault_id, email, grants=None):
    return owner.post(f"/vaults/{vault_id}/members", json={"email": email, "grants": READ_ALL if grants is None else grants})


def notices(client):
    res = client.get("/notifications")
    assert res.status_code == 200, res.text
    return [n for n in res.json()["items"] if n["kind"] == "vault_share"]


def members(owner, vault_id):
    res = owner.get(f"/vaults/{vault_id}/members")
    assert res.status_code == 200, res.text
    return res.json()["items"]


def problem(res, status, slug):
    assert res.status_code == status, res.text
    assert res.json()["type"] == f"urn:synapse:problem:{slug}", res.text


@pytest.fixture
def vault(ready_admin):
    return vault_of(ready_admin, name="Proyecto Azul")


@pytest.fixture
def ana(ready_admin, db):
    return person(ready_admin, db, "ana@example.com")


# --- Flujo completo y avisos ---

def test_the_invitation_reaches_the_guest_with_owner_and_vault_name(ready_admin, vault, ana):
    res = invite(ready_admin, vault, "ana@example.com", [{"folder": "Proyectos", "level": "escritura"}, {"folder": "Notas/Clientes", "level": "lectura"}])
    assert res.status_code == 201, res.text
    member = res.json()
    assert member["status"] == "pendiente" and member["invited_by"] == "user" and member["user"]["email"] == "ana@example.com"
    assert {(g["folder"], g["level"]) for g in member["grants"]} == {("Proyectos", "escritura"), ("Notas/Clientes", "lectura")}

    (notice,) = notices(ana)
    assert notice["title"] == "cjhirashi@gmail.com te invitó a la bóveda «Proyecto Azul»"
    assert notice["resource_id"] == member["id"] and notice["vault_id"] == vault and notice["url"] == "/compartidas"

    (inv,) = ana.get("/invitations").json()["items"]
    assert inv["id"] == member["id"] and inv["status"] == "pendiente" and inv["vault_name"] == "Proyecto Azul"
    assert inv["owner"]["email"] == "cjhirashi@gmail.com" and len(inv["grants"]) == 2
    assert set(inv) == {"id", "vault_id", "status", "created_at", "responded_at", "owner", "vault_name", "grants"}


def test_accept_notifies_the_owner_and_the_owner_can_change_grants_and_revoke(ready_admin, vault, ana):
    member = invite(ready_admin, vault, "ana@example.com").json()
    accepted = ana.post(f"/invitations/{member['id']}/accept")
    assert accepted.status_code == 200 and accepted.json()["status"] == "activo" and accepted.json()["responded_at"]
    (owner_notice,) = notices(ready_admin)
    assert owner_notice["title"] == "ana@example.com aceptó tu invitación a «Proyecto Azul»"

    put = ready_admin.put(f"/vaults/{vault}/members/{member['id']}/grants", json={"grants": [{"folder": "Proyectos", "level": "escritura"}]})
    assert put.status_code == 200 and put.json()["grants"] == [{"folder": "Proyectos", "level": "escritura"}]
    assert [g["folder"] for g in ana.get("/invitations").json()["items"][0]["grants"]] == ["Proyectos"]

    assert ready_admin.delete(f"/vaults/{vault}/members/{member['id']}").status_code == 204
    revoked = members(ready_admin, vault)[0]
    assert revoked["status"] == "revocado" and revoked["ended_reason"] == "revocada" and revoked["ended_at"] and revoked["grants"]
    assert ana.get("/invitations").json()["items"] == []
    assert ana.get("/invitations", params={"status": "revocado"}).json()["items"][0]["id"] == member["id"]
    assert notices(ana)[0]["title"] == "Se revocó tu acceso a la bóveda «Proyecto Azul»"


def test_reject_leave_and_cancel_record_their_reason_and_notify(ready_admin, db, vault, ana):
    rejected_id = invite(ready_admin, vault, "ana@example.com").json()["id"]
    rejected = ana.post(f"/invitations/{rejected_id}/reject").json()
    assert rejected["status"] == "revocado" and rejected["ended_reason"] == "rechazada" and rejected["responded_at"] and rejected["ended_at"]
    assert "rechazó tu invitación" in notices(ready_admin)[0]["title"]

    bea = person(ready_admin, db, "bea@example.com")
    left_id = invite(ready_admin, vault, "bea@example.com").json()["id"]
    bea.post(f"/invitations/{left_id}/accept")
    assert bea.post(f"/invitations/{left_id}/leave").status_code == 204
    assert {m["id"]: m["ended_reason"] for m in members(ready_admin, vault)}[left_id] == "salio"
    assert any("salió de la bóveda" in n["title"] for n in notices(ready_admin))

    cam = person(ready_admin, db, "cam@example.com")
    cancelled_id = invite(ready_admin, vault, "cam@example.com").json()["id"]
    assert ready_admin.delete(f"/vaults/{vault}/members/{cancelled_id}").status_code == 204
    assert {m["id"]: m["ended_reason"] for m in members(ready_admin, vault)}[cancelled_id] == "cancelada"
    assert "Se canceló tu invitación" in notices(cam)[0]["title"]
    assert cam.get("/invitations").json()["items"] == []


def test_reinviting_after_the_end_reopens_the_same_row_with_new_grants_and_a_new_notice(ready_admin, vault, ana):
    first = invite(ready_admin, vault, "ana@example.com").json()
    ana.post(f"/invitations/{first['id']}/reject")
    again = invite(ready_admin, vault, "ana@example.com", [{"folder": "Docs", "level": "escritura"}])
    assert again.status_code == 201
    second = again.json()
    assert second["id"] == first["id"] and second["status"] == "pendiente" and second["ended_reason"] is None
    assert second["responded_at"] is None and second["ended_at"] is None
    assert second["grants"] == [{"folder": "Docs", "level": "escritura"}]
    assert len(members(ready_admin, vault)) == 1
    assert len(notices(ana)) == 2


def test_a_guest_who_turned_off_the_kind_gets_no_notice(ready_admin, vault, ana):
    assert ana.put("/notifications/preferences", json={"kinds": {"vault_share": False}}).status_code == 200
    assert invite(ready_admin, vault, "ana@example.com").status_code == 201
    assert notices(ana) == []
    assert len(ana.get("/invitations").json()["items"]) == 1


# --- A quién se puede invitar ---

def test_email_is_matched_exactly_ignoring_case_and_never_as_a_pattern(ready_admin, vault, ana):
    for pattern in ("%@example.com", "a_a@example.com", "ana@example.%"):
        res = invite(ready_admin, vault, pattern)
        assert res.status_code in (404, 422), res.text
        assert members(ready_admin, vault) == []
    assert invite(ready_admin, vault, "  ANA@Example.com ").status_code == 201


def test_unknown_inactive_and_deleted_users_cannot_be_invited(ready_admin, db, vault, ana):
    problem(invite(ready_admin, vault, "nadie@example.com"), 404, "invitee-not-found")
    db.query(User).filter(User.email == "ana@example.com").update({"is_active": False})
    db.commit()
    problem(invite(ready_admin, vault, "ana@example.com"), 404, "invitee-not-found")
    db.query(User).filter(User.email == "ana@example.com").update({"is_active": True, "deleted_at": datetime(2026, 1, 1)})
    db.commit()
    problem(invite(ready_admin, vault, "ana@example.com"), 404, "invitee-not-found")


def test_self_invite_duplicate_and_bad_email_are_rejected(ready_admin, vault, ana):
    assert invite(ready_admin, vault, "cjhirashi@gmail.com").status_code == 422
    assert invite(ready_admin, vault, "no-es-correo").status_code == 422
    assert invite(ready_admin, vault, "ana@example.com").status_code == 201
    problem(invite(ready_admin, vault, "ana@example.com"), 409, "member-already-exists")


@pytest.mark.parametrize("grants", [
    [], [{"folder": "*", "level": "admin"}], [{"folder": "/abs", "level": "lectura"}], [{"folder": "a//b", "level": "lectura"}],
    [{"folder": "a/../b", "level": "lectura"}], [{"folder": "x", "level": "lectura"}, {"folder": "x", "level": "escritura"}],
    [{"folder": "AG - AGENTES", "level": "lectura"}], [{"folder": "ag - skills/x", "level": "lectura"}], [{"folder": "BITACORA", "level": "escritura"}],
    [{"folder": "AG - MENSAJES", "level": "lectura"}], [{"folder": "PLANTILLAS", "level": "lectura"}],
])
def test_invalid_or_reserved_grants_are_rejected(ready_admin, vault, ana, grants):
    problem(invite(ready_admin, vault, "ana@example.com", grants), 422, "validation-error")
    assert members(ready_admin, vault) == []


def test_the_open_member_cap_also_applies_when_reopening_a_row(ready_admin, db, vault, ana, monkeypatch):
    monkeypatch.setattr(vault_member_service, "MAX_OPEN_MEMBERS", 2)
    person(ready_admin, db, "bea@example.com")
    person(ready_admin, db, "cam@example.com")
    first = invite(ready_admin, vault, "ana@example.com").json()
    assert invite(ready_admin, vault, "bea@example.com").status_code == 201
    problem(invite(ready_admin, vault, "cam@example.com"), 409, "member-limit-reached")
    ready_admin.delete(f"/vaults/{vault}/members/{first['id']}")
    assert invite(ready_admin, vault, "cam@example.com").status_code == 201
    problem(invite(ready_admin, vault, "ana@example.com"), 409, "member-limit-reached")


# --- Quién puede qué ---

def test_only_the_owner_of_the_vault_manages_its_members(ready_admin, db, vault, ana):
    member = invite(ready_admin, vault, "ana@example.com").json()
    ana.post(f"/invitations/{member['id']}/accept")
    other = vault_of(ready_admin, name="Otra")
    bea = person(ready_admin, db, "bea@example.com")
    for guest in (ana, bea):
        problem(invite(guest, vault, "bea@example.com"), 404, "vault-not-found")
        problem(guest.get(f"/vaults/{vault}/members"), 404, "vault-not-found")
        problem(guest.put(f"/vaults/{vault}/members/{member['id']}/grants", json={"grants": READ_ALL}), 404, "vault-not-found")
        problem(guest.delete(f"/vaults/{vault}/members/{member['id']}"), 404, "vault-not-found")
    problem(ready_admin.put(f"/vaults/{other}/members/{member['id']}/grants", json={"grants": READ_ALL}), 404, "member-not-found")
    problem(ready_admin.delete(f"/vaults/{other}/members/{member['id']}"), 404, "member-not-found")
    assert members(ready_admin, vault)[0]["status"] == "activo"


def test_an_invitation_can_only_be_answered_by_its_guest(ready_admin, db, vault, ana):
    member = invite(ready_admin, vault, "ana@example.com").json()
    bea = person(ready_admin, db, "bea@example.com")
    for who in (ready_admin, bea):
        for action in ("accept", "reject", "leave"):
            problem(who.post(f"/invitations/{member['id']}/{action}"), 404, "member-not-found")
    assert bea.get("/invitations").json()["items"] == []
    assert members(ready_admin, vault)[0]["status"] == "pendiente"


def test_answers_out_of_order_are_conflicts(ready_admin, vault, ana):
    member = invite(ready_admin, vault, "ana@example.com").json()
    mid = member["id"]
    problem(ana.post(f"/invitations/{mid}/leave"), 409, "invitation-not-pending")
    assert ana.post(f"/invitations/{mid}/accept").status_code == 200
    problem(ana.post(f"/invitations/{mid}/accept"), 409, "invitation-not-pending")
    problem(ana.post(f"/invitations/{mid}/reject"), 409, "invitation-not-pending")
    assert ana.post(f"/invitations/{mid}/leave").status_code == 204
    problem(ana.post(f"/invitations/{mid}/leave"), 409, "invitation-not-pending")
    problem(ready_admin.delete(f"/vaults/{vault}/members/{mid}"), 409, "invitation-not-pending")
    problem(ready_admin.put(f"/vaults/{vault}/members/{mid}/grants", json={"grants": READ_ALL}), 409, "invitation-not-pending")


def test_an_agent_key_cannot_invite_or_answer(ready_admin, vault, ana):
    member = invite(ready_admin, vault, "ana@example.com").json()
    aira = agent_client(ready_admin, "aira")
    assert invite(aira, vault, "ana@example.com").status_code in (401, 403)
    assert aira.get("/invitations").status_code in (401, 403)
    assert aira.post(f"/invitations/{member['id']}/accept").status_code in (401, 403)
    assert members(ready_admin, vault)[0]["status"] == "pendiente"


def test_a_row_of_another_owner_with_the_same_vault_id_is_never_reused(ready_admin, db, ana):
    owner_a = db.query(User).filter(User.email == "cjhirashi@gmail.com").one()
    guest = db.query(User).filter(User.email == "ana@example.com").one()
    other = person(ready_admin, db, "bea@example.com")
    bea = db.query(User).filter(User.email == "bea@example.com").one()
    db.add(VaultMember(id="m-1", vault_id="vault-de-a", owner_id=owner_a.id, user_id=guest.id, status="revocado", invited_by="user",
                       created_at=datetime(2026, 1, 1)))
    db.commit()
    with pytest.raises(VaultNotFound):
        VaultMemberService(VaultMemberRepository(db)).invite(bea.id, "vault-de-a", "ana@example.com", READ_ALL)
    row = db.get(VaultMember, "m-1")
    assert row.owner_id == owner_a.id and row.status == "revocado"
    assert other.get("/invitations").json()["items"] == []
