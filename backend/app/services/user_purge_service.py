"""H-064 F1: limpieza de membresías e invitaciones al purgar un usuario."""

from sqlalchemy.orm import Session

from app.core.models.vault_member import VaultMember, VaultMemberGrant


class UserPurgeService:
    """Elimina relaciones de membresía e invitaciones de un usuario durante su purga."""

    def __init__(self, db: Session):
        self.db = db

    def purge(self, user_id: str) -> None:
        """Elimina todos los registros de membresía donde sea owner_id o user_id.

        Los grants se borran automáticamente por ON DELETE CASCADE.
        """
        # Encontrar todos los member_id del usuario (como owner o user)
        member_ids = self.db.query(VaultMember.id).filter(
            (VaultMember.owner_id == user_id) | (VaultMember.user_id == user_id)
        ).all()
        member_ids = [m[0] for m in member_ids]

        # Eliminar grants de esos miembros
        if member_ids:
            self.db.query(VaultMemberGrant).filter(
                VaultMemberGrant.member_id.in_(member_ids)
            ).delete(synchronize_session=False)

        # Eliminar membresías
        self.db.query(VaultMember).filter(
            (VaultMember.owner_id == user_id) | (VaultMember.user_id == user_id)
        ).delete(synchronize_session=False)

        self.db.flush()
