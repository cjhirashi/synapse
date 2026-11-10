from fastapi import APIRouter, Depends, File, Request, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.adapters.auth_repository import AuthRepository
from app.adapters.couchdb import CouchDBAdapter
from app.adapters.database import get_db
from app.adapters.minio_adapter import get_object_storage
from app.core.json_body import DeepJsonRoute
from app.core.dependencies import get_current_user
from app.core.models.user import User
from app.core.ports.object_storage_port import ObjectStoragePort
from app.core.errors import (
    InvalidCredentials,
    InvalidRefreshToken,
    InvalidToken,
    NotAuthenticated,
    PasswordPolicyViolation,
    ProfilePhotoInvalidType,
    ProfilePhotoNotFound,
    ProfilePhotoTooLarge,
    StorageUnavailable,
    WrongCurrentPassword,
)
from app.core.problems import problem_responses
from app.core.schemas import ChangePasswordRequest, LoginRequest, TokenPayload, UpdateDisplayNameRequest
from app.services.auth_service import AVATAR_MAX_SIZE
from app.services.auth_service import ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL, AuthService

router = APIRouter(prefix="/auth", tags=["auth"], route_class=DeepJsonRoute)

REFRESH_COOKIE_PATH = "/auth"

# Errores que puede lanzar `get_current_user` (RF-009 de SPEC-0004).
SESSION_ERRORS = (NotAuthenticated, InvalidToken)


def get_auth_service(
    db: Session = Depends(get_db),
    # Depends (no llamada directa) para que `app.dependency_overrides` sustituya el almacén en tests.
    object_storage: ObjectStoragePort = Depends(get_object_storage),
) -> AuthService:
    return AuthService(AuthRepository(db), CouchDBAdapter(), object_storage)


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


@router.post("/login", responses=problem_responses(InvalidCredentials))
def login(body: LoginRequest, response: Response, service: AuthService = Depends(get_auth_service)):
    user = service.login(body.email, body.password)
    _set_access_cookie(response, service.create_token(user))
    _set_refresh_cookie(response, service.create_refresh_token(user))
    return {"message": "Login exitoso", "role": user.role.name}


@router.post("/refresh", responses=problem_responses(InvalidRefreshToken))
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


def _profile_body(user: User, role: str) -> dict:
    """Forma única de perfil: GET/PATCH /auth/me y las rutas de foto devuelven exactamente esto."""
    # photo_url lleva la versión: al subir otra foto cambia la URL y el navegador no sirve la caché.
    photo_url = None
    if user.avatar_content_type is not None:
        photo_url = f"/auth/me/photo?v={user.avatar_version}"
    return {
        "user_id": user.id,
        "email": user.email,
        "role": role,
        "must_change_password": user.must_change_password,
        "display_name": user.display_name,
        "photo_url": photo_url,
    }


@router.get("/me", responses=problem_responses(*SESSION_ERRORS))
def me(
    current_user: TokenPayload = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
):
    user = service.repo.get_user_by_id(current_user.sub)
    if user is None or not user.is_active:
        raise InvalidToken("user missing or inactive")
    return _profile_body(user, current_user.role)


@router.patch("/me", responses=problem_responses(*SESSION_ERRORS))
def patch_me(
    body: UpdateDisplayNameRequest,
    current_user: TokenPayload = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
):
    """Actualiza el perfil del usuario autenticado (display_name). Solo cookie (B9 de H-028)."""
    user = service.update_display_name(current_user.sub, body.display_name)
    return _profile_body(user, current_user.role)


@router.put(
    "/me/photo",
    responses=problem_responses(
        *SESSION_ERRORS, ProfilePhotoTooLarge, ProfilePhotoInvalidType, StorageUnavailable
    ),
)
async def put_me_photo(
    file: UploadFile = File(...),
    current_user: TokenPayload = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
):
    """Sube la foto de avatar (H-028). Solo cookie (B9: una API key no edita el perfil)."""
    # Se leen como mucho AVATAR_MAX_SIZE + 1 bytes: el servicio ve "más de 2 MB" sin cargar un archivo
    # gigante en memoria. Tamaño y tipo los valida el servicio (un único punto).
    data = await file.read(AVATAR_MAX_SIZE + 1)
    user = service.set_avatar(current_user.sub, data)
    return _profile_body(user, current_user.role)


@router.delete(
    "/me/photo",
    responses=problem_responses(*SESSION_ERRORS, StorageUnavailable),
)
def delete_me_photo(
    current_user: TokenPayload = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
):
    """Borra la foto de avatar (H-028). Solo cookie."""
    user = service.clear_avatar(current_user.sub)
    return _profile_body(user, current_user.role)


@router.get(
    "/me/photo",
    responses=problem_responses(*SESSION_ERRORS, ProfilePhotoNotFound, StorageUnavailable),
)
def get_me_photo(
    current_user: TokenPayload = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
):
    """Descarga la foto de avatar del propio usuario (H-028). Solo cookie.

    `private`: la foto es de este usuario; ningún caché compartido (proxy) debe servirla a otro.
    """
    data, content_type = service.get_avatar(current_user.sub)
    return Response(
        content=data,
        media_type=content_type,
        headers={"Cache-Control": "private, no-cache"},
    )


@router.post(
    "/change-password",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=problem_responses(
        *SESSION_ERRORS, InvalidCredentials, WrongCurrentPassword, PasswordPolicyViolation
    ),
)
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
