from datetime import datetime, timedelta

import jwt
from fastapi import Depends, Request
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.adapters.agent_key_repository import AgentKeyRepository
from app.adapters.database import get_db
from app.core.config import settings
from app.core.errors import (
    AdminRequired, InvalidToken, NotAuthenticated, PasswordChangeRequired, StorageUnavailable,
)
from app.core.models.user import User
from app.core.schemas import TokenPayload
from app.services.agent_key_service import AgentKeyService

# `exp` sintético del principal resuelto desde una key (R-4): no se valida downstream (sólo se
# usan `.sub`/`.role`), pero se fija a un futuro coherente. La caducidad real de una key es su
# **revocación**, no este `exp`.
_AGENT_PRINCIPAL_TTL = timedelta(hours=24)


def _principal_from_cookie(request: Request, db: Session) -> TokenPayload | None:
    """El principal de la cookie `access_token`: payload si es válida, `None` si no hay cookie,
    `InvalidToken` si la hay pero está mal. Cuerpo compartido por las dos dependencias (P-4)."""
    token = request.cookies.get("access_token")
    if not token:
        return None
    try:
        payload = TokenPayload(**jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"]))
    except (jwt.PyJWTError, ValueError) as exc:
        raise InvalidToken(f"JWT rejected: {exc}") from exc
    # Un token emitido antes del último cambio de contraseña ya no vale (RF-021).
    user = db.get(User, payload.sub)
    if user is None or not user.is_active or user.token_version != payload.ver:
        raise InvalidToken("user missing, inactive or token version outdated")
    return payload


def _bearer_key(request: Request) -> str | None:
    """El valor de un header `Authorization: Bearer <key>`, o `None`."""
    header = request.headers.get("authorization")
    if header is None:
        return None
    scheme, _, value = header.partition(" ")
    return value if scheme.lower() == "bearer" and value else None


def get_current_user(request: Request, db: Session = Depends(get_db)) -> TokenPayload:
    """Superficie de cuenta/gestión: **sólo** cookie (cero cambio de contrato, P-4)."""
    payload = _principal_from_cookie(request, db)
    if payload is None:
        raise NotAuthenticated()
    return payload


def get_current_principal(request: Request, db: Session = Depends(get_db)) -> TokenPayload:
    """Superficie de datos (/vaults, /sync): cookie primero, si no hay → `Authorization:
    Bearer <key>`. Resuelve al **mismo** `current_user` que la cookie del dueño (RF-002)."""
    payload = _principal_from_cookie(request, db)
    if payload is not None:
        return payload  # camino humano dominante: no toca la BD de keys si hay sesión
    raw = _bearer_key(request)
    if raw is None:
        raise NotAuthenticated()
    try:
        key = AgentKeyService(AgentKeyRepository(db)).resolve(raw)
    except OperationalError as exc:
        # Control plane caído sólo en el camino nuevo (RF-008/P-8), como vaults.py ante CouchDB.
        raise StorageUnavailable("agent key control plane unavailable") from exc
    if key is None:
        raise NotAuthenticated()  # inválida/mal formada/revocada → 401, nunca 403 (RF-003/007)
    owner = key.owner
    # `resolve` ya confirmó que el dueño existe y está activo.
    return TokenPayload(
        sub=key.owner_id,
        role=owner.role.name,
        ver=owner.token_version,
        exp=int((datetime.utcnow() + _AGENT_PRINCIPAL_TTL).timestamp()),
    )


async def require_admin(
    current_user: TokenPayload = Depends(get_current_user),
) -> TokenPayload:
    if current_user.role != "admin":
        raise AdminRequired()
    return current_user


def require_password_changed(
    current_user: TokenPayload = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> TokenPayload:
    """Bloquea (403) mientras el usuario deba cambiar su contraseña. El JWT no lleva el
    indicador, por eso se lee de la BD. Compuerta de la **superficie de datos**: resuelve el
    principal por cookie o por `Bearer` (una petición por key no trae cookie, SPEC-0013)."""
    user = db.get(User, current_user.sub)
    if user is None or not user.is_active:
        raise InvalidToken("user missing or inactive")
    if user.must_change_password:
        raise PasswordChangeRequired()
    return current_user
