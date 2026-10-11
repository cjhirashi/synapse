from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.adapters.auth_repository import AuthRepository
from app.adapters.couchdb import CouchDBAdapter
from app.adapters.database import get_db
from app.core.dependencies import get_current_user
from app.core.schemas import ChangePasswordRequest, LoginRequest, TokenPayload
from app.services.auth_service import ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL, AuthService

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE_PATH = "/auth"


def get_auth_service(db: Session = Depends(get_db)) -> AuthService:
    return AuthService(AuthRepository(db), CouchDBAdapter())


def _set_access_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=int(ACCESS_TOKEN_TTL.total_seconds()),
    )


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="refresh_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=int(REFRESH_TOKEN_TTL.total_seconds()),
        path=REFRESH_COOKIE_PATH,
    )


@router.post("/login")
def login(body: LoginRequest, response: Response, service: AuthService = Depends(get_auth_service)):
    user = service.login(body.email, body.password)
    _set_access_cookie(response, service.create_token(user))
    _set_refresh_cookie(response, service.create_refresh_token(user))
    return {"message": "Login exitoso", "role": user.role.name}


@router.post("/refresh")
def refresh(request: Request, response: Response, service: AuthService = Depends(get_auth_service)):
    user, new_refresh = service.refresh(request.cookies.get("refresh_token"))
    _set_access_cookie(response, service.create_token(user))
    _set_refresh_cookie(response, new_refresh)
    return {"message": "Token renovado"}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, service: AuthService = Depends(get_auth_service)):
    service.logout(request.cookies.get("refresh_token"))
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie("access_token", httponly=True, secure=True, samesite="lax")
    response.delete_cookie(
        "refresh_token", path=REFRESH_COOKIE_PATH, httponly=True, secure=True, samesite="lax"
    )
    return response


@router.get("/me")
def me(
    current_user: TokenPayload = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
):
    user = service.repo.get_user_by_id(current_user.sub)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return {
        "user_id": user.id,
        "role": current_user.role,
        "must_change_password": user.must_change_password,
    }


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    body: ChangePasswordRequest,
    response: Response,
    current_user: TokenPayload = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
):
    user = service.change_password(current_user.sub, body.current_password, body.new_password)
    # Los tokens anteriores quedan invalidados (RF-021); la sesión actual recibe unos nuevos.
    _set_access_cookie(response, service.create_token(user))
    _set_refresh_cookie(response, service.create_refresh_token(user))
