"""Rutas de membresía e invitaciones a bóvedas (H-064 F2).

Solo sesión humana (`get_current_user`): las invitaciones y miembros son de personas, no de agentes.
Propietario: invitar, cambiar grants, cancelar/revocar.
Invitado: listar propias invitaciones, aceptar, rechazar, salirse.
"""
import logging
from functools import lru_cache
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Response, status
from sqlalchemy.orm import Session

from app.adapters.database import get_db
from app.adapters.vault_member_repository import VaultMemberRepository
from app.adapters.notification_repository import NotificationRepository
from app.core.dependencies import get_current_user, require_password_changed
from app.core.errors import (
    InviteeNotFound, MemberNotFound, MemberAlreadyExists, MemberLimitReached,
    InvitationNotPending, ShareInvalid, VaultNotFound, PasswordChangeRequired,
)
from app.core.problems import problem_responses
from app.core.ports.vault_port import VaultPort
from app.core.schemas import (
    TokenPayload, VaultMemberInviteIn, VaultMembersListOut, VaultMemberOut, VaultMemberGrantsUpdate,
    VaultMemberGrantOut, VaultMemberUserInfo, VaultInvitationsListOut, VaultInvitationOut,
)
from app.core.vault_context import user_db_name
from app.routers.auth import SESSION_ERRORS
from app.routers.vaults import get_vault_port
from app.services.notification_service import NotificationService
from app.services.vault_member_service import VaultMemberService
from app.services.vault_service import VaultService

VaultId = Annotated[str, Path(json_schema_extra={"format": "uuid"})]
MemberId = Annotated[str, Path(min_length=1)]

router = APIRouter(
    prefix="",
    tags=["vaults"],
    dependencies=[Depends(require_password_changed)],
    responses=problem_responses(*SESSION_ERRORS, PasswordChangeRequired),
)

logger = logging.getLogger(__name__)


def get_member_service(db: Session = Depends(get_db)) -> VaultMemberService:
    return VaultMemberService(VaultMemberRepository(db))


def get_vault_service(
    current_user: TokenPayload = Depends(get_current_user),
    port: VaultPort = Depends(get_vault_port),
) -> VaultService:
    return VaultService(port, user_db_name(current_user.sub))


@router.post(
    "/vaults/{vault_id}/members",
    status_code=status.HTTP_201_CREATED,
    response_model=VaultMemberOut,
    responses=problem_responses(
        VaultNotFound, InviteeNotFound, MemberAlreadyExists, MemberLimitReached, ShareInvalid
    ),
)
def invite_member(
    vault_id: VaultId,
    body: VaultMemberInviteIn,
    current_user: TokenPayload = Depends(get_current_user),
    service: VaultMemberService = Depends(get_member_service),
    vault_service: VaultService = Depends(get_vault_service),
    db: Session = Depends(get_db),
):
    """Propietario invita un usuario a la bóveda."""
    # Verificar que la bóveda existe y es del propietario
    vault_service.get(vault_id)

    # Crear invitación
    member = service.invite(vault_id, body.email, [g.model_dump() for g in body.grants], current_user.sub)

    # Crear aviso para el invitado
    invitee_repo = VaultMemberRepository(db)
    invitee = invitee_repo.user_by_id(member.user_id)
    if invitee:
        notification_service = NotificationService(NotificationRepository(db), member.user_id)
        notification_service.notify(
            kind="vault_share",
            title=f"Te invitaron a una bóveda",
            vault_id=vault_id,
            resource_type="vault_member",
            resource_id=member.id,
            url="/compartidas",
            dedupe_key=f"vault_share:{member.id}:invited:{member.created_at.isoformat()}",
        )
    db.commit()

    # Retornar con grants cargados
    grants = invitee_repo.grants_of(member.id)
    return _member_out_with_grants(member, grants, invitee_repo)


@router.get(
    "/vaults/{vault_id}/members",
    response_model=VaultMembersListOut,
    responses=problem_responses(VaultNotFound),
)
def list_members(
    vault_id: VaultId,
    current_user: TokenPayload = Depends(get_current_user),
    vault_service: VaultService = Depends(get_vault_service),
    db: Session = Depends(get_db),
):
    """Propietario lista todos los miembros de su bóveda."""
    # Verificar que la bóveda existe y es del propietario
    vault_service.get(vault_id)

    repo = VaultMemberRepository(db)
    members = repo.list_by_vault(vault_id)
    items = []
    for member in members:
        grants = repo.grants_of(member.id)
        items.append(_member_out_with_grants(member, grants, repo))

    return VaultMembersListOut(items=items)


@router.put(
    "/vaults/{vault_id}/members/{member_id}/grants",
    response_model=VaultMemberOut,
    responses=problem_responses(
        VaultNotFound, MemberNotFound, InvitationNotPending, ShareInvalid
    ),
)
def update_member_grants(
    vault_id: VaultId,
    member_id: MemberId,
    body: VaultMemberGrantsUpdate,
    current_user: TokenPayload = Depends(get_current_user),
    vault_service: VaultService = Depends(get_vault_service),
    service: VaultMemberService = Depends(get_member_service),
    db: Session = Depends(get_db),
):
    """Propietario cambia los permisos de un miembro."""
    # Verificar que la bóveda existe y es del propietario
    vault_service.get(vault_id)

    # Verificar que el miembro es de esa bóveda
    repo = VaultMemberRepository(db)
    member = repo.get(member_id)
    if not member or member.vault_id != vault_id:
        raise MemberNotFound()

    # Actualizar grants
    member = service.update_grants(member_id, [g.model_dump() for g in body.grants])
    grants = repo.grants_of(member.id)
    return _member_out_with_grants(member, grants, repo)


@router.delete(
    "/vaults/{vault_id}/members/{member_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=problem_responses(VaultNotFound, MemberNotFound, InvitationNotPending),
)
def delete_member(
    vault_id: VaultId,
    member_id: MemberId,
    current_user: TokenPayload = Depends(get_current_user),
    vault_service: VaultService = Depends(get_vault_service),
    service: VaultMemberService = Depends(get_member_service),
    db: Session = Depends(get_db),
):
    """Propietario cancela invitación pendiente o revoca miembro activo."""
    # Verificar que la bóveda existe y es del propietario
    vault_service.get(vault_id)

    # Verificar que el miembro es de esa bóveda
    repo = VaultMemberRepository(db)
    member = repo.get(member_id)
    if not member or member.vault_id != vault_id:
        raise MemberNotFound()

    # Cancelar o revocar según estado
    if member.status == "pendiente":
        member = service.cancel_invite(member_id)
        ended_reason = "cancelada"
    elif member.status == "activo":
        member = service.revoke_member(member_id)
        ended_reason = "revocada"
    else:
        raise InvitationNotPending()

    # Crear aviso para el invitado (si estaba activo)
    if ended_reason == "revocada":
        notification_service = NotificationService(NotificationRepository(db), member.user_id)
        notification_service.notify(
            kind="vault_share",
            title="Tu acceso a una bóveda fue revocado",
            vault_id=vault_id,
            resource_type="vault_member",
            resource_id=member.id,
            url="/compartidas",
            dedupe_key=f"vault_share:{member.id}:revoked:{member.ended_at.isoformat()}",
        )
    db.commit()

    return Response(status_code=204)


@router.get(
    "/invitations",
    response_model=VaultInvitationsListOut,
)
def list_invitations(
    status: str | None = None,
    current_user: TokenPayload = Depends(get_current_user),
    db: Session = Depends(get_db),
    port: VaultPort = Depends(get_vault_port),
):
    """Invitado lista sus invitaciones y membresías."""
    repo = VaultMemberRepository(db)
    members = repo.list_by_user(current_user.sub)

    # Filtrar por status si se proporciona
    if status:
        members = [m for m in members if m.status == status]
    # Si no se especifica, mostrar solo pendiente y activo
    else:
        members = [m for m in members if m.status in ("pendiente", "activo")]

    items = []
    for member in members:
        grants = repo.grants_of(member.id)
        owner = repo.user_by_id(member.owner_id)
        # Leer nombre de la bóveda desde la base del propietario
        vault_name = None
        try:
            vault_service = VaultService(port, user_db_name(member.owner_id))
            vault = vault_service.get(member.vault_id)
            vault_name = vault.vault.name
        except Exception:
            # Si falla leer la bóveda (no existe, etc.), vault_name = None
            pass

        inv = VaultInvitationOut(
            id=member.id,
            vault_id=member.vault_id,
            status=member.status,
            created_at=member.created_at,
            responded_at=member.responded_at,
            owner=VaultMemberUserInfo(
                id=owner.id, email=owner.email, display_name=owner.display_name
            ) if owner else None,
            vault_name=vault_name,
            grants=[VaultMemberGrantOut(folder=g.folder, level=g.level) for g in grants],
        )
        items.append(inv)

    return VaultInvitationsListOut(items=items)


@router.post(
    "/invitations/{member_id}/accept",
    response_model=VaultMemberOut,
    responses=problem_responses(MemberNotFound, InvitationNotPending),
)
def accept_invitation(
    member_id: MemberId,
    current_user: TokenPayload = Depends(get_current_user),
    service: VaultMemberService = Depends(get_member_service),
    db: Session = Depends(get_db),
    port: VaultPort = Depends(get_vault_port),
):
    """Invitado acepta la invitación."""
    repo = VaultMemberRepository(db)
    member = repo.get(member_id)
    if not member or member.user_id != current_user.sub:
        raise MemberNotFound()

    # Aceptar
    member = service.accept_invite(member_id)

    # Crear aviso para el propietario
    notification_service = NotificationService(NotificationRepository(db), member.owner_id)
    notification_service.notify(
        kind="vault_share",
        title="Aceptaron tu invitación",
        vault_id=member.vault_id,
        resource_type="vault_member",
        resource_id=member.id,
        url="/compartidas",
        dedupe_key=f"vault_share:{member.id}:accepted:{member.responded_at.isoformat()}",
    )
    db.commit()

    # Retornar con grants
    grants = repo.grants_of(member.id)
    return _member_out_with_grants(member, grants, repo)


@router.post(
    "/invitations/{member_id}/reject",
    response_model=VaultMemberOut,
    responses=problem_responses(MemberNotFound, InvitationNotPending),
)
def reject_invitation(
    member_id: MemberId,
    current_user: TokenPayload = Depends(get_current_user),
    service: VaultMemberService = Depends(get_member_service),
    db: Session = Depends(get_db),
):
    """Invitado rechaza la invitación."""
    repo = VaultMemberRepository(db)
    member = repo.get(member_id)
    if not member or member.user_id != current_user.sub:
        raise MemberNotFound()

    # Rechazar
    member = service.reject_invite(member_id)

    # Crear aviso para el propietario
    notification_service = NotificationService(NotificationRepository(db), member.owner_id)
    notification_service.notify(
        kind="vault_share",
        title="Rechazaron tu invitación",
        vault_id=member.vault_id,
        resource_type="vault_member",
        resource_id=member.id,
        url="/compartidas",
        dedupe_key=f"vault_share:{member.id}:rejected:{member.responded_at.isoformat()}",
    )
    db.commit()

    # Retornar con grants
    grants = repo.grants_of(member.id)
    return _member_out_with_grants(member, grants, repo)


@router.post(
    "/invitations/{member_id}/leave",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=problem_responses(MemberNotFound, InvitationNotPending),
)
def leave_vault(
    member_id: MemberId,
    current_user: TokenPayload = Depends(get_current_user),
    service: VaultMemberService = Depends(get_member_service),
    db: Session = Depends(get_db),
):
    """Invitado se va de una bóveda."""
    repo = VaultMemberRepository(db)
    member = repo.get(member_id)
    if not member or member.user_id != current_user.sub:
        raise MemberNotFound()

    # Dejar
    member = service.leave_vault(member_id)

    # Crear aviso para el propietario
    notification_service = NotificationService(NotificationRepository(db), member.owner_id)
    notification_service.notify(
        kind="vault_share",
        title=f"{current_user.email} se fue de tu bóveda",
        vault_id=member.vault_id,
        resource_type="vault_member",
        resource_id=member.id,
        url="/compartidas",
        dedupe_key=f"vault_share:{member.id}:left:{member.ended_at.isoformat()}",
    )
    db.commit()

    return Response(status_code=204)


# --- Funciones auxiliares ---

def _member_out(member, repo: VaultMemberRepository) -> VaultMemberOut:
    """Convierte un miembro con sus grants en VaultMemberOut."""
    grants = repo.grants_of(member.id)
    user = repo.user_by_id(member.user_id)
    return VaultMemberOut(
        id=member.id,
        vault_id=member.vault_id,
        user_id=member.user_id,
        status=member.status,
        ended_reason=member.ended_reason,
        invited_by=member.invited_by,
        created_at=member.created_at,
        responded_at=member.responded_at,
        ended_at=member.ended_at,
        user=VaultMemberUserInfo(
            id=user.id, email=user.email, display_name=user.display_name
        ) if user else None,
        grants=[VaultMemberGrantOut(folder=g.folder, level=g.level) for g in grants],
    )


def _member_out_with_grants(
    member, grants: list, repo: VaultMemberRepository
) -> VaultMemberOut:
    """Convierte un miembro con grants ya cargados en VaultMemberOut."""
    user = repo.user_by_id(member.user_id)
    return VaultMemberOut(
        id=member.id,
        vault_id=member.vault_id,
        user_id=member.user_id,
        status=member.status,
        ended_reason=member.ended_reason,
        invited_by=member.invited_by,
        created_at=member.created_at,
        responded_at=member.responded_at,
        ended_at=member.ended_at,
        user=VaultMemberUserInfo(
            id=user.id, email=user.email, display_name=user.display_name
        ) if user else None,
        grants=[VaultMemberGrantOut(folder=g.folder, level=g.level) for g in grants],
    )
