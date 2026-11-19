"""Acceso a membresía e invitaciones a bóvedas (H-064 F2)."""
from datetime import UTC, datetime
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.core.models.vault_member import VaultMember, VaultMemberGrant
from app.core.models.user import User


class VaultMemberRepository:
    """CRUD de miembros de bóvedas y sus permisos."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def add(self, member: VaultMember) -> VaultMember:
        """Añade un miembro y lo devuelve con id."""
        self._db.add(member)
        self._db.flush()
        return member

    def get(self, member_id: str) -> VaultMember | None:
        """Lee un miembro por id."""
        return self._db.query(VaultMember).filter(VaultMember.id == member_id).first()

    def get_by_vault_and_user(self, vault_id: str, user_id: str) -> VaultMember | None:
        """Busca un miembro existente en (vault_id, user_id) sin filtro de estado."""
        return self._db.query(VaultMember).filter(
            and_(VaultMember.vault_id == vault_id, VaultMember.user_id == user_id)
        ).first()

    def list_by_vault(self, vault_id: str) -> list[VaultMember]:
        """Lista todos los miembros de una bóveda (todos los estados), con usuarios completos."""
        return self._db.query(VaultMember).filter(VaultMember.vault_id == vault_id).all()

    def list_pending_active_by_vault(self, vault_id: str) -> list[VaultMember]:
        """Lista solo miembros con status pendiente o activo de una bóveda."""
        return self._db.query(VaultMember).filter(
            and_(
                VaultMember.vault_id == vault_id,
                VaultMember.status.in_(("pendiente", "activo"))
            )
        ).all()

    def list_by_user(self, user_id: str, status: str | None = None) -> list[VaultMember]:
        """Lista invitaciones de un usuario (opcional: filtro por status)."""
        query = self._db.query(VaultMember).filter(VaultMember.user_id == user_id)
        if status:
            query = query.filter(VaultMember.status == status)
        return query.all()

    def update(self, member: VaultMember) -> VaultMember:
        """Actualiza un miembro."""
        self._db.merge(member)
        self._db.flush()
        return self.get(member.id)

    def add_grant(self, grant: VaultMemberGrant) -> VaultMemberGrant:
        """Añade un permiso."""
        self._db.add(grant)
        self._db.flush()
        return grant

    def grants_of(self, member_id: str) -> list[VaultMemberGrant]:
        """Lee todos los permisos de un miembro."""
        return self._db.query(VaultMemberGrant).filter(VaultMemberGrant.member_id == member_id).all()

    def delete_grants_of(self, member_id: str) -> None:
        """Borra todos los permisos de un miembro (antes de reemplazarlos)."""
        self._db.query(VaultMemberGrant).filter(VaultMemberGrant.member_id == member_id).delete()
        self._db.flush()

    def commit(self) -> None:
        """Confirma la transacción."""
        self._db.commit()

    def refresh(self, obj) -> None:
        """Refresca un objeto desde la BD (para ver cambios post-commit)."""
        self._db.refresh(obj)

    def user_by_email(self, email: str) -> User | None:
        """Busca un usuario por email (case-insensitive) y verifica que esté activo."""
        normalized = email.lower()
        return self._db.query(User).filter(
            User.email.ilike(normalized),
            User.is_active == True,
            User.deleted_at.is_(None)
        ).first()

    def user_by_id(self, user_id: str) -> User | None:
        """Lee un usuario por id."""
        return self._db.query(User).filter(User.id == user_id).first()
