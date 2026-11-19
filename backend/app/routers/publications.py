"""Publicación de notas en `/p/<token>` (H-035): endpoints de gestión (fase 1 sin la ruta pública)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Response, status
from sqlalchemy.orm import Session

from app.adapters.database import get_db
from app.adapters.file_repository import FileRepository
from app.adapters.publication_repository import PublicationRepository
from app.core.dependencies import get_current_user, require_password_changed
from app.core.errors import (
    AlreadyPublished, InvalidUnpublishAt, NoteNotFound, NotPublished, PasswordChangeRequired, PublishNotEnabled, StorageUnavailable, VaultNotFound,
)
from app.core.problems import problem_responses
from app.core.schemas import PublicationCheckOut, PublicationExpiryIn, PublicationListOut, PublicationOut, PublishCreateIn, PublishIn, TokenPayload
from app.routers.auth import SESSION_ERRORS
from app.routers.notes import NoteId, get_own_note_content_service
from app.routers.vaults import VaultId
from app.services.note_content_service import NoteContentService
from app.services.publication_service import PublicationService

router = APIRouter(
    prefix="/vaults/{vault_id}/notes/{note_id}/publication",
    tags=["publications"],
    dependencies=[Depends(require_password_changed)],
    responses=problem_responses(*SESSION_ERRORS, PasswordChangeRequired),
)


@router.get(
    "",
    response_model=PublicationOut,
    responses=problem_responses(NoteNotFound, VaultNotFound, StorageUnavailable),
)
def get_publication_status(
    vault_id: VaultId,
    note_id: NoteId,
    user: TokenPayload = Depends(get_current_user),
    service: NoteContentService = Depends(get_own_note_content_service),
    db: Session = Depends(get_db),
):
    """Consulta el estado de publicación de una nota. Solo la persona (sesión)."""
    pub_service = PublicationService(service, PublicationRepository(db), user.sub)
    return pub_service.status(vault_id, note_id)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=PublicationOut,
    responses=problem_responses(
        NoteNotFound, VaultNotFound, PublishNotEnabled, AlreadyPublished, InvalidUnpublishAt, StorageUnavailable
    ),
)
def publish_note(
    vault_id: VaultId,
    note_id: NoteId,
    body: PublishCreateIn,
    user: TokenPayload = Depends(get_current_user),
    service: NoteContentService = Depends(get_own_note_content_service),
    db: Session = Depends(get_db),
):
    """Publica una nota. Solo la persona (sesión)."""
    pub_service = PublicationService(service, PublicationRepository(db), user.sub)
    return pub_service.publish(vault_id, note_id, body.html, body.unpublish_at)


@router.put(
    "",
    response_model=PublicationOut,
    responses=problem_responses(
        NoteNotFound, VaultNotFound, PublishNotEnabled, NotPublished, StorageUnavailable
    ),
)
def republish_note(
    vault_id: VaultId,
    note_id: NoteId,
    body: PublishIn,
    user: TokenPayload = Depends(get_current_user),
    service: NoteContentService = Depends(get_own_note_content_service),
    db: Session = Depends(get_db),
):
    """Republicar una nota. Solo la persona (sesión)."""
    pub_service = PublicationService(service, PublicationRepository(db), user.sub)
    return pub_service.republish(vault_id, note_id, body.html)


@router.delete(
    "",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses=problem_responses(NoteNotFound, VaultNotFound, NotPublished, StorageUnavailable),
)
def unpublish_note(
    vault_id: VaultId,
    note_id: NoteId,
    user: TokenPayload = Depends(get_current_user),
    service: NoteContentService = Depends(get_own_note_content_service),
    db: Session = Depends(get_db),
):
    """Despublica una nota. Solo la persona (sesión)."""
    pub_service = PublicationService(service, PublicationRepository(db), user.sub)
    pub_service.unpublish(vault_id, note_id)


@router.put(
    "/expiry",
    response_model=PublicationOut,
    responses=problem_responses(
        NoteNotFound, VaultNotFound, NotPublished, InvalidUnpublishAt, StorageUnavailable
    ),
)
def set_publication_expiry(
    vault_id: VaultId,
    note_id: NoteId,
    body: PublicationExpiryIn,
    user: TokenPayload = Depends(get_current_user),
    service: NoteContentService = Depends(get_own_note_content_service),
    db: Session = Depends(get_db),
):
    """Fija o quita la fecha de vencimiento de una publicación. Solo la persona (sesión)."""
    pub_service = PublicationService(service, PublicationRepository(db), user.sub)
    return pub_service.set_expiry(vault_id, note_id, body.unpublish_at)


@router.post(
    "/check",
    response_model=PublicationCheckOut,
    responses=problem_responses(NoteNotFound, VaultNotFound, StorageUnavailable),
)
def check_publication_resources(
    vault_id: VaultId,
    note_id: NoteId,
    body: PublishIn,
    user: TokenPayload = Depends(get_current_user),
    service: NoteContentService = Depends(get_own_note_content_service),
    db: Session = Depends(get_db),
):
    """Comprueba los recursos de una publicación potencial. Solo la persona (sesión)."""
    pub_service = PublicationService(
        service, PublicationRepository(db), user.sub, files=FileRepository(db)
    )
    return pub_service.check(vault_id, note_id, body.html)


# --- Router de bóveda: listado de publicaciones ---

vault_router = APIRouter(
    prefix="/vaults/{vault_id}/publications",
    tags=["publications"],
    dependencies=[Depends(require_password_changed)],
    responses=problem_responses(*SESSION_ERRORS, PasswordChangeRequired),
)


@vault_router.get(
    "",
    response_model=PublicationListOut,
    responses=problem_responses(StorageUnavailable),
)
def list_vault_publications(
    vault_id: VaultId,
    user: TokenPayload = Depends(get_current_user),
    service: NoteContentService = Depends(get_own_note_content_service),
    db: Session = Depends(get_db),
):
    """Lista las publicaciones de la bóveda del usuario. Solo la persona (sesión)."""
    pub_service = PublicationService(service, PublicationRepository(db), user.sub)
    return pub_service.list_published(vault_id)
