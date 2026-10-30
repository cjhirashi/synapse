"""Rutas de archivos (H-015): subir, servir con regla de visibilidad y cambiar visibilidad.

Patrón de `vaults.py`: `get_current_principal` (cookie o `Bearer` key) resuelve al dueño en
las rutas que lo exigen. El `GET` es la excepción: un archivo público se sirve SIN credencial,
así que su handler resuelve el principal a mano sólo cuando el archivo es privado (C-3). El
contenido sale en binario con su `Content-Type`; un SVG, además, con `Content-Security-Policy:
sandbox` y `X-Content-Type-Options: nosniff` (C-5). MinIO nunca se expone directo.
"""
from functools import lru_cache
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Request, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.adapters.database import get_db
from app.adapters.file_repository import FileRepository
from app.adapters.minio_adapter import MinioObjectStorage
from app.core.dependencies import get_current_principal
from app.core.errors import FileNotFound, FileTooLarge, StorageUnavailable, UnsafeSvg, UnsupportedFileType
from app.core.errors import VaultNotFound
from app.core.file_safety import SVG
from app.core.ports.object_storage_port import ObjectStoragePort
from app.core.ports.vault_port import VaultPort
from app.core.problems import problem_responses
from app.core.schemas import FileMetaOut, FileVisibilityUpdate, TokenPayload
from app.routers.auth import SESSION_ERRORS
from app.routers.vaults import get_vault_port
from app.services.file_service import MAX_FILE_SIZE, FileService
from app.services.vault_service import VaultService

router = APIRouter(prefix="/files", tags=["files"])

# Cabeceras de un SVG servido (C-5): aislado del origen y sin re-husmear el tipo.
_SVG_HEADERS = {"Content-Security-Policy": "sandbox", "X-Content-Type-Options": "nosniff"}


@lru_cache
def get_object_storage() -> ObjectStoragePort:
    """Un único adaptador MinIO por proceso (los tests lo sustituyen por un FAKE del puerto)."""
    return MinioObjectStorage()


def get_file_service(
    principal: TokenPayload = Depends(get_current_principal),
    db: Session = Depends(get_db),
    storage: ObjectStoragePort = Depends(get_object_storage),
    vault_port: VaultPort = Depends(get_vault_port),
) -> FileService:
    # La bóveda se valida contra la base del dueño resuelto (cookie o key), nunca contra la
    # petición: una key sólo puede subir a las bóvedas de su dueño (C-7, mismo criterio que vaults).
    vault_service = VaultService(vault_port, f"synapse_user_{principal.sub}")
    return FileService(
        FileRepository(db),
        storage,
        principal.sub,
        ensure_vault=lambda vault_id: vault_service.get(vault_id),
    )


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=FileMetaOut,
    responses=problem_responses(
        *SESSION_ERRORS, VaultNotFound, FileTooLarge, UnsupportedFileType, UnsafeSvg, StorageUnavailable
    ),
)
def upload_file(
    vault_id: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    service: FileService = Depends(get_file_service),
):
    # No se lee el archivo entero sin tope: se corta en 5 MB + 1 byte y el servicio decide el
    # límite (C-6). El handler es síncrono → corre en el threadpool, así la lectura y la subida
    # a MinIO (que bloquean) no frenan el bucle de eventos.
    data = file.file.read(MAX_FILE_SIZE + 1)
    return service.create(vault_id=vault_id, filename=file.filename or "archivo", data=data)


@router.get(
    "/{file_id}",
    response_class=Response,  # devuelve bytes del archivo, no JSON: el contrato no anuncia json
    responses=problem_responses(*SESSION_ERRORS, FileNotFound, StorageUnavailable),
)
def get_file(
    file_id: str,
    request: Request,
    db: Session = Depends(get_db),
    storage: ObjectStoragePort = Depends(get_object_storage),
):
    record = FileRepository(db).get(file_id)
    if record is None:
        raise FileNotFound()
    if record.visibility != "public":
        # Privado: exige credencial válida (401 sin ella) y ser el dueño (404 si es de otro, C-3).
        principal = get_current_principal(request, db)
        if principal.sub != record.owner_id:
            raise FileNotFound()
    data = storage.get_object(record.object_key)
    headers = _SVG_HEADERS if record.content_type == SVG else None
    return Response(content=data, media_type=record.content_type, headers=headers)


@router.patch(
    "/{file_id}",
    response_model=FileMetaOut,
    responses=problem_responses(*SESSION_ERRORS, FileNotFound, StorageUnavailable),
)
def update_visibility(
    file_id: str,
    body: FileVisibilityUpdate,
    service: FileService = Depends(get_file_service),
):
    return service.set_visibility(file_id, body.visibility)
