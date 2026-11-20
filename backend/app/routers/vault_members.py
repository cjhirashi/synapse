"""Invitaciones y membresías de bóveda (H-064 F2).

Solo sesión humana (`get_current_user`): una clave de agente no invita ni responde (sí puede listar sus invitaciones, H-064 F4). El propietario invita, cambia concesiones,
cancela y revoca; el invitado ve sus invitaciones, las acepta o rechaza y puede salir.
"""
from collections.abc import Callable
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Path, Query, Response, status
from sqlalchemy.orm import Session

from app.adapters.database import get_db
from app.adapters.notification_repository import NotificationRepository
from app.adapters.vault_member_repository import VaultMemberRepository
from app.core import bitacora_rules
from app.core.dependencies import get_current_principal, get_current_user, require_password_changed
from app.core.errors import (
    InvitationNotPending, InviteeNotFound, MemberAlreadyExists, MemberLimitReached, MemberNotFound, PasswordChangeRequired,
    ShareInvalid, StorageUnavailable, VaultNotFound,
)
from app.core.models.change_log import ChangeLog
from app.core.models.user import User
from app.core.models.vault_member import VaultMember, VaultMemberGrant
from app.core.ports.vault_port import VaultPort
from app.core.problems import problem_responses
from app.core.schemas import (
    TokenPayload, VaultInvitationOut, VaultInvitationsListOut, VaultMemberGrantOut, VaultMemberGrantsUpdate, VaultMemberInviteIn,
    VaultMemberOut, VaultMembersListOut, VaultMemberUserInfo,
)
from app.core.vault_context import user_db_name
from app.routers.auth import SESSION_ERRORS
from app.routers.vaults import get_vault_port
from app.services.change_log_service import Author, ChangeLogService
from app.services.notification_service import NotificationService
from app.services.vault_member_service import VaultMemberService
from app.services.vault_service import VaultService

VaultId = Annotated[str, Path(json_schema_extra={"format": "uuid"})]
MemberId = Annotated[str, Path(min_length=1, max_length=64)]

router = APIRouter(
    tags=["sharing"],
    dependencies=[Depends(require_password_changed)],
    responses=problem_responses(*SESSION_ERRORS, PasswordChangeRequired),
)


def get_repo(db: Session = Depends(get_db)) -> VaultMemberRepository:
    return VaultMemberRepository(db)


def get_service(repo: VaultMemberRepository = Depends(get_repo)) -> VaultMemberService:
    return VaultMemberService(repo)


def _owned_vault(user: TokenPayload, port: VaultPort, vault_id: str):
    """La bóveda del propietario o `VaultNotFound` (la base sale solo de la sesión)."""
    return VaultService(port, user_db_name(user.sub)).get(vault_id).vault


def _vault_name(port: VaultPort, owner_id: str, vault_id: str) -> str | None:
    """Nombre de la bóveda leído de la base del propietario; `None` si ya no existe o no responde. Es lo único de la bóveda que ve el invitado."""
    try:
        return VaultService(port, user_db_name(owner_id)).get(vault_id).vault.name
    except (VaultNotFound, StorageUnavailable):
        return None


def _who(user: User | None) -> str:
    return (user.display_name or user.email) if user else "Alguien"


def _user_info(user: User | None) -> VaultMemberUserInfo | None:
    return VaultMemberUserInfo(id=user.id, email=user.email, display_name=user.display_name) if user else None


def _grants_out(grants: list[VaultMemberGrant]) -> list[VaultMemberGrantOut]:
    return [VaultMemberGrantOut(folder=g.folder, level=g.level) for g in grants]


def _member_out(member: VaultMember, grants: list[VaultMemberGrant], user: User | None) -> VaultMemberOut:
    return VaultMemberOut(
        id=member.id, vault_id=member.vault_id, user_id=member.user_id, status=member.status, ended_reason=member.ended_reason,
        invited_by=member.invited_by, created_at=member.created_at, responded_at=member.responded_at, ended_at=member.ended_at,
        user=_user_info(user), grants=_grants_out(grants))


def _one_out(repo: VaultMemberRepository, member: VaultMember) -> VaultMemberOut:
    return _member_out(member, repo.grants_by_member([member.id]).get(member.id, []), repo.users_by_ids({member.user_id}).get(member.user_id))


def _notify(db: Session, recipient_id: str, member: VaultMember, event: str, title: str) -> None:
    """Aviso de bóveda compartida para `recipient_id`, en la sesión del cambio (quien llama confirma)."""
    stamp = member.ended_at or member.responded_at or member.created_at
    NotificationService(NotificationRepository(db), recipient_id).notify(
        "vault_share", title, vault_id=member.vault_id, resource_type="vault_member", resource_id=member.id, url="/compartidas",
        dedupe_key=f"vault_share:{member.id}:{event}:{stamp.isoformat()}")


def _log(
    db: Session, port: VaultPort, repo: VaultMemberRepository, member: VaultMember, op: str, actor_id: str, detail: str | None = None,
) -> ChangeLogService:
    """Anota en la BITACORA del propietario el evento `op`, en la misma transacción que el cambio de membresía."""
    users = repo.users_by_ids({actor_id, member.user_id})
    actor, guest = users.get(actor_id), users.get(member.user_id)
    log = ChangeLogService(port, user_db_name(member.owner_id), member.owner_id, author=Author("human", actor.email if actor else actor_id))
    db.add(ChangeLog(**log.member_row(member.vault_id, member.id, op, guest.email if guest else member.user_id, detail)))
    return log


def _commit_logged(db: Session, log: ChangeLogService) -> None:
    """Confirma el cambio y su anotación; el documento del día de BITACORA es de mejor esfuerzo (`rebuild` lo repara desde la tabla)."""
    db.commit()
    log.flush()


@router.post(
    "/vaults/{vault_id}/members", status_code=status.HTTP_201_CREATED, response_model=VaultMemberOut,
    responses=problem_responses(VaultNotFound, InviteeNotFound, MemberAlreadyExists, MemberLimitReached, ShareInvalid),
)
def invite_member(
    vault_id: VaultId, body: VaultMemberInviteIn, user: TokenPayload = Depends(get_current_user),
    service: VaultMemberService = Depends(get_service), repo: VaultMemberRepository = Depends(get_repo),
    port: VaultPort = Depends(get_vault_port), db: Session = Depends(get_db),
):
    vault = _owned_vault(user, port, vault_id)
    member = service.invite(user.sub, vault_id, body.email, [g.model_dump() for g in body.grants])
    owner = repo.users_by_ids({user.sub}).get(user.sub)
    _notify(db, member.user_id, member, "invited", f"{_who(owner)} te invitó a la bóveda «{vault.name}»")
    log = _log(db, port, repo, member, "invite", user.sub, bitacora_rules.grants_summary([g.model_dump() for g in body.grants]))
    _commit_logged(db, log)
    return _one_out(repo, member)


@router.get("/vaults/{vault_id}/members", response_model=VaultMembersListOut, responses=problem_responses(VaultNotFound))
def list_members(
    vault_id: VaultId, user: TokenPayload = Depends(get_current_user), repo: VaultMemberRepository = Depends(get_repo),
    port: VaultPort = Depends(get_vault_port),
):
    _owned_vault(user, port, vault_id)
    members = repo.list_of_vault(user.sub, vault_id)
    grants = repo.grants_by_member([m.id for m in members])
    users = repo.users_by_ids({m.user_id for m in members})
    return VaultMembersListOut(items=[_member_out(m, grants.get(m.id, []), users.get(m.user_id)) for m in members])


@router.put(
    "/vaults/{vault_id}/members/{member_id}/grants", response_model=VaultMemberOut,
    responses=problem_responses(VaultNotFound, MemberNotFound, InvitationNotPending, ShareInvalid),
)
def update_member_grants(
    vault_id: VaultId, member_id: MemberId, body: VaultMemberGrantsUpdate, user: TokenPayload = Depends(get_current_user),
    service: VaultMemberService = Depends(get_service), repo: VaultMemberRepository = Depends(get_repo),
    port: VaultPort = Depends(get_vault_port), db: Session = Depends(get_db),
):
    _owned_vault(user, port, vault_id)
    grants = [g.model_dump() for g in body.grants]
    member = service.replace_grants(service.of_owner(user.sub, vault_id, member_id), grants)
    log = _log(db, port, repo, member, "regrant", user.sub, bitacora_rules.grants_summary(grants))
    _commit_logged(db, log)
    return _one_out(repo, member)


@router.delete(
    "/vaults/{vault_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT,
    responses=problem_responses(VaultNotFound, MemberNotFound, InvitationNotPending),
)
def end_member(
    vault_id: VaultId, member_id: MemberId, user: TokenPayload = Depends(get_current_user),
    service: VaultMemberService = Depends(get_service), repo: VaultMemberRepository = Depends(get_repo),
    port: VaultPort = Depends(get_vault_port), db: Session = Depends(get_db),
):
    """Cancela una invitación pendiente o revoca un acceso activo. Las concesiones se conservan como historial."""
    vault = _owned_vault(user, port, vault_id)
    member = service.of_owner(user.sub, vault_id, member_id)
    reason = service.end_by_owner(member)
    if reason == "cancelada":
        _notify(db, member.user_id, member, "cancelled", f"Se canceló tu invitación a la bóveda «{vault.name}»")
    else:
        _notify(db, member.user_id, member, "revoked", f"Se revocó tu acceso a la bóveda «{vault.name}»")
    log = _log(db, port, repo, member, "cancel" if reason == "cancelada" else "revoke", user.sub)
    _commit_logged(db, log)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/invitations", response_model=VaultInvitationsListOut)
def list_invitations(
    state: Annotated[Literal["pendiente", "activo", "revocado"] | None, Query(alias="status")] = None,
    user: TokenPayload = Depends(get_current_principal), repo: VaultMemberRepository = Depends(get_repo),
    port: VaultPort = Depends(get_vault_port),
):
    """Mis invitaciones y accesos; sin `status`, los pendientes y los activos. Es de solo lectura y también la leen las claves
    de API de la cuenta (H-064 F4: así el plugin de un agente descubre las bóvedas compartidas); responder sigue siendo solo de la sesión."""
    members = repo.list_of_user(user.sub, (state,) if state else ("pendiente", "activo"))
    grants = repo.grants_by_member([m.id for m in members])
    owners = repo.users_by_ids({m.owner_id for m in members})
    return VaultInvitationsListOut(items=[
        VaultInvitationOut(
            id=m.id, vault_id=m.vault_id, status=m.status, created_at=m.created_at, responded_at=m.responded_at,
            owner=_user_info(owners.get(m.owner_id)), vault_name=_vault_name(port, m.owner_id, m.vault_id), grants=_grants_out(grants.get(m.id, [])))
        for m in members])


def _respond(
    member_id: str, event: str, op: str, transition: Callable[[VaultMember], VaultMember], text: str, user: TokenPayload,
    service: VaultMemberService, repo: VaultMemberRepository, port: VaultPort, db: Session,
) -> VaultMember:
    """Aplica `transition` a mi invitación y avisa al propietario."""
    member = transition(service.of_user(user.sub, member_id))
    me = repo.users_by_ids({user.sub}).get(user.sub)
    name = _vault_name(port, member.owner_id, member.vault_id) or "una bóveda"
    _notify(db, member.owner_id, member, event, f"{_who(me)} {text} «{name}»")
    log = _log(db, port, repo, member, op, user.sub)
    _commit_logged(db, log)
    return member


@router.post(
    "/invitations/{member_id}/accept", response_model=VaultMemberOut, responses=problem_responses(MemberNotFound, InvitationNotPending))
def accept_invitation(
    member_id: MemberId, user: TokenPayload = Depends(get_current_user), service: VaultMemberService = Depends(get_service),
    repo: VaultMemberRepository = Depends(get_repo), port: VaultPort = Depends(get_vault_port), db: Session = Depends(get_db),
):
    return _one_out(repo, _respond(member_id, "accepted", "accept", service.accept, "aceptó tu invitación a", user, service, repo, port, db))


@router.post(
    "/invitations/{member_id}/reject", response_model=VaultMemberOut, responses=problem_responses(MemberNotFound, InvitationNotPending))
def reject_invitation(
    member_id: MemberId, user: TokenPayload = Depends(get_current_user), service: VaultMemberService = Depends(get_service),
    repo: VaultMemberRepository = Depends(get_repo), port: VaultPort = Depends(get_vault_port), db: Session = Depends(get_db),
):
    return _one_out(repo, _respond(member_id, "rejected", "reject", service.reject, "rechazó tu invitación a", user, service, repo, port, db))


@router.post(
    "/invitations/{member_id}/leave", status_code=status.HTTP_204_NO_CONTENT,
    responses=problem_responses(MemberNotFound, InvitationNotPending))
def leave_vault(
    member_id: MemberId, user: TokenPayload = Depends(get_current_user), service: VaultMemberService = Depends(get_service),
    repo: VaultMemberRepository = Depends(get_repo), port: VaultPort = Depends(get_vault_port), db: Session = Depends(get_db),
):
    _respond(member_id, "left", "leave", service.leave, "salió de la bóveda", user, service, repo, port, db)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
