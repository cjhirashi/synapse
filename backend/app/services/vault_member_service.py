"""Lógica de membresía e invitaciones a bóvedas (H-064 F2).

Gestión del ciclo de vida: invitar, aceptar, rechazar, cambiar permisos, revocar, cancelar.
Los avisos se crean en la capa de router (dentro de una transacción conjunta).
"""
from datetime import UTC, datetime

from app.adapters.vault_member_repository import VaultMemberRepository
from app.core.errors import (
    InviteeNotFound, MemberNotFound, MemberAlreadyExists, MemberLimitReached,
    InvitationNotPending, ShareInvalid,
)
from app.core.models.vault_member import VaultMember, VaultMemberGrant
from app.core.vault_member_rules import check_grants


class VaultMemberService:
    """Operaciones de membresía de bóvedas."""

    def __init__(self, repo: VaultMemberRepository) -> None:
        self._repo = repo

    def invite(
        self,
        vault_id: str,
        invitee_email: str,
        grants: list[dict],
        owner_id: str,
    ) -> VaultMember:
        """Invita un usuario a una bóveda. Reutiliza fila si estaba revocada.

        Lanza:
        - `InviteeNotFound`: correo inexistente, inactivo o eliminado.
        - `MemberAlreadyExists`: ya hay pendiente o activo (no reutiliza si no estaba revocado).
        - `MemberLimitReached`: 50+ miembros pendientes/activos.
        - `ShareInvalid`: concesiones inválidas.
        """
        # Validar grants
        if check_grants(grants) is not None:
            raise ShareInvalid(errors=[{"pointer": "/grants", "detail": "Invalid grants"}])

        # Buscar usuario
        invitee = self._repo.user_by_email(invitee_email)
        if invitee is None:
            raise InviteeNotFound()

        # No puede invitarse a sí mismo
        if invitee.id == owner_id:
            raise ShareInvalid(errors=[{"pointer": "/email", "detail": "Cannot share with yourself"}])

        # Buscar si existe una relación (cualquier estado)
        existing = self._repo.get_by_vault_and_user(vault_id, invitee.id)
        if existing:
            if existing.status in ("pendiente", "activo"):
                raise MemberAlreadyExists()
            # Estado "revocado": reutiliza la fila
            existing.status = "pendiente"
            existing.created_at = datetime.now(UTC).replace(tzinfo=None)
            existing.responded_at = None
            existing.ended_at = None
            existing.ended_reason = None
            existing.invited_by = "user"
            # Elimina grants antiguos
            self._repo.delete_grants_of(existing.id)
            # Añade nuevos grants
            for grant in grants:
                self._repo.add_grant(VaultMemberGrant(
                    member_id=existing.id,
                    folder=grant["folder"],
                    level=grant["level"]
                ))
            self._repo.flush()
            return existing

        # Comprobar límite de pendientes/activos
        pending_active = self._repo.list_pending_active_by_vault(vault_id)
        if len(pending_active) >= 50:
            raise MemberLimitReached()

        # Crear nuevo miembro
        member = VaultMember(
            vault_id=vault_id,
            owner_id=owner_id,
            user_id=invitee.id,
            status="pendiente",
            ended_reason=None,
            invited_by="user",
            created_at=datetime.now(UTC).replace(tzinfo=None),
            responded_at=None,
            ended_at=None,
        )
        self._repo.add(member)
        self._repo.flush()

        # Añade grants
        for grant in grants:
            self._repo.add_grant(VaultMemberGrant(
                member_id=member.id,
                folder=grant["folder"],
                level=grant["level"]
            ))
        self._repo.flush()

        return member

    def get_member(self, member_id: str) -> VaultMember:
        """Lee un miembro; lanza `MemberNotFound` si no existe."""
        member = self._repo.get(member_id)
        if not member:
            raise MemberNotFound()
        return member

    def list_members(self, vault_id: str) -> list[tuple[VaultMember, list[VaultMemberGrant]]]:
        """Lista todos los miembros de una bóveda con sus grants."""
        members = self._repo.list_by_vault(vault_id)
        result = []
        for member in members:
            grants = self._repo.grants_of(member.id)
            result.append((member, grants))
        return result

    def update_grants(self, member_id: str, grants: list[dict]) -> VaultMember:
        """Reemplaza todos los grants de un miembro.

        Lanza:
        - `MemberNotFound`: miembro inexistente.
        - `InvitationNotPending`: miembro no está en estado pendiente o activo.
        - `ShareInvalid`: grants inválidos.
        """
        member = self.get_member(member_id)
        if member.status not in ("pendiente", "activo"):
            raise InvitationNotPending()

        if check_grants(grants) is not None:
            raise ShareInvalid(errors=[{"pointer": "/grants", "detail": "Invalid grants"}])

        # Elimina y reemplaza grants
        self._repo.delete_grants_of(member.id)
        for grant in grants:
            self._repo.add_grant(VaultMemberGrant(
                member_id=member.id,
                folder=grant["folder"],
                level=grant["level"]
            ))
        self._repo.flush()

        return member

    def cancel_invite(self, member_id: str) -> VaultMember:
        """Propietario cancela una invitación pendiente.

        Lanza:
        - `MemberNotFound`: miembro inexistente.
        - `InvitationNotPending`: miembro no está pendiente.
        """
        member = self.get_member(member_id)
        if member.status != "pendiente":
            raise InvitationNotPending()

        member.status = "revocado"
        member.ended_reason = "cancelada"
        member.ended_at = datetime.now(UTC).replace(tzinfo=None)
        self._repo.update(member)
        self._repo.flush()
        return member

    def revoke_member(self, member_id: str) -> VaultMember:
        """Propietario revoca un miembro activo.

        Lanza:
        - `MemberNotFound`: miembro inexistente.
        - `InvitationNotPending`: miembro no está activo.
        """
        member = self.get_member(member_id)
        if member.status != "activo":
            raise InvitationNotPending()

        member.status = "revocado"
        member.ended_reason = "revocada"
        member.ended_at = datetime.now(UTC).replace(tzinfo=None)
        self._repo.update(member)
        self._repo.flush()
        return member

    def accept_invite(self, member_id: str) -> VaultMember:
        """Invitado acepta la invitación.

        Lanza:
        - `MemberNotFound`: miembro inexistente.
        - `InvitationNotPending`: miembro no está pendiente.
        """
        member = self.get_member(member_id)
        if member.status != "pendiente":
            raise InvitationNotPending()

        member.status = "activo"
        member.responded_at = datetime.now(UTC).replace(tzinfo=None)
        self._repo.update(member)
        self._repo.flush()
        return member

    def reject_invite(self, member_id: str) -> VaultMember:
        """Invitado rechaza la invitación.

        Lanza:
        - `MemberNotFound`: miembro inexistente.
        - `InvitationNotPending`: miembro no está pendiente.
        """
        member = self.get_member(member_id)
        if member.status != "pendiente":
            raise InvitationNotPending()

        member.status = "revocado"
        member.ended_reason = "rechazada"
        member.responded_at = datetime.now(UTC).replace(tzinfo=None)
        member.ended_at = datetime.now(UTC).replace(tzinfo=None)
        self._repo.update(member)
        self._repo.flush()
        return member

    def leave_vault(self, member_id: str) -> VaultMember:
        """Invitado se va de una bóveda.

        Lanza:
        - `MemberNotFound`: miembro inexistente.
        - `InvitationNotPending`: miembro no está activo.
        """
        member = self.get_member(member_id)
        if member.status != "activo":
            raise InvitationNotPending()

        member.status = "revocado"
        member.ended_reason = "salio"
        member.ended_at = datetime.now(UTC).replace(tzinfo=None)
        self._repo.update(member)
        self._repo.flush()
        return member
