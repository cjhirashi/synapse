"""Carpetas de archivos de una bóveda (H-046): crear, listar, mover y borrar, con subniveles.

Las carpetas son rutas con `/`. Una carpeta existe porque tiene archivos o porque se creó a mano;
las ancestras de cada carpeta se incluyen siempre. Mover un archivo a una carpeta es `PATCH /files/{id}`
con `folder`; mover una carpeta entera es `POST .../file-folders/move`.

Un miembro invitado (H-064 F3b1) ve las carpetas con nivel, crea y borra con escritura, y nunca mueve carpetas.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.adapters.database import get_db
from app.adapters.minio_adapter import get_object_storage
from app.core.dependencies import get_current_principal, get_vault_context, require_password_changed
from app.core.errors import (
    AgentAccessDenied, FileFolderNotEmpty, FolderMoveInvalid, FolderNotFound, PasswordChangeRequired, ShareForbidden,
    StorageUnavailable, VaultNotFound,
)
from app.core.ports.object_storage_port import ObjectStoragePort
from app.core.ports.vault_port import VaultPort
from app.core.problems import problem_responses
from app.core.schemas import FileFolderCreate, FileFolderMove, FileFolderMoveOut, FileFoldersOut, TokenPayload
from app.core.vault_context import VaultContext
from app.routers.auth import SESSION_ERRORS
from app.routers.files import file_services
from app.routers.vaults import VaultId, get_vault_port

router = APIRouter(
    prefix="/vaults/{vault_id}/file-folders",
    tags=["files"],
    dependencies=[Depends(require_password_changed)],
    responses=problem_responses(*SESSION_ERRORS, PasswordChangeRequired),
)


@router.get("", response_model=FileFoldersOut, responses=problem_responses(VaultNotFound))
def list_file_folders(
    vault_id: VaultId,
    ctx: VaultContext = Depends(get_vault_context),
    principal: TokenPayload = Depends(get_current_principal),
    db: Session = Depends(get_db),
    storage: ObjectStoragePort = Depends(get_object_storage),
    vault_port: VaultPort = Depends(get_vault_port),
):
    """Las carpetas de archivos de la bóveda que el actor ve, ordenadas, con sus ancestras (un miembro solo las suyas)."""
    service, _ = file_services(ctx, principal, db, storage, vault_port)
    return FileFoldersOut(folders=service.list_folders(vault_id))


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=FileFoldersOut,
    responses=problem_responses(VaultNotFound, FolderNotFound, ShareForbidden, AgentAccessDenied, StorageUnavailable),
)
def create_file_folder(
    vault_id: VaultId,
    body: FileFolderCreate,
    ctx: VaultContext = Depends(get_vault_context),
    principal: TokenPayload = Depends(get_current_principal),
    db: Session = Depends(get_db),
    storage: ObjectStoragePort = Depends(get_object_storage),
    vault_port: VaultPort = Depends(get_vault_port),
):
    """Crea una carpeta (y sus ancestras) aunque no tenga archivos. Idempotente; devuelve la lista completa.
    Un miembro necesita escritura sobre la carpeta: sin lectura, 404; con lectura y sin escritura, 403."""
    service, guard = file_services(ctx, principal, db, storage, vault_port)
    guard.check(vault_id, "file-folder-create", [body.path], files=True)
    return FileFoldersOut(folders=service.create_folder(vault_id, body.path))


@router.post(
    "/move",
    response_model=FileFolderMoveOut,
    response_model_by_alias=True,
    responses=problem_responses(
        VaultNotFound, FolderNotFound, FolderMoveInvalid, ShareForbidden, AgentAccessDenied, StorageUnavailable),
)
def move_file_folder(
    vault_id: VaultId,
    body: FileFolderMove,
    ctx: VaultContext = Depends(get_vault_context),
    principal: TokenPayload = Depends(get_current_principal),
    db: Session = Depends(get_db),
    storage: ObjectStoragePort = Depends(get_object_storage),
    vault_port: VaultPort = Depends(get_vault_port),
):
    """Mueve (o renombra) una carpeta con todo lo que contiene. Si el destino ya existe, se fusionan. Un miembro no mueve carpetas."""
    service, guard = file_services(ctx, principal, db, storage, vault_port)
    guard.check(vault_id, "file-folder-move", [body.from_, body.to], files=True)
    src, dst, moved = service.move_folder(vault_id, body.from_, body.to)
    return FileFolderMoveOut(from_=src, to=dst, moved_files=moved)


@router.delete(
    "",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=problem_responses(
        VaultNotFound, FolderNotFound, FileFolderNotEmpty, ShareForbidden, AgentAccessDenied, StorageUnavailable),
)
def delete_file_folder(
    vault_id: VaultId,
    path: Annotated[str, Query(min_length=1, max_length=300)],
    ctx: VaultContext = Depends(get_vault_context),
    principal: TokenPayload = Depends(get_current_principal),
    db: Session = Depends(get_db),
    storage: ObjectStoragePort = Depends(get_object_storage),
    vault_port: VaultPort = Depends(get_vault_port),
):
    """Borra una carpeta vacía y sus subcarpetas vacías. Con archivos dentro responde 409."""
    service, guard = file_services(ctx, principal, db, storage, vault_port)
    guard.check(vault_id, "file-folder-delete", [path], files=True)
    service.delete_folder(vault_id, path)
