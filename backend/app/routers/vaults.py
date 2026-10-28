from functools import lru_cache
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Path, Query, Response, status

from app.adapters.vault_repository import VaultRepository
from app.core.json_body import DeepJsonRoute
from app.core.dependencies import get_current_principal, require_password_changed
from app.core.errors import (
    InvalidCursor, PasswordChangeRequired, PreconditionFailed, PreconditionRequired,
    StorageUnavailable, VaultNameTaken, VaultNotFound,
)
from app.core.ports.vault_port import VaultPort
from app.core.problems import problem_responses
from app.core.schemas import TokenPayload, VaultCreate, VaultOut, VaultPage, VaultUpdate
from app.routers.auth import SESSION_ERRORS
from app.services.vault_service import Versioned, VaultService

router = APIRouter(
    route_class=DeepJsonRoute,
    prefix="/vaults",
    tags=["vaults"],
    # RF-015: sin sesión 401; con cambio de contraseña pendiente 403, en las 6 rutas.
    dependencies=[Depends(require_password_changed)],
    responses=problem_responses(*SESSION_ERRORS, PasswordChangeRequired),
)

# Errores de toda escritura condicionada por `If-Match` (RF-010).
_CONDITIONAL = (VaultNotFound, PreconditionRequired, PreconditionFailed, StorageUnavailable)


@lru_cache
def get_vault_port() -> VaultPort:
    """Un único repositorio por proceso: su memoria de índices por base se comparte."""
    return VaultRepository()


def get_vault_service(
    current_user: TokenPayload = Depends(get_current_principal),
    port: VaultPort = Depends(get_vault_port),
) -> VaultService:
    # La base sale sólo del principal resuelto (cookie o Bearer key), nunca de la petición
    # (RF-014 de 0003; RF-002/RF-006 de 0013): una key ve exactamente la base de su dueño.
    return VaultService(port, f"synapse_user_{current_user.sub}")


def _with_etag(status_code: int) -> dict[int, dict]:
    """Documenta la cabecera `ETag` de una respuesta con bóveda (el `_rev` entre comillas)."""
    header = {"description": "Versión de la bóveda; se envía en `If-Match`.", "schema": {"type": "string"}}
    return {status_code: {"headers": {"ETag": header}}}


def _respond(result: Versioned, response: Response) -> VaultOut:
    response.headers["ETag"] = result.etag
    return result.vault


@router.get("", response_model=VaultPage, responses=problem_responses(InvalidCursor, StorageUnavailable))
def list_vaults(
    limit: int = Query(50, ge=1, le=200),
    cursor: str | None = None,
    deleted: bool = False,
    service: VaultService = Depends(get_vault_service),
):
    return service.list(deleted=deleted, limit=limit, cursor=cursor)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=VaultOut,
    responses=_with_etag(201) | problem_responses(VaultNameTaken, StorageUnavailable),
)
def create_vault(
    body: VaultCreate,
    response: Response,
    current_user: TokenPayload = Depends(get_current_principal),
    service: VaultService = Depends(get_vault_service),
):
    return _respond(service.create(body, owner_id=current_user.sub), response)


# `vault_id` se declara `str` (no `UUID`) e `If-Match` opcional: un id que no es UUID da
# 404 (RF-014) y la falta de `If-Match` 428 (RF-010), no un 422 de validación. El contrato
# anuncia igualmente `format: uuid` (PLAN-0003 §15, VA-5): el servicio sólo acepta la forma
# canónica.
VaultId = Annotated[str, Path(json_schema_extra={"format": "uuid"})]

@router.get(
    "/{vault_id}",
    response_model=VaultOut,
    responses=_with_etag(200) | problem_responses(VaultNotFound, StorageUnavailable),
)
def get_vault(vault_id: VaultId, response: Response, service: VaultService = Depends(get_vault_service)):
    return _respond(service.get(vault_id), response)


@router.patch(
    "/{vault_id}",
    response_model=VaultOut,
    responses=_with_etag(200) | problem_responses(*_CONDITIONAL, VaultNameTaken),
)
def update_vault(
    vault_id: VaultId,
    body: VaultUpdate,
    response: Response,
    if_match: str | None = Header(None),
    service: VaultService = Depends(get_vault_service),
):
    return _respond(service.update(vault_id, body, if_match), response)


@router.delete(
    "/{vault_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses=problem_responses(*_CONDITIONAL),
)
def delete_vault(
    vault_id: VaultId,
    if_match: str | None = Header(None),
    service: VaultService = Depends(get_vault_service),
):
    service.delete(vault_id, if_match)


@router.post(
    "/{vault_id}/restore",
    response_model=VaultOut,
    responses=_with_etag(200) | problem_responses(*_CONDITIONAL, VaultNameTaken),
)
def restore_vault(
    vault_id: VaultId,
    response: Response,
    if_match: str | None = Header(None),
    service: VaultService = Depends(get_vault_service),
):
    return _respond(service.restore(vault_id, if_match), response)
