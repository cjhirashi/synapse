"""Rutas de archivos (H-015/H-016): subir, servir, renombrar, borrar, listar.

Patrón de `vaults.py`: `get_current_principal` (cookie o `Bearer` key) resuelve al dueño en
las rutas que lo exigen. El `GET` es la excepción: un archivo público se sirve SIN credencial,
así que su handler resuelve el principal a mano sólo cuando el archivo es privado (C-3). El
contenido sale en binario con su `Content-Type` y cabeceras por tipo (C-3/C-5). MinIO nunca
se expone directo.
"""
from functools import lru_cache
from urllib.parse import quote
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, Request, Response, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.adapters.database import get_db
from app.adapters.file_repository import FileRepository
from app.adapters.minio_adapter import MinioObjectStorage
from app.core.dependencies import get_current_principal
from app.core.errors import (
    FileNotFound, FileTooLarge, StorageUnavailable, UnsafeSvg, UnsupportedFileType, VaultNotFound,
)
from app.core.file_safety import SVG, HTML
from app.core.ports.object_storage_port import ObjectStoragePort
from app.core.ports.vault_port import VaultPort
from app.core.problems import problem_responses
from app.core.schemas import FileMetaOut, FileVisibilityUpdate, TokenPayload
from app.routers.auth import SESSION_ERRORS
from app.routers.vaults import get_vault_port
from app.services.file_service import MAX_FILE_SIZE, MAX_FILE_SIZE_DOCUMENT, FileService
from app.services.vault_service import VaultService

router = APIRouter(prefix="/files", tags=["files"])


# Esquemas de petición/respuesta
class FileUpdate(BaseModel):
    """PATCH /files/{id}: actualizar name y/o visibility (C-5)."""
    name: str | None = None
    visibility: str | None = None


# Categorías de tipo para decidir cabeceras (C-3)
_INLINE_TYPES = {
    "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml",
    "application/pdf", "text/html",
}

_HTML_CSP_HEADERS = {
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": (
        "sandbox allow-scripts; "
        "default-src 'none'; "
        "script-src 'unsafe-inline'; "
        "style-src 'unsafe-inline' https:; "
        "img-src data: blob: https:; "
        "font-src data: https:; "
        "connect-src 'none'"
    ),
}

_SVG_CSP_HEADERS = {
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox",
}


def _get_response_headers(record) -> dict[str, str]:
    """Genera cabeceras por tipo de archivo (C-3). Retorna dict para Response(headers=...)."""
    headers = {"X-Content-Type-Options": "nosniff"}

    if record.content_type == HTML:
        headers.update(_HTML_CSP_HEADERS)
    elif record.content_type == SVG:
        headers.update(_SVG_CSP_HEADERS)
    elif record.content_type in _INLINE_TYPES:
        headers["Content-Disposition"] = "inline"
    else:
        # Resto de documentos: descarga con filename RFC 5987 (C-3)
        safe_name = quote(record.name, safe="")
        headers["Content-Disposition"] = f"attachment; filename*=UTF-8''{safe_name}"

    # Archivos privados: no cachear (C-3)
    if record.visibility == "private":
        headers["Cache-Control"] = "private, no-store"

    return headers


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
    # Se lee el archivo con tope por tipo (5 MB imágenes, 25 MB resto). El servicio decide el
    # límite basado en la extensión (C-2/C-11). El handler es síncrono → corre en el threadpool,
    # así la lectura y la subida a MinIO (que bloquean) no frenan el bucle de eventos.
    data = file.file.read(MAX_FILE_SIZE_DOCUMENT + 1)
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
    """Sirve un archivo (C-3). Regla de acceso: privado exige sesión/key del dueño, público sin credencial.
    Cabeceras por tipo: imágenes/PDF/HTML inline, resto attachment. HTML con CSP sandbox."""
    record = FileRepository(db).get(file_id)
    if record is None:
        raise FileNotFound()
    if record.visibility != "public":
        # Privado: exige credencial válida (401 sin ella) y ser el dueño (404 si es de otro, C-3/C-12).
        principal = get_current_principal(request, db)
        if principal.sub != record.owner_id:
            raise FileNotFound()
    data = storage.get_object(record.object_key)
    headers = _get_response_headers(record)
    return Response(content=data, media_type=record.content_type, headers=headers)


@router.patch(
    "/{file_id}",
    response_model=FileMetaOut,
    responses=problem_responses(*SESSION_ERRORS, FileNotFound, UnsupportedFileType, StorageUnavailable),
)
def update_file(
    file_id: str,
    body: FileUpdate,
    service: FileService = Depends(get_file_service),
):
    """Actualizar name y/o visibility del archivo (C-5). Solo el dueño."""
    record = service.get_record(file_id)

    if body.name is not None:
        record = service.set_name(file_id, body.name)
    if body.visibility is not None:
        record = service.set_visibility(file_id, body.visibility)

    return record


@router.delete(
    "/{file_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=problem_responses(*SESSION_ERRORS, FileNotFound, StorageUnavailable),
)
def delete_file(
    file_id: str,
    service: FileService = Depends(get_file_service),
):
    """Borra el archivo (objeto + registro) solo si es del dueño (C-6)."""
    service.delete(file_id)
