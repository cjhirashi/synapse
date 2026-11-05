from fastapi import APIRouter, Depends, Response

from app.core.agent_access import actor_of
from app.core.dependencies import get_current_principal, require_password_changed
from app.core.errors import (
    AgentAccessDenied, FolderMoveInvalid, FolderNotFound, NotePathTaken, PasswordChangeRequired, StorageUnavailable, VaultNotFound,
    WikilinkRewriteConflict,
)
from app.core.json_body import DeepJsonRoute
from app.core.ports.vault_port import VaultPort
from app.core.problems import problem_responses
from app.core.schemas import FolderMove, FolderMoveOut, TokenPayload, WikilinkRewriteOut
from app.routers.auth import SESSION_ERRORS
from app.routers.vaults import VaultId, get_vault_port
from app.services.agent_access_guard import AgentAccessGuard
from app.services.change_log_service import ChangeLogService
from app.services.folder_service import FolderService

router = APIRouter(
    route_class=DeepJsonRoute,
    prefix="/vaults/{vault_id}/folders",
    tags=["folders"],
    dependencies=[Depends(require_password_changed)],
    responses=problem_responses(*SESSION_ERRORS, PasswordChangeRequired),
)


def get_folder_service(
    current_user: TokenPayload = Depends(get_current_principal),
    port: VaultPort = Depends(get_vault_port),
) -> FolderService:
    db = f"synapse_user_{current_user.sub}"
    actor = actor_of(current_user)
    return FolderService(
        port, db, actor=actor, guard=AgentAccessGuard(port, db, current_user.sub, actor),
        changelog=ChangeLogService(port, db, current_user.sub, actor))


@router.post(
    "/move",
    response_model=FolderMoveOut,
    response_model_by_alias=True,
    responses={200: {"headers": {"X-Wikilinks-Rewritten": {
        "description": "`notes=<n>; links=<m>; ambiguous=<k>; pending=<p>`", "schema": {"type": "string"}}}}}
    | problem_responses(VaultNotFound, FolderNotFound, FolderMoveInvalid, NotePathTaken, WikilinkRewriteConflict,
                        AgentAccessDenied, StorageUnavailable),
)
def move_folder(
    vault_id: VaultId,
    body: FolderMove,
    response: Response,
    service: FolderService = Depends(get_folder_service),
):
    result = service.move(vault_id, body.from_, body.to)
    response.headers["X-Wikilinks-Rewritten"] = result.rewrite.header()
    return FolderMoveOut(
        from_=result.from_, to=result.to, moved_notes=result.moved_notes,
        rewrite=WikilinkRewriteOut(**{k: getattr(result.rewrite, k) for k in ("notes", "links", "ambiguous", "pending")}))
