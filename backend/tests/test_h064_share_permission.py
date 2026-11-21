"""H-064 F5d: solo administradores y cuentas habilitadas comparten bóvedas; recibir invitaciones está abierto a todos."""
from fastapi.testclient import TestClient

from app.core.limits import can_share_vaults
from app.core.models.user import User
from app.main import app
from tests.conftest import SEED_PASSWORD, login
from tests.test_h030_api import vault_of
from tests.test_h060_users import _make_super_admin
from tests.test_h064_invitations_api import READ_ALL, invite, person


def user_id(db, email):
    return db.query(User).filter(User.email == email).one().id


def test_the_rule_is_one_function_admins_always_guests_only_when_enabled():
    assert can_share_vaults("admin", False) and can_share_vaults("super_admin", False)
    assert can_share_vaults("guest", True) and not can_share_vaults("guest", False)


def test_a_guest_without_the_function_cannot_invite_and_nothing_is_created(ready_admin, db):
    owner = person(ready_admin, db, "due@example.com", can_share=False)
    person(ready_admin, db, "ana@example.com")
    vault = vault_of(owner, name="Mía")
    res = invite(owner, vault, "ana@example.com")
    assert res.status_code == 403 and res.json()["type"].endswith("share-not-allowed"), res.text
    assert owner.get(f"/vaults/{vault}/members").json()["items"] == []


def test_the_owner_without_the_function_still_uses_the_vault_normally(ready_admin, db):
    owner = person(ready_admin, db, "due@example.com", can_share=False)
    vault = vault_of(owner, name="Mía")
    assert owner.post(f"/vaults/{vault}/notes", json={"path": "a.md", "content": "1"}).status_code == 201
    assert owner.get(f"/vaults/{vault}/members").status_code == 200


def test_an_admin_enables_and_disables_it_and_the_guest_gets_it_in_the_profile(ready_admin, db):
    owner = person(ready_admin, db, "due@example.com", can_share=False)
    person(ready_admin, db, "ana@example.com")
    vault = vault_of(owner, name="Mía")
    uid = user_id(db, "due@example.com")
    assert owner.get("/auth/me").json()["can_share_vaults"] is False
    on = ready_admin.patch(f"/admin/users/{uid}/sharing", json={"can_share_vaults": True})
    assert on.status_code == 200 and on.json()["can_share_vaults"] is True
    assert owner.get("/auth/me").json()["can_share_vaults"] is True
    assert invite(owner, vault, "ana@example.com").status_code == 201
    off = ready_admin.patch(f"/admin/users/{uid}/sharing", json={"can_share_vaults": False})
    assert off.json()["can_share_vaults"] is False
    assert invite(owner, vault, "ana@example.com").status_code == 403


def test_turning_it_off_blocks_new_grants_but_still_lets_the_owner_withdraw_access(ready_admin, db):
    owner = person(ready_admin, db, "due@example.com")
    ana = person(ready_admin, db, "ana@example.com")
    vault = vault_of(owner, name="Mía")
    member = invite(owner, vault, "ana@example.com").json()
    assert ana.post(f"/invitations/{member['id']}/accept").status_code == 200
    ready_admin.patch(f"/admin/users/{user_id(db, 'due@example.com')}/sharing", json={"can_share_vaults": False})
    widen = owner.put(f"/vaults/{vault}/members/{member['id']}/grants", json={"grants": [{"folder": "*", "level": "escritura"}]})
    assert widen.status_code == 403 and widen.json()["type"].endswith("share-not-allowed")
    assert owner.get(f"/vaults/{vault}/members").status_code == 200
    assert owner.delete(f"/vaults/{vault}/members/{member['id']}").status_code in (200, 204)


def test_anyone_can_receive_an_invitation_even_without_the_function(ready_admin, db):
    vault = vault_of(ready_admin, name="Del admin")
    ana = person(ready_admin, db, "ana@example.com", can_share=False)
    member = invite(ready_admin, vault, "ana@example.com", READ_ALL).json()
    assert ana.post(f"/invitations/{member['id']}/accept").status_code == 200


def test_an_admin_owner_needs_no_switch_and_the_switch_is_only_for_guests(ready_admin, db):
    assert ready_admin.get("/auth/me").json()["can_share_vaults"] is True
    _make_super_admin(ready_admin, db)
    created = ready_admin.post("/admin/users", json={"email": "adm@example.com", "role": "admin"})
    assert created.status_code == 201 and created.json()["can_share_vaults"] is True
    db.query(User).filter(User.email == "adm@example.com").update({"must_change_password": False})
    db.commit()
    other = TestClient(app, base_url=str(ready_admin.base_url))
    assert login(other, "adm@example.com", SEED_PASSWORD).status_code == 200
    res = ready_admin.patch(f"/admin/users/{user_id(db, 'adm@example.com')}/sharing", json={"can_share_vaults": False})
    assert res.status_code == 403, res.text
    assert other.get("/auth/me").json()["can_share_vaults"] is True


def test_a_guest_cannot_change_the_switch(ready_admin, db):
    owner = person(ready_admin, db, "due@example.com", can_share=False)
    res = owner.patch(f"/admin/users/{user_id(db, 'due@example.com')}/sharing", json={"can_share_vaults": True})
    assert res.status_code in (401, 403)
    assert owner.get("/auth/me").json()["can_share_vaults"] is False
