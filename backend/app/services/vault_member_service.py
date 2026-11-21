"""Ciclo de vida de las membresías de bóveda (H-064 F2): invitar, cambiar concesiones, cancelar, revocar, aceptar, rechazar y salir.

Cada operación recibe a quien actúa y acota por él: el propietario solo alcanza filas de su bóveda y el invitado solo las suyas
(si no, `MemberNotFound`, igual que si no existiera). El servicio no confirma la transacción ni crea avisos: lo hace quien lo llama.
"""
from datetime import UTC, datetime

from app.adapters.vault_member_repository import VaultMemberRepository
from app.core.errors import (
    InvitationNotPending, InviteeNotFound, MemberAlreadyExists, MemberLimitReached, MemberNotFound, ShareInvalid, VaultNotFound,
)
from app.core.models.vault_member import VaultMember
from app.core.vault_member_rules import check_grants

MAX_OPEN_MEMBERS = 50


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _valid_grants(grants: list[dict]) -> None:
    if check_grants(grants) is not None:
        raise ShareInvalid(errors=[{"pointer": "/grants", "detail": "The grants are invalid: folder, level, duplicates or reserved zone."}])


class VaultMemberService:
    def __init__(self, repo: VaultMemberRepository) -> None:
        self._repo = repo

    def invite(self, owner_id: str, vault_id: str, email: str, grants: list[dict]) -> VaultMember:
        """Invita a un usuario existente. Una invitación anterior terminada (revocada) se reabre sobre la misma fila."""
        _valid_grants(grants)
        self._repo.lock_owner(owner_id)
        invitee = self._repo.invitable_user(email)
        if invitee is None:
            raise InviteeNotFound()
        if invitee.id == owner_id:
            raise ShareInvalid(errors=[{"pointer": "/email", "detail": "You cannot share a vault with yourself."}])
        existing = self._repo.by_vault_and_user(vault_id, invitee.id)
        if existing is not None and existing.owner_id != owner_id:
            raise VaultNotFound()
        if existing is not None and existing.status != "revocado":
            raise MemberAlreadyExists()
        if self._repo.count_open(owner_id, vault_id) >= MAX_OPEN_MEMBERS:
            raise MemberLimitReached()
        if existing is None:
            member = self._repo.add(VaultMember(
                vault_id=vault_id, owner_id=owner_id, user_id=invitee.id, status="pendiente", invited_by="user", created_at=_now()))
        else:
            member = existing
            reopened = self._repo.transition(member, ("revocado",), {
                "status": "pendiente", "invited_by": "user", "created_at": _now(),
                "responded_at": None, "ended_at": None, "ended_reason": None})
            if not reopened:
                raise MemberAlreadyExists()
        self._repo.replace_grants(member.id, grants)
        return member

    def of_owner(self, owner_id: str, vault_id: str, member_id: str) -> VaultMember:
        member = self._repo.get_of_owner(member_id, owner_id, vault_id)
        if member is None:
            raise MemberNotFound()
        return member

    def of_user(self, user_id: str, member_id: str) -> VaultMember:
        member = self._repo.get_of_user(member_id, user_id)
        if member is None:
            raise MemberNotFound()
        return member

    def replace_grants(self, member: VaultMember, grants: list[dict]) -> VaultMember:
        if member.status == "revocado":
            raise InvitationNotPending()
        _valid_grants(grants)
        self._repo.replace_grants(member.id, grants)
        return member

    def end_by_owner(self, member: VaultMember) -> str:
        """El propietario cancela una invitación pendiente o revoca un acceso activo. Devuelve el motivo registrado."""
        reason = {"pendiente": "cancelada", "activo": "revocada"}.get(member.status)
        if reason is None:
            raise InvitationNotPending()
        self._move(member, (member.status,), reason)
        return reason

    def accept(self, member: VaultMember) -> VaultMember:
        if not self._repo.transition(member, ("pendiente",), {"status": "activo", "responded_at": _now()}):
            raise InvitationNotPending()
        return member

    def reject(self, member: VaultMember) -> VaultMember:
        self._move(member, ("pendiente",), "rechazada", responded=True)
        return member

    def leave(self, member: VaultMember) -> VaultMember:
        self._move(member, ("activo",), "salio")
        return member

    def _move(self, member: VaultMember, expected: tuple[str, ...], reason: str, responded: bool = False) -> None:
        """Termina la membresía (`revocado` + motivo) solo si sigue en el estado esperado; si otra petición ya la movió, no la pisa."""
        now = _now()
        values = {"status": "revocado", "ended_reason": reason, "ended_at": now}
        if responded:
            values["responded_at"] = now
        if not self._repo.transition(member, expected, values):
            raise InvitationNotPending()
