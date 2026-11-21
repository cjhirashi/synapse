"""Acceso a membresías de bóvedas, sus concesiones y los usuarios invitables (H-064 F2).

Toda búsqueda va acotada por propietario o por invitado: un id de miembro por sí solo nunca basta para llegar a una fila.
"""
from collections import defaultdict

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.models.user import User
from app.core.models.vault_member import VaultMember, VaultMemberGrant
from app.core.vault_access import Grant, MemberAccess


class VaultMemberRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def add(self, member: VaultMember) -> VaultMember:
        self._db.add(member)
        self._db.flush()
        return member

    def lock_owner(self, owner_id: str) -> None:
        """Serializa las invitaciones de un mismo propietario (`SELECT … FOR UPDATE` sobre su cuenta; SQLite lo ignora): sin esto,
        dos invitaciones simultáneas superan el tope de miembros o chocan con la unicidad de la fila."""
        self._db.query(User.id).filter(User.id == owner_id).with_for_update().first()

    def transition(self, member: VaultMember, expected: tuple[str, ...], values: dict) -> bool:
        """Cambia la fila solo si sigue en uno de los estados `expected` (`UPDATE … WHERE status IN …`) y la recarga. `False` si otra
        petición la movió antes: así una aceptación tardía nunca pisa una cancelación ni una salida pisa una revocación."""
        moved = self._db.query(VaultMember).filter(VaultMember.id == member.id, VaultMember.status.in_(expected)).update(
            values, synchronize_session=False)
        self._db.refresh(member)
        return moved == 1

    def get_of_owner(self, member_id: str, owner_id: str, vault_id: str) -> VaultMember | None:
        return self._db.query(VaultMember).filter(
            VaultMember.id == member_id, VaultMember.owner_id == owner_id, VaultMember.vault_id == vault_id).first()

    def get_of_user(self, member_id: str, user_id: str) -> VaultMember | None:
        return self._db.query(VaultMember).filter(VaultMember.id == member_id, VaultMember.user_id == user_id).first()

    def by_vault_and_user(self, vault_id: str, user_id: str) -> VaultMember | None:
        """La fila de (bóveda, usuario) en cualquier estado y de cualquier propietario: la unicidad es por esa pareja."""
        return self._db.query(VaultMember).filter(VaultMember.vault_id == vault_id, VaultMember.user_id == user_id).first()

    def list_of_vault(self, owner_id: str, vault_id: str) -> list[VaultMember]:
        return self._db.query(VaultMember).filter(
            VaultMember.owner_id == owner_id, VaultMember.vault_id == vault_id).order_by(VaultMember.created_at).all()

    def list_of_user(self, user_id: str, statuses: tuple[str, ...]) -> list[VaultMember]:
        return self._db.query(VaultMember).filter(
            VaultMember.user_id == user_id, VaultMember.status.in_(statuses)).order_by(VaultMember.created_at.desc()).all()

    def count_open(self, owner_id: str, vault_id: str) -> int:
        """Miembros pendientes o activos de la bóveda."""
        return self._db.query(VaultMember).filter(
            VaultMember.owner_id == owner_id, VaultMember.vault_id == vault_id,
            VaultMember.status.in_(("pendiente", "activo"))).count()

    def grants_by_member(self, member_ids: list[str]) -> dict[str, list[VaultMemberGrant]]:
        grouped: dict[str, list[VaultMemberGrant]] = defaultdict(list)
        if member_ids:
            rows = self._db.query(VaultMemberGrant).filter(VaultMemberGrant.member_id.in_(member_ids)).order_by(VaultMemberGrant.folder).all()
            for row in rows:
                grouped[row.member_id].append(row)
        return grouped

    def replace_grants(self, member_id: str, grants: list[dict]) -> None:
        self._db.query(VaultMemberGrant).filter(VaultMemberGrant.member_id == member_id).delete()
        self._db.add_all(VaultMemberGrant(member_id=member_id, folder=g["folder"], level=g["level"]) for g in grants)
        self._db.flush()

    def invitable_user(self, email: str) -> User | None:
        """Usuario activo y no dado de baja con ese correo exacto (sin distinguir mayúsculas; sin comodines)."""
        return self._db.query(User).filter(
            func.lower(User.email) == email.lower(), User.is_active.is_(True), User.deleted_at.is_(None)).first()

    def users_by_ids(self, user_ids: set[str]) -> dict[str, User]:
        if not user_ids:
            return {}
        return {u.id: u for u in self._db.query(User).filter(User.id.in_(user_ids)).all()}

    def active_access(self, user_id: str, vault_id: str) -> tuple[str, MemberAccess] | None:
        """`(owner_id, concesiones)` si `user_id` es miembro activo de la bóveda y su propietario sigue activo; si no, `None`."""
        row = self._db.query(VaultMember).join(User, User.id == VaultMember.owner_id).filter(
            VaultMember.user_id == user_id, VaultMember.vault_id == vault_id, VaultMember.status == "activo",
            User.is_active.is_(True), User.deleted_at.is_(None)).first()
        if row is None:
            return None
        grants = self.grants_by_member([row.id]).get(row.id, [])
        return row.owner_id, MemberAccess(tuple(Grant(g.folder, g.level) for g in grants))
