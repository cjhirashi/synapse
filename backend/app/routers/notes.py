from typing import Annotated

from fastapi import APIRouter, Depends, Header, Path, Query, Response, status

from app.core.dependencies import get_current_principal, require_password_changed
from app.core.errors import (
    InvalidCursor, NoteNotFound, NotePathTaken, PasswordChangeRequired, PreconditionFailed,
    PreconditionRequired, StorageUnavailable, VaultNotFound,
)
from app.core.json_body import DeepJsonRoute
from app.core.ports.vault_port import VaultPort
from app.core.problems import problem_responses
from app.core.schemas import NoteCreate, NoteOut, NotePage, NoteUpdate, TokenPayload
from app.routers.auth import SESSION_ERRORS
from app.routers.vaults import VaultId, get_vault_port
from app.services.note_content_service import NoteContentService, Versioned

router = APIRouter(
    route_class=DeepJsonRoute,
    prefix="/vaults/{vault_id}/notes",
    tags=["notes"],
    # Misma compuerta que vaults.py (RF-015 de 0003): sin sesión 401, cambio de contraseña
    # pendiente 403, en todas las rutas.
    dependencies=[Depends(require_password_changed)],
    responses=problem_responses(*SESSION_ERRORS, PasswordChangeRequired),
)


def get_note_content_service(
    current_user: TokenPayload = Depends(get_current_principal),
    port: VaultPort = Depends(get_vault_port),
) -> NoteContentService:
    # Mismo repositorio compartido por proceso que vaults.py (`get_vault_port`) y la misma
    # base resuelta sólo del principal (RF-014 de 0003; RF-002/RF-006 de 0013).
    return NoteContentService(port, f"synapse_user_{current_user.sub}")


def _with_etag(status_code: int) -> dict[int, dict]:
    """Documenta la cabecera `ETag` de una respuesta con nota (el `_rev` entre comillas)."""
    header = {"description": "Versión de la nota; se envía en `If-Match`.", "schema": {"type": "string"}}
    return {status_code: {"headers": {"ETag": header}}}


def _respond(result: Versioned, response: Response) -> NoteOut:
    response.headers["ETag"] = result.etag
    return result.note


# `note_id` se declara `str` (no `UUID`) por el mismo motivo que `VaultId` en vaults.py: un
# id no canónico da 404 (`NoteNotFound`), no un 422 de validación.
NoteId = Annotated[str, Path(json_schema_extra={"format": "uuid"})]

# Errores de toda escritura condicionada por `If-Match` (C-7/C-8), mismo patrón que
# `vaults.py::_CONDITIONAL`.
_CONDITIONAL = (NoteNotFound, PreconditionRequired, PreconditionFailed, StorageUnavailable)


@router.get(
    "",
    response_model=NotePage,
    responses=problem_responses(InvalidCursor, VaultNotFound, StorageUnavailable),
)
def list_notes(
    vault_id: VaultId,
    limit: int = Query(50, ge=1, le=200),
    cursor: str | None = None,
    deleted: bool = False,
    service: NoteContentService = Depends(get_note_content_service),
):
    return service.list(vault_id, deleted=deleted, limit=limit, cursor=cursor)


@router.get(
    "/{note_id}",
    response_model=NoteOut,
    responses=_with_etag(200) | problem_responses(NoteNotFound, VaultNotFound, StorageUnavailable),
)
def get_note(
    vault_id: VaultId,
    note_id: NoteId,
    response: Response,
    service: NoteContentService = Depends(get_note_content_service),
):
    return _respond(service.get(vault_id, note_id), response)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=NoteOut,
    responses=_with_etag(201) | problem_responses(VaultNotFound, NotePathTaken, StorageUnavailable),
)
def create_note(
    vault_id: VaultId,
    body: NoteCreate,
    response: Response,
    service: NoteContentService = Depends(get_note_content_service),
):
    return _respond(service.create(vault_id, body), response)


@router.patch(
    "/{note_id}",
    response_model=NoteOut,
    responses=_with_etag(200) | problem_responses(*_CONDITIONAL, VaultNotFound, NotePathTaken),
)
def update_note(
    vault_id: VaultId,
    note_id: NoteId,
    body: NoteUpdate,
    response: Response,
    if_match: str | None = Header(None),
    service: NoteContentService = Depends(get_note_content_service),
):
    return _respond(service.update(vault_id, note_id, body, if_match), response)


@router.delete(
    "/{note_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses=problem_responses(*_CONDITIONAL, VaultNotFound),
)
def delete_note(
    vault_id: VaultId,
    note_id: NoteId,
    if_match: str | None = Header(None),
    service: NoteContentService = Depends(get_note_content_service),
):
    service.delete(vault_id, note_id, if_match)


@router.post(
    "/{note_id}/restore",
    response_model=NoteOut,
    responses=_with_etag(200) | problem_responses(*_CONDITIONAL, VaultNotFound, NotePathTaken),
)
def restore_note(
    vault_id: VaultId,
    note_id: NoteId,
    response: Response,
    if_match: str | None = Header(None),
    service: NoteContentService = Depends(get_note_content_service),
):
    return _respond(service.restore(vault_id, note_id, if_match), response)
