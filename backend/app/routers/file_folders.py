"""Carpetas de archivos de una bóveda (H-046): crear, listar, mover y borrar, con subniveles.

Las carpetas son rutas con `/`. Una carpeta existe porque tiene archivos o porque se creó a mano;
las ancestras de cada carpeta se incluyen siempre. Mover un archivo a una carpeta es `PATCH /files/{id}`
con `folder`; mover una carpeta entera es `POST .../file-folders/move`.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.core.dependencies import require_password_changed
from app.core.errors import (
    AgentAccessDenied, FileFolderNotEmpty, FolderMoveInvalid, FolderNotFound, PasswordChangeRequired, StorageUnavailable,
    VaultNotFound,
)
from app.core.problems import problem_responses
from app.core.schemas import FileFolderCreate, FileFolderMove, FileFolderMoveOut, FileFoldersOut
from app.routers.auth import SESSION_ERRORS
from app.routers.files import get_file_guard, get_file_service
from app.routers.vaults import VaultId
from app.services.agent_access_guard import AgentAccessGuard
from app.services.file_service import FileService

router = APIRouter(
    prefix="/vaults/{vault_id}/file-folders",
    tags=["files"],
    dependencies=[Depends(require_password_changed)],
    responses=problem_responses(*SESSION_ERRORS, PasswordChangeRequired),
)


@router.get("", response_model=FileFoldersOut, responses=problem_responses(VaultNotFound))
def list_file_folders(vault_id: VaultId, service: FileService = Depends(get_file_service)):
    """Todas las carpetas de archivos de la bóveda, ordenadas, con sus ancestras."""
    return FileFoldersOut(folders=service.list_folders(vault_id))


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=FileFoldersOut,
    responses=problem_responses(VaultNotFound, AgentAccessDenied, StorageUnavailable),
)
def create_file_folder(
    vault_id: VaultId,
    body: FileFolderCreate,
    service: FileService = Depends(get_file_service),
    guard: AgentAccessGuard = Depends(get_file_guard),
):
    """Crea una carpeta (y sus ancestras) aunque no tenga archivos. Idempotente; devuelve la lista completa."""
    guard.check(vault_id, "file-folder-create", [body.path], files=True)
    return FileFoldersOut(folders=service.create_folder(vault_id, body.path))


@router.post(
    "/move",
    response_model=FileFolderMoveOut,
    response_model_by_alias=True,
    responses=problem_responses(VaultNotFound, FolderNotFound, FolderMoveInvalid, AgentAccessDenied, StorageUnavailable),
)
def move_file_folder(
    vault_id: VaultId,
    body: FileFolderMove,
    service: FileService = Depends(get_file_service),
    guard: AgentAccessGuard = Depends(get_file_guard),
):
    """Mueve (o renombra) una carpeta con todo lo que contiene. Si el destino ya existe, se fusionan."""
    guard.check(vault_id, "file-folder-move", [body.from_, body.to], files=True)
    src, dst, moved = service.move_folder(vault_id, body.from_, body.to)
    return FileFolderMoveOut(from_=src, to=dst, moved_files=moved)


@router.delete(
    "",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=problem_responses(VaultNotFound, FolderNotFound, FileFolderNotEmpty, AgentAccessDenied, StorageUnavailable),
)
def delete_file_folder(
    vault_id: VaultId,
    path: Annotated[str, Query(min_length=1, max_length=300)],
    service: FileService = Depends(get_file_service),
    guard: AgentAccessGuard = Depends(get_file_guard),
):
    """Borra una carpeta vacía y sus subcarpetas vacías. Con archivos dentro responde 409."""
    guard.check(vault_id, "file-folder-delete", [path], files=True)
    service.delete_folder(vault_id, path)
