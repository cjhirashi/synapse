from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.adapters.database import get_db
from app.core.json_body import DeepJsonRoute
from app.core.dependencies import (
    get_current_user, require_admin, require_password_changed, require_super_admin,
)
from app.core.errors import (
    AdminRequired, EmailTaken, PasswordChangeRequired, StorageUnavailable, SuperAdminRequired, UserActionForbidden,
    UserNotFound, UserStateConflict,
)
from app.adapters.minio_adapter import get_object_storage
from app.core.ports.object_storage_port import ObjectStoragePort
from app.core.ports.vault_port import VaultPort
from app.core.problems import problem_responses
from app.core.schemas import (
    AdminUserOut, CreateUserRequest, TokenPayload, UpdateLimitsRequest, UpdateRoleRequest, UserUsageOut,
)
from app.routers.auth import SESSION_ERRORS, get_auth_service
from app.routers.vaults import get_vault_port
from app.services.admin_user_service import AdminUserService
from app.services.auth_service import AuthService
from app.services.limit_reconcile_service import LimitReconcileService

router = APIRouter(
    route_class=DeepJsonRoute,
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin), Depends(require_password_changed)],
    # Los errores de las dependencias del router valen para todas sus rutas.
    responses=problem_responses(*SESSION_ERRORS, AdminRequired, PasswordChangeRequired),
)

_MANAGE = (UserNotFound, UserActionForbidden, UserStateConflict, StorageUnavailable)


def get_admin_user_service(
    actor: TokenPayload = Depends(get_current_user),
    session: Session = Depends(get_db),
    auth: AuthService = Depends(get_auth_service),
    port: VaultPort = Depends(get_vault_port),
    storage: ObjectStoragePort = Depends(get_object_storage),
) -> AdminUserService:
    return AdminUserService(
        session, auth, port, LimitReconcileService(session, port, storage), actor.sub, actor.role)


@router.get("/users", response_model=list[AdminUserOut], responses=problem_responses(StorageUnavailable))
def list_users(service: AdminUserService = Depends(get_admin_user_service)):
    return service.list_all()


@router.post(
    "/users",
    status_code=status.HTTP_201_CREATED,
    response_model=AdminUserOut,
    responses=problem_responses(EmailTaken, UserActionForbidden, StorageUnavailable),
)
def create_user(body: CreateUserRequest, service: AdminUserService = Depends(get_admin_user_service)):
    return service.create(body)


@router.get("/users/{user_id}/usage", response_model=UserUsageOut, responses=problem_responses(UserNotFound, StorageUnavailable))
def user_usage(user_id: str, service: AdminUserService = Depends(get_admin_user_service)):
    return service.usage(user_id)


@router.patch("/users/{user_id}/limits", response_model=AdminUserOut, responses=problem_responses(*_MANAGE))
def update_limits(
    user_id: str, body: UpdateLimitsRequest, service: AdminUserService = Depends(get_admin_user_service),
):
    return service.set_limits(user_id, body)


@router.delete("/users/{user_id}", response_model=AdminUserOut, responses=problem_responses(*_MANAGE))
def delete_user(user_id: str, service: AdminUserService = Depends(get_admin_user_service)):
    return service.delete(user_id)


@router.post("/users/{user_id}/restore", response_model=AdminUserOut, responses=problem_responses(*_MANAGE))
def restore_user(user_id: str, service: AdminUserService = Depends(get_admin_user_service)):
    return service.restore(user_id)


@router.patch(
    "/users/{user_id}/role",
    response_model=AdminUserOut,
    dependencies=[Depends(require_super_admin)],
    responses=problem_responses(*_MANAGE, SuperAdminRequired),
)
def update_role(user_id: str, body: UpdateRoleRequest, service: AdminUserService = Depends(get_admin_user_service)):
    return service.set_role(user_id, body.role)
