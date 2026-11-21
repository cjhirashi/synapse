"""H-064 F1: tablas de membresía e invitaciones, con permisos por carpeta."""

from datetime import UTC, datetime
import pytest
from sqlalchemy.exc import IntegrityError

from app.core.models.vault_member import VaultMember, VaultMemberGrant
from app.core.models.user import User
from app.core.models.role import Role
from app.adapters.couchdb import CouchDBAdapter
from app.services.user_purge_service import UserPurgeService
from tests.fake_object_storage import FakeObjectStorage


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



def _user(db, role, uid):
    user = User(id=uid, email=f"{uid}@test.com", hashed_password="hash", is_active=True, role_id=role.id,
                couchdb_name=f"synapse_user_{uid}", created_at=datetime.now(UTC).replace(tzinfo=None))
    db.add(user)
    return user


def _member(db, mid, vault, owner, guest, folder):
    now = datetime.now(UTC).replace(tzinfo=None)
    db.add(VaultMember(id=mid, vault_id=vault, owner_id=owner, user_id=guest, status="activo", invited_by=owner, created_at=now))
    db.add(VaultMemberGrant(id=f"g-{mid}", member_id=mid, folder=folder, level="escritura"))


def _purge(db, uid):
    UserPurgeService(db, CouchDBAdapter(), FakeObjectStorage()).purge(uid)


def _counts(db):
    return db.query(VaultMember).count(), db.query(VaultMemberGrant).count()


def test_purge_owner_removes_its_memberships_and_grants_only(db):
    role = db.query(Role).first()
    for uid in ("po", "pg1", "pg2", "px", "py"):
        _user(db, role, uid)
    db.flush()
    _member(db, "m1", "v1", "po", "pg1", "*")
    _member(db, "m2", "v1", "po", "pg2", "Docs")
    _member(db, "m3", "v9", "px", "py", "*")
    db.commit()

    _purge(db, "po")

    assert db.query(User).filter(User.id == "po").count() == 0
    assert [m.id for m in db.query(VaultMember)] == ["m3"]
    assert [g.member_id for g in db.query(VaultMemberGrant)] == ["m3"]


def test_purge_guest_removes_its_invitations_and_keeps_the_owner_ones(db):
    role = db.query(Role).first()
    for uid in ("qo", "qg", "qh"):
        _user(db, role, uid)
    db.flush()
    _member(db, "n1", "v1", "qo", "qg", "*")
    _member(db, "n2", "v1", "qo", "qh", "Docs")
    db.commit()

    _purge(db, "qg")

    assert db.query(User).filter(User.id == "qo").count() == 1
    assert _counts(db) == (1, 1)
    assert db.query(VaultMember).one().user_id == "qh"

