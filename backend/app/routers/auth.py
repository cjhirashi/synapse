from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.adapters.auth_repository import AuthRepository
from app.adapters.database import get_db
from app.core.dependencies import get_current_user
from app.core.schemas import LoginRequest, RegisterRequest, RegisterResponse, TokenPayload
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


def _get_service(db: Session = Depends(get_db)) -> AuthService:
    return AuthService(AuthRepository(db))


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=RegisterResponse)
def register(body: RegisterRequest, service: AuthService = Depends(_get_service)):
    user = service.register_first_user(body.email, body.password)
    return RegisterResponse(id=user.id, email=user.email, role=user.role.name)


@router.post("/login")
def login(body: LoginRequest, response: Response, service: AuthService = Depends(_get_service)):
    user = service.login(body.email, body.password)
    token = service.create_token(user)
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=86400,
    )
    return {"message": "Login exitoso", "role": user.role.name}


@router.get("/me")
def me(current_user: TokenPayload = Depends(get_current_user)):
    return {"user_id": current_user.sub, "role": current_user.role}
