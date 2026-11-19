from typing import Annotated

from fastapi import APIRouter, Depends, Header, Path, Query, Response, status
from sqlalchemy.orm import Session

from app.adapters.database import get_db
from app.adapters.file_repository import FileRepository
from app.adapters.minio_adapter import get_object_storage
from app.core.agent_access import actor_of
from app.core.dependencies import get_current_principal, get_current_user, get_vault_context, require_password_changed
from app.core.errors import (
    AgentAccessDenied, AgentOwnsSkills, DocumentLimitReached, InvalidCursor, NoteNotFound, NotePathTaken, PasswordChangeRequired, PdfBusy, PdfNotEnabled,
    PdfRenderFailed, PdfTimeout, PreconditionFailed, PreconditionRequired, ShareForbidden, StorageUnavailable, ValidationFailed, VaultNotFound,
)
from app.core.ports.object_storage_port import ObjectStoragePort
from app.services.note_pdf_service import NotePdfService
from app.core.json_body import DeepJsonRoute
from app.core.ports.vault_port import VaultPort
from app.core.problems import problem_responses
from app.core.schemas import NoteCreate, NoteOut, NotePage, NoteUpdate, PdfIn, TokenPayload
from app.core.models.user import User
from app.core.vault_context import VaultContext, owner_context
from app.routers.auth import SESSION_ERRORS
from app.routers.vaults import VaultId, get_vault_port
from app.services.agent_access_guard import AgentAccessGuard
from app.services.change_log_service import Author, ChangeLogService
from app.services.limit_guard import guard_for
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


def _note_service(ctx: VaultContext, current_user: TokenPayload, port: VaultPort, db: Session) -> NoteContentService:
    actor = actor_of(current_user)
    author = None
    if ctx.member is not None:
        author = Author("human", db.get(User, ctx.actor_id).email)
    return NoteContentService(
        port, ctx.db, actor=actor, guard=AgentAccessGuard(port, ctx.db, ctx.owner_id, actor),
        changelog=ChangeLogService(port, ctx.db, ctx.owner_id, actor, author=author),
        limit_guard=guard_for(db, ctx.owner_id, port), member=ctx.member)


def get_note_content_service(
    ctx: VaultContext = Depends(get_vault_context),
    current_user: TokenPayload = Depends(get_current_principal),
    port: VaultPort = Depends(get_vault_port),
    db: Session = Depends(get_db),
) -> NoteContentService:
    # Mismo repositorio compartido por proceso que vaults.py (`get_vault_port`). La base sale solo de la sesión
    # (RF-014 de 0003; RF-002/RF-006 de 0013), salvo para un miembro invitado (H-064 F3): la del propietario de la bóveda
    # compartida, con sus concesiones; sus límites y su bitácora son los del propietario y la autoría es suya.
    return _note_service(ctx, current_user, port, db)


def get_own_note_content_service(
    current_user: TokenPayload = Depends(get_current_principal),
    port: VaultPort = Depends(get_vault_port),
    db: Session = Depends(get_db),
) -> NoteContentService:
    """Las notas de la bóveda de la propia sesión, nunca de una compartida: para lo que un invitado no puede hacer
    (publicar notas ajenas en internet, por ejemplo). Una bóveda de otra persona no existe en la base de quien pregunta."""
    return _note_service(owner_context(current_user.sub), current_user, port, db)


def _with_etag(status_code: int) -> dict[int, dict]:
    """Documenta la cabecera `ETag` de una respuesta con nota (el `_rev` entre comillas)."""
    header = {"description": "Versión de la nota; se envía en `If-Match`.", "schema": {"type": "string"}}
    return {status_code: {"headers": {"ETag": header}}}


_REWRITTEN_HEADER = {
    "description": ("Solo si el PATCH cambió `path`: wikilinks reescritos en la bóveda, "
                    "`notes=<n>; links=<m>; ambiguous=<k>; pending=<p>`."),
    "schema": {"type": "string"},
}


def _respond(result: Versioned, response: Response) -> NoteOut:
    response.headers["ETag"] = result.etag
    if result.rewrite is not None:
        response.headers["X-Wikilinks-Rewritten"] = result.rewrite.header()
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
    responses=problem_responses(InvalidCursor, ValidationFailed, VaultNotFound, StorageUnavailable),
)
def list_notes(
    vault_id: VaultId,
    limit: int = Query(50, ge=1, le=200),
    cursor: str | None = None,
    deleted: bool = False,
    prefix: Annotated[str | None, Query(
        max_length=300,
        description=("Carpeta (sin barra final): lista solo las notas bajo ella, ordenadas por ruta. "
                     "Sin `prefix` el orden es por fecha de creación descendente."))] = None,
    service: NoteContentService = Depends(get_note_content_service),
):
    return service.list(vault_id, deleted=deleted, limit=limit, cursor=cursor, prefix=prefix)


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
    "/{note_id}/pdf",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {"schema": {"type": "string", "format": "binary"}}}, "description": "El documento como PDF."}}
    | problem_responses(NoteNotFound, VaultNotFound, ShareForbidden, PdfNotEnabled, PdfBusy, PdfTimeout, PdfRenderFailed, StorageUnavailable),
)
def note_pdf(
    vault_id: VaultId,
    note_id: NoteId,
    body: PdfIn,
    user: TokenPayload = Depends(get_current_user),
    service: NoteContentService = Depends(get_note_content_service),
    db: Session = Depends(get_db),
    storage: ObjectStoragePort = Depends(get_object_storage),
):
    """PDF de un documento (H-036). Solo la persona (sesión): el HTML es el de Lectura y el formato sale de la plantilla del documento.
    Un miembro invitado de una bóveda compartida no lo genera todavía (403)."""
    if service.is_member:
        raise ShareForbidden("pdf is not available to shared-vault members")
    pdf, name = NotePdfService(service, FileRepository(db), storage, user.sub).generate(vault_id, note_id, body.html)
    return Response(content=pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "no-store"})


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=NoteOut,
    responses=_with_etag(201) | problem_responses(VaultNotFound, NotePathTaken, AgentAccessDenied, ShareForbidden, DocumentLimitReached, StorageUnavailable),
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
    responses={200: {"headers": {**_with_etag(200)[200]["headers"], "X-Wikilinks-Rewritten": _REWRITTEN_HEADER}}}
    | problem_responses(*_CONDITIONAL, VaultNotFound, NotePathTaken, AgentAccessDenied, AgentOwnsSkills, ShareForbidden),
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
    responses=problem_responses(*_CONDITIONAL, VaultNotFound, AgentAccessDenied, AgentOwnsSkills, ShareForbidden),
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
    responses=_with_etag(200) | problem_responses(*_CONDITIONAL, VaultNotFound, NotePathTaken, AgentAccessDenied, ShareForbidden, DocumentLimitReached),
)
def restore_note(
    vault_id: VaultId,
    note_id: NoteId,
    response: Response,
    if_match: str | None = Header(None),
    service: NoteContentService = Depends(get_note_content_service),
):
    return _respond(service.restore(vault_id, note_id, if_match), response)
