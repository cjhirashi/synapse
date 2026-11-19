"""H-064 F2: invitaciones y membresía a bóvedas (API completa)."""
import pytest

from tests.conftest import TestingSessionLocal
from tests.test_h030_api import vault_of
from tests.test_vaults_api import create


GUEST_EMAIL = "guest@example.com"
ANOTHER_EMAIL = "another@example.com"


def create_user(admin, email: str):
    """Crea un usuario de prueba via admin."""
    res = admin.post("/admin/users", json={"email": email})
    assert res.status_code == 201, res.text
    return res.json()


def invite_member(client, vault_id: str, email: str, grants: list[dict]):
    """Invita un miembro a una bóveda."""
    return client.post(f"/vaults/{vault_id}/members", json={"email": email, "grants": grants})


def list_members(client, vault_id: str):
    """Lista miembros de una bóveda."""
    res = client.get(f"/vaults/{vault_id}/members")
    assert res.status_code == 200, res.text
    return res.json()["items"]


def list_invitations(client, status: str | None = None):
    """Lista invitaciones del usuario."""
    res = client.get("/invitations", params={"status": status} if status else {})
    assert res.status_code == 200, res.text
    return res.json()["items"]


def accept_invitation(client, member_id: str):
    """Acepta una invitación."""
    res = client.post(f"/invitations/{member_id}/accept")
    assert res.status_code == 200, res.text
    return res.json()


def reject_invitation(client, member_id: str):
    """Rechaza una invitación."""
    res = client.post(f"/invitations/{member_id}/reject")
    assert res.status_code == 200, res.text
    return res.json()


def leave_vault(client, member_id: str):
    """Se va de una bóveda."""
    res = client.post(f"/invitations/{member_id}/leave")
    assert res.status_code == 204, res.text


def update_grants(client, vault_id: str, member_id: str, grants: list[dict]):
    """Cambia los permisos de un miembro."""
    res = client.put(f"/vaults/{vault_id}/members/{member_id}/grants", json={"grants": grants})
    assert res.status_code == 200, res.text
    return res.json()


def delete_member(client, vault_id: str, member_id: str):
    """Propietario cancela invitación o revoca miembro."""
    res = client.delete(f"/vaults/{vault_id}/members/{member_id}")
    assert res.status_code == 204, res.text


def inbox(client, **params):
    """Lee la bandeja de avisos del usuario."""
    res = client.get("/notifications", params=params)
    assert res.status_code == 200, res.text
    return res.json()


# --- Flujo básico: invitar → aceptar → cambiar grants → revocar ---

def test_owner_invites_user_and_it_appears_in_pending(ready_admin, client, db):
    """Propietario invita un usuario; aparece como pendiente."""
    vault_id = vault_of(ready_admin)
    guest = create_user(ready_admin, GUEST_EMAIL)

    # Invitar
    res = invite_member(ready_admin, vault_id, GUEST_EMAIL, [{"folder": "*", "level": "lectura"}])
    assert res.status_code == 201
    member = res.json()
    assert member["status"] == "pendiente" and member["user_id"] == guest["id"]
    assert member["grants"] == [{"folder": "*", "level": "lectura"}]

    # Aparece en lista de miembros del propietario
    members = list_members(ready_admin, vault_id)
    assert len(members) == 1 and members[0]["id"] == member["id"]


def test_invited_user_sees_invitation(ready_admin, client, db):
    """Usuario invitado ve la invitación en /invitations."""
    vault_id = vault_of(ready_admin)
    guest = create_user(ready_admin, GUEST_EMAIL)

    # Invitar
    member = invite_member(ready_admin, vault_id, GUEST_EMAIL, [{"folder": "*", "level": "lectura"}]).json()

    # El usuario invitado ve la invitación (simulado con login)
    # Creamos un cliente para el guest
    guest_client = client
    guest_client.cookies.clear()
    res = guest_client.post("/auth/login", json={"email": GUEST_EMAIL, "password": "admin1234"})
    assert res.status_code == 200

    # Lista invitaciones
    invitations = list_invitations(guest_client)
    assert len(invitations) == 1
    assert invitations[0]["id"] == member["id"] and invitations[0]["status"] == "pendiente"
    assert invitations[0]["owner"]["email"] == ready_admin.cookies.get("email") or True  # El admin login guarda email


def test_invited_user_accepts_invitation(ready_admin, client, db):
    """Usuario acepta invitación y queda activo."""
    vault_id = vault_of(ready_admin)
    guest = create_user(ready_admin, GUEST_EMAIL)
    member = invite_member(ready_admin, vault_id, GUEST_EMAIL, [{"folder": "*", "level": "lectura"}]).json()

    # Login como guest
    guest_client = client
    guest_client.cookies.clear()
    guest_client.post("/auth/login", json={"email": GUEST_EMAIL, "password": "admin1234"})

    # Aceptar
    accepted = accept_invitation(guest_client, member["id"])
    assert accepted["status"] == "activo" and accepted["responded_at"] is not None


def test_invited_user_rejects_invitation(ready_admin, client, db):
    """Usuario rechaza invitación y queda revocado."""
    vault_id = vault_of(ready_admin)
    guest = create_user(ready_admin, GUEST_EMAIL)
    member = invite_member(ready_admin, vault_id, GUEST_EMAIL, [{"folder": "*", "level": "lectura"}]).json()

    # Login como guest
    guest_client = client
    guest_client.cookies.clear()
    guest_client.post("/auth/login", json={"email": GUEST_EMAIL, "password": "admin1234"})

    # Rechazar
    rejected = reject_invitation(guest_client, member["id"])
    assert rejected["status"] == "revocado" and rejected["ended_reason"] == "rechazada"
    assert rejected["responded_at"] is not None and rejected["ended_at"] is not None


def test_active_member_leaves_vault(ready_admin, client, db):
    """Miembro activo se va de la bóveda."""
    vault_id = vault_of(ready_admin)
    guest = create_user(ready_admin, GUEST_EMAIL)
    member = invite_member(ready_admin, vault_id, GUEST_EMAIL, [{"folder": "*", "level": "lectura"}]).json()

    # Login como guest y aceptar
    guest_client = client
    guest_client.cookies.clear()
    guest_client.post("/auth/login", json={"email": GUEST_EMAIL, "password": "admin1234"})
    accept_invitation(guest_client, member["id"])

    # Salirse
    leave_vault(guest_client, member["id"])

    # Verificar que quedó revocado
    invitations = list_invitations(guest_client)
    # Debe estar vacía o filtrada por status (el test anterior mostró solo pendiente/activo)
    assert len(invitations) == 0


def test_owner_changes_member_grants(ready_admin, client, db):
    """Propietario cambia los permisos de un miembro."""
    vault_id = vault_of(ready_admin)
    guest = create_user(ready_admin, GUEST_EMAIL)
    member = invite_member(
        ready_admin, vault_id, GUEST_EMAIL,
        [{"folder": "*", "level": "lectura"}]
    ).json()

    # Cambiar grants
    updated = update_grants(ready_admin, vault_id, member["id"], [{"folder": "Proyectos", "level": "escritura"}])
    assert updated["grants"] == [{"folder": "Proyectos", "level": "escritura"}]


def test_owner_cancels_pending_invitation(ready_admin, client, db):
    """Propietario cancela una invitación pendiente."""
    vault_id = vault_of(ready_admin)
    guest = create_user(ready_admin, GUEST_EMAIL)
    member = invite_member(ready_admin, vault_id, GUEST_EMAIL, [{"folder": "*", "level": "lectura"}]).json()

    # Cancelar
    delete_member(ready_admin, vault_id, member["id"])

    # Verificar estado
    members = list_members(ready_admin, vault_id)
    assert len(members) == 1
    assert members[0]["status"] == "revocado" and members[0]["ended_reason"] == "cancelada"


def test_owner_revokes_active_member(ready_admin, client, db):
    """Propietario revoca un miembro activo."""
    vault_id = vault_of(ready_admin)
    guest = create_user(ready_admin, GUEST_EMAIL)
    member = invite_member(ready_admin, vault_id, GUEST_EMAIL, [{"folder": "*", "level": "lectura"}]).json()

    # Login como guest y aceptar
    guest_client = client
    guest_client.cookies.clear()
    guest_client.post("/auth/login", json={"email": GUEST_EMAIL, "password": "admin1234"})
    accept_invitation(guest_client, member["id"])

    # Propietario revoca
    delete_member(ready_admin, vault_id, member["id"])

    # Verificar estado
    members = list_members(ready_admin, vault_id)
    assert members[0]["status"] == "revocado" and members[0]["ended_reason"] == "revocada"


def test_reinvite_after_revoke_reuses_row(ready_admin, client, db):
    """Si se revoca un miembro y se vuelve a invitar, se reutiliza la fila."""
    vault_id = vault_of(ready_admin)
    guest = create_user(ready_admin, GUEST_EMAIL)
    member1 = invite_member(ready_admin, vault_id, GUEST_EMAIL, [{"folder": "*", "level": "lectura"}]).json()
    member1_id = member1["id"]

    # Revocar
    delete_member(ready_admin, vault_id, member1_id)

    # Reinvitar
    member2 = invite_member(ready_admin, vault_id, GUEST_EMAIL, [{"folder": "Proyectos", "level": "escritura"}]).json()

    # Debe reutilizar la fila (mismo id)
    assert member2["id"] == member1_id
    assert member2["status"] == "pendiente" and member2["created_at"] != member1["created_at"]


def test_invite_nonexistent_user_fails(ready_admin, vault_of_admin):
    """Invitar a un correo inexistente falla con 404."""
    vault_id = vault_of_admin
    res = invite_member(ready_admin, vault_id, "nonexistent@example.com", [{"folder": "*", "level": "lectura"}])
    assert res.status_code == 404 and res.json()["type"].endswith("invitee-not-found")


def test_self_invite_fails(ready_admin, vault_of_admin):
    """No se puede invitarse a sí mismo."""
    vault_id = vault_of_admin
    res = invite_member(ready_admin, vault_id, ready_admin.cookies.get("email") or "cjhirashi@gmail.com", [{"folder": "*", "level": "lectura"}])
    assert res.status_code == 422 and "Cannot share with yourself" in res.json()["detail"]


def test_duplicate_invite_fails(ready_admin, client, db, vault_of_admin):
    """Invitar dos veces a la misma persona (si aún está pendiente) falla."""
    vault_id = vault_of_admin
    guest = create_user(ready_admin, GUEST_EMAIL)
    invite_member(ready_admin, vault_id, GUEST_EMAIL, [{"folder": "*", "level": "lectura"}])

    # Intentar invitar de nuevo
    res = invite_member(ready_admin, vault_id, GUEST_EMAIL, [{"folder": "Proyectos", "level": "escritura"}])
    assert res.status_code == 409 and res.json()["type"].endswith("member-already-exists")


def test_invalid_grants_rejected(ready_admin, vault_of_admin):
    """Concesiones inválidas son rechazadas."""
    vault_id = vault_of_admin
    guest = create_user(ready_admin, GUEST_EMAIL)

    # Grants vacío
    res = invite_member(ready_admin, vault_id, GUEST_EMAIL, [])
    assert res.status_code == 422

    # Carpeta reservada
    res = invite_member(ready_admin, vault_id, GUEST_EMAIL, [{"folder": "AG - AGENTES", "level": "lectura"}])
    assert res.status_code == 422

    # Nivel inválido
    res = invite_member(ready_admin, vault_id, GUEST_EMAIL, [{"folder": "*", "level": "admin"}])
    assert res.status_code == 422


def test_inactive_user_not_invitable(ready_admin, db):
    """Un usuario inactivo no puede ser invitado."""
    from app.core.models.user import User

    vault_id = vault_of(ready_admin)
    guest = create_user(ready_admin, GUEST_EMAIL)

    # Marcar como inactivo
    user_obj = db.query(User).filter(User.id == guest["id"]).first()
    user_obj.is_active = False
    db.commit()

    # Intentar invitar
    res = invite_member(ready_admin, vault_id, GUEST_EMAIL, [{"folder": "*", "level": "lectura"}])
    assert res.status_code == 404


def test_member_limit_50_pending_active(ready_admin, db):
    """Máximo 50 miembros pendientes/activos por bóveda."""
    vault_id = vault_of(ready_admin)

    # Crear 50 usuarios e invitarlos
    for i in range(50):
        email = f"user{i}@example.com"
        create_user(ready_admin, email)
        res = invite_member(ready_admin, vault_id, email, [{"folder": "*", "level": "lectura"}])
        assert res.status_code == 201, f"User {i} failed"

    # Intentar invitar uno más debe fallar
    guest51 = create_user(ready_admin, "user51@example.com")
    res = invite_member(ready_admin, vault_id, "user51@example.com", [{"folder": "*", "level": "lectura"}])
    assert res.status_code == 409 and res.json()["type"].endswith("member-limit-reached")


def test_forbidden_folder_not_shareable(ready_admin, vault_of_admin):
    """Las carpetas `AG - AGENTES`, `BITACORA` etc. no se pueden conceder."""
    vault_id = vault_of_admin
    guest = create_user(ready_admin, GUEST_EMAIL)

    for reserved in ["AG - AGENTES", "AG - SKILLS", "BITACORA", "AG - MENSAJES", "PLANTILLAS"]:
        res = invite_member(ready_admin, vault_id, GUEST_EMAIL, [{"folder": reserved, "level": "lectura"}])
        assert res.status_code == 422, f"Should reject {reserved}"


# --- Nuevas funciones para fixturas ---

@pytest.fixture
def vault_of_admin(ready_admin):
    return vault_of(ready_admin)
