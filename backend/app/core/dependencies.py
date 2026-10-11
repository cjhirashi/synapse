import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.adapters.database import get_db
from app.core.config import settings
from app.core.models.user import User
from app.core.schemas import TokenPayload


async def get_current_user(request: Request) -> TokenPayload:
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        return TokenPayload(**payload)
    except (jwt.PyJWTError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )


async def require_admin(
    current_user: TokenPayload = Depends(get_current_user),
) -> TokenPayload:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin required",
        )
    return current_user


def require_password_changed(
    current_user: TokenPayload = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TokenPayload:
    """Bloquea (403) mientras el usuario deba cambiar su contraseña. El JWT no lleva el
    indicador, por eso se lee de la BD."""
    user = db.get(User, current_user.sub)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    if user.must_change_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Password change required"
        )
    return current_user
