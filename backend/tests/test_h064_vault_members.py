"""H-064 F1: tablas de membresía e invitaciones, con permisos por carpeta."""

from datetime import UTC, datetime
import pytest
from sqlalchemy.exc import IntegrityError

from app.core.models.vault_member import VaultMember, VaultMemberGrant
from app.core.models.user import User
from app.core.models.role import Role
from app.services.user_purge_service import UserPurgeService


def test_vault_members_valid_insert(db):
    """Inserción válida de membresía."""
    role = db.query(Role).first()
    owner = User(
        id="owner-001",
        email="owner@test.com",
        hashed_password="hash",
        is_active=True,
        role_id=role.id,
        couchdb_name="synapse_user_owner-001",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    invitee = User(
        id="invitee-001",
        email="invitee@test.com",
        hashed_password="hash",
        is_active=True,
        role_id=role.id,
        couchdb_name="synapse_user_invitee-001",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    db.add(owner)
    db.add(invitee)
    db.flush()

    member = VaultMember(
        id="member-001",
        vault_id="vault-123",
        owner_id=owner.id,
        user_id=invitee.id,
        status="activo",
        invited_by="user",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    db.add(member)
    db.commit()

    result = db.query(VaultMember).filter_by(id="member-001").first()
    assert result is not None
    assert result.vault_id == "vault-123"
    assert result.status == "activo"


def test_vault_members_unique_constraint(db):
    """Constraint unique: (vault_id, user_id)."""
    role = db.query(Role).first()
    owner = User(
        id="owner-002",
        email="owner2@test.com",
        hashed_password="hash",
        is_active=True,
        role_id=role.id,
        couchdb_name="synapse_user_owner-002",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    invitee = User(
        id="invitee-002",
        email="invitee2@test.com",
        hashed_password="hash",
        is_active=True,
        role_id=role.id,
        couchdb_name="synapse_user_invitee-002",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    db.add(owner)
    db.add(invitee)
    db.flush()

    m1 = VaultMember(
        id="m1",
        vault_id="vault-200",
        owner_id=owner.id,
        user_id=invitee.id,
        status="activo",
        invited_by="user",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    db.add(m1)
    db.commit()

    m2 = VaultMember(
        id="m2",
        vault_id="vault-200",
        owner_id=owner.id,
        user_id=invitee.id,
        status="pendiente",
        invited_by="user",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    db.add(m2)

    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_vault_members_invalid_status(db):
    """Status debe estar en lista blanca."""
    role = db.query(Role).first()
    owner = User(
        id="owner-003",
        email="owner3@test.com",
        hashed_password="hash",
        is_active=True,
        role_id=role.id,
        couchdb_name="synapse_user_owner-003",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    invitee = User(
        id="invitee-003",
        email="invitee3@test.com",
        hashed_password="hash",
        is_active=True,
        role_id=role.id,
        couchdb_name="synapse_user_invitee-003",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    db.add(owner)
    db.add(invitee)
    db.flush()

    member = VaultMember(
        id="member-invalid",
        vault_id="vault-300",
        owner_id=owner.id,
        user_id=invitee.id,
        status="invalid_status",
        invited_by="user",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    db.add(member)

    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_vault_members_owner_ne_user(db):
    """Check constraint: owner_id != user_id."""
    role = db.query(Role).first()
    user = User(
        id="user-same",
        email="same@test.com",
        hashed_password="hash",
        is_active=True,
        role_id=role.id,
        couchdb_name="synapse_user_same",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    db.add(user)
    db.flush()

    member = VaultMember(
        id="member-same",
        vault_id="vault-400",
        owner_id=user.id,
        user_id=user.id,
        status="activo",
        invited_by="user",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    db.add(member)

    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_vault_member_grants_valid(db):
    """Inserción válida de permiso."""
    role = db.query(Role).first()
    owner = User(
        id="owner-004",
        email="owner4@test.com",
        hashed_password="hash",
        is_active=True,
        role_id=role.id,
        couchdb_name="synapse_user_owner-004",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    invitee = User(
        id="invitee-004",
        email="invitee4@test.com",
        hashed_password="hash",
        is_active=True,
        role_id=role.id,
        couchdb_name="synapse_user_invitee-004",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    db.add(owner)
    db.add(invitee)
    db.flush()

    member = VaultMember(
        id="member-004",
        vault_id="vault-500",
        owner_id=owner.id,
        user_id=invitee.id,
        status="activo",
        invited_by="user",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    db.add(member)
    db.flush()

    grant = VaultMemberGrant(
        id="grant-001",
        member_id=member.id,
        folder="Proyectos",
        level="lectura",
    )
    db.add(grant)
    db.commit()

    result = db.query(VaultMemberGrant).filter_by(id="grant-001").first()
    assert result is not None
    assert result.folder == "Proyectos"
    assert result.level == "lectura"


def test_vault_member_grants_no_orphans_after_purge(db):
    """Purga explícita: se borran grants y membresía juntos."""
    role = db.query(Role).first()
    owner = User(
        id="owner-005",
        email="owner5@test.com",
        hashed_password="hash",
        is_active=True,
        role_id=role.id,
        couchdb_name="synapse_user_owner-005",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    invitee = User(
        id="invitee-005",
        email="invitee5@test.com",
        hashed_password="hash",
        is_active=True,
        role_id=role.id,
        couchdb_name="synapse_user_invitee-005",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    db.add(owner)
    db.add(invitee)
    db.flush()

    member = VaultMember(
        id="member-005",
        vault_id="vault-600",
        owner_id=owner.id,
        user_id=invitee.id,
        status="activo",
        invited_by="user",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    db.add(member)
    db.flush()

    grant = VaultMemberGrant(
        id="grant-cascade",
        member_id=member.id,
        folder="*",
        level="escritura",
    )
    db.add(grant)
    db.commit()

    # Purga usando el servicio
    service = UserPurgeService(db)
    service.purge(owner.id)
    db.commit()

    # Grant se borró junto con la membresía
    result = db.query(VaultMemberGrant).filter_by(id="grant-cascade").first()
    assert result is None


def test_vault_member_grants_invalid_level(db):
    """Level debe estar en lista blanca."""
    role = db.query(Role).first()
    owner = User(
        id="owner-006",
        email="owner6@test.com",
        hashed_password="hash",
        is_active=True,
        role_id=role.id,
        couchdb_name="synapse_user_owner-006",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    invitee = User(
        id="invitee-006",
        email="invitee6@test.com",
        hashed_password="hash",
        is_active=True,
        role_id=role.id,
        couchdb_name="synapse_user_invitee-006",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    db.add(owner)
    db.add(invitee)
    db.flush()

    member = VaultMember(
        id="member-006",
        vault_id="vault-700",
        owner_id=owner.id,
        user_id=invitee.id,
        status="activo",
        invited_by="user",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    db.add(member)
    db.flush()

    grant = VaultMemberGrant(
        id="grant-invalid",
        member_id=member.id,
        folder="Notas",
        level="admin",
    )
    db.add(grant)

    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_purge_owner_removes_all_memberships(db):
    """Purga del propietario: borra todas las membresías donde es owner_id."""
    role = db.query(Role).first()
    owner = User(
        id="owner-purge",
        email="owner-purge@test.com",
        hashed_password="hash",
        is_active=True,
        role_id=role.id,
        couchdb_name="synapse_user_owner-purge",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    invitee1 = User(
        id="invitee-purge-1",
        email="invitee-purge-1@test.com",
        hashed_password="hash",
        is_active=True,
        role_id=role.id,
        couchdb_name="synapse_user_invitee-purge-1",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    invitee2 = User(
        id="invitee-purge-2",
        email="invitee-purge-2@test.com",
        hashed_password="hash",
        is_active=True,
        role_id=role.id,
        couchdb_name="synapse_user_invitee-purge-2",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    third_party = User(
        id="third-party",
        email="third@test.com",
        hashed_password="hash",
        is_active=True,
        role_id=role.id,
        couchdb_name="synapse_user_third",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    db.add_all([owner, invitee1, invitee2, third_party])
    db.flush()

    m1 = VaultMember(
        id="member-purge-1",
        vault_id="vault-purge-1",
        owner_id=owner.id,
        user_id=invitee1.id,
        status="activo",
        invited_by="user",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    m2 = VaultMember(
        id="member-purge-2",
        vault_id="vault-purge-2",
        owner_id=owner.id,
        user_id=invitee2.id,
        status="pendiente",
        invited_by="user",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    m3 = VaultMember(
        id="member-third",
        vault_id="vault-third",
        owner_id=third_party.id,
        user_id=invitee1.id,
        status="activo",
        invited_by="user",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    db.add_all([m1, m2, m3])
    db.flush()

    g1 = VaultMemberGrant(id="g1", member_id=m1.id, folder="*", level="lectura")
    g2 = VaultMemberGrant(id="g2", member_id=m2.id, folder="Notas", level="escritura")
    db.add_all([g1, g2])
    db.commit()

    service = UserPurgeService(db)
    service.purge(owner.id)
    db.commit()

    assert db.query(VaultMember).filter_by(owner_id=owner.id).count() == 0
    assert db.query(VaultMemberGrant).filter_by(id="g1").first() is None
    assert db.query(VaultMemberGrant).filter_by(id="g2").first() is None
    assert db.query(VaultMember).filter_by(id="member-third").first() is not None


def test_purge_invitee_removes_invitations(db):
    """Purga del invitado: borra todas las membresías donde es user_id."""
    role = db.query(Role).first()
    owner = User(
        id="owner-purge-2",
        email="owner-purge-2@test.com",
        hashed_password="hash",
        is_active=True,
        role_id=role.id,
        couchdb_name="synapse_user_owner-purge-2",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    invitee = User(
        id="invitee-purge-guest",
        email="guest@test.com",
        hashed_password="hash",
        is_active=True,
        role_id=role.id,
        couchdb_name="synapse_user_guest",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    db.add_all([owner, invitee])
    db.flush()

    m1 = VaultMember(
        id="member-guest-1",
        vault_id="vault-guest-1",
        owner_id=owner.id,
        user_id=invitee.id,
        status="activo",
        invited_by="user",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    m2 = VaultMember(
        id="member-guest-2",
        vault_id="vault-guest-2",
        owner_id=owner.id,
        user_id=invitee.id,
        status="pendiente",
        invited_by="user",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    db.add_all([m1, m2])
    db.flush()

    g1 = VaultMemberGrant(id="gg1", member_id=m1.id, folder="*", level="lectura")
    db.add(g1)
    db.commit()

    service = UserPurgeService(db)
    service.purge(invitee.id)
    db.commit()

    assert db.query(VaultMember).filter_by(user_id=invitee.id).count() == 0
    assert db.query(VaultMemberGrant).filter_by(id="gg1").first() is None
