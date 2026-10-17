import jwt
from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.adapters.database import get_db
from app.core.config import settings
from app.core.errors import AdminRequired, InvalidToken, NotAuthenticated, PasswordChangeRequired
from app.core.models.user import User
from app.core.schemas import TokenPayload


def get_current_user(request: Request, db: Session = Depends(get_db)) -> TokenPayload:
    token = request.cookies.get("access_token")
    if not token:
        raise NotAuthenticated()
    try:
        payload = TokenPayload(**jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"]))
    except (jwt.PyJWTError, ValueError) as exc:
        raise InvalidToken(f"JWT rejected: {exc}") from exc
    # Un token emitido antes del último cambio de contraseña ya no vale (RF-021).
    user = db.get(User, payload.sub)
    if user is None or not user.is_active or user.token_version != payload.ver:
        raise InvalidToken("user missing, inactive or token version outdated")
    return payload


async def require_admin(
    current_user: TokenPayload = Depends(get_current_user),
) -> TokenPayload:
    if current_user.role != "admin":
        raise AdminRequired()
    return current_user


def require_password_changed(
    current_user: TokenPayload = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TokenPayload:
    """Bloquea (403) mientras el usuario deba cambiar su contraseña. El JWT no lleva el
    indicador, por eso se lee de la BD."""
    user = db.get(User, current_user.sub)
    if user is None or not user.is_active:
        raise InvalidToken("user missing or inactive")
    if user.must_change_password:
        raise PasswordChangeRequired()
    return current_user
