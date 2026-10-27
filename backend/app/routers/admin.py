from fastapi import APIRouter, Depends, status

from app.core.json_body import DeepJsonRoute
from app.core.dependencies import require_admin, require_password_changed
from app.core.errors import AdminRequired, EmailTaken, PasswordChangeRequired, StorageUnavailable
from app.core.problems import problem_responses
from app.routers.auth import SESSION_ERRORS
from app.core.schemas import CreateUserRequest, UserResponse
from app.routers.auth import get_auth_service
from app.services.auth_service import AuthService

router = APIRouter(
    route_class=DeepJsonRoute,
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin), Depends(require_password_changed)],
    # Los errores de las dependencias del router valen para todas sus rutas.
    responses=problem_responses(*SESSION_ERRORS, AdminRequired, PasswordChangeRequired),
)


@router.post(
    "/users",
    status_code=status.HTTP_201_CREATED,
    response_model=UserResponse,
    responses=problem_responses(EmailTaken, StorageUnavailable),
)
def create_user(body: CreateUserRequest, service: AuthService = Depends(get_auth_service)):
    user = service.create_guest_user(body.email, body.password)
    return UserResponse(id=user.id, email=user.email, role=user.role.name)
