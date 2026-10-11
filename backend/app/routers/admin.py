from fastapi import APIRouter, Depends, status

from app.core.dependencies import require_admin, require_password_changed
from app.core.schemas import CreateUserRequest, UserResponse
from app.routers.auth import get_auth_service
from app.services.auth_service import AuthService

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin), Depends(require_password_changed)],
)


@router.post("/users", status_code=status.HTTP_201_CREATED, response_model=UserResponse)
def create_user(body: CreateUserRequest, service: AuthService = Depends(get_auth_service)):
    user = service.create_guest_user(body.email, body.password)
    return UserResponse(id=user.id, email=user.email, role=user.role.name)
