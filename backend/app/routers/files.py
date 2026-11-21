"""Rutas de archivos (H-015/H-016): subir, servir, renombrar, borrar, listar.

Patrón de `vaults.py`: `get_current_principal` (cookie o `Bearer` key) resuelve al dueño en
las rutas que lo exigen. El `GET` es la excepción: un archivo público se sirve SIN credencial,
así que su handler resuelve el principal a mano sólo cuando el archivo es privado (C-3). El
contenido sale en binario con su `Content-Type` y cabeceras por tipo (C-3/C-5). MinIO nunca
se expone directo.
"""
from urllib.parse import quote
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, Query, Request, Response, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.adapters.database import get_db
from app.adapters.file_repository import FileRepository
# `get_object_storage` se reexporta: `tests/test_files_api.py` lo importa desde aquí para sobrescribirlo.
from app.adapters.minio_adapter import get_object_storage  # noqa: F401
from app.core.agent_access import Actor, actor_of
from app.core.dependencies import get_current_principal, resolve_vault_context
from app.core.errors import (
    AgentAccessDenied, FileNotFound, FileTooLarge, FileVisibilityUserOnly, InvalidToken, NotAuthenticated, ShareForbidden,
    StorageLimitReached, StorageUnavailable, UnsafeSvg, UnsupportedFileType, VaultNotFound,
)
from app.core.file_safety import SVG, HTML
from app.core.ports.object_storage_port import ObjectStoragePort
from app.core.ports.vault_port import VaultPort
from app.core.problems import problem_responses
from app.core.schemas import FileMetaOut, FileVisibilityUpdate, TokenPayload
from app.core.vault_access import level_of
from app.core.vault_context import VaultContext
from app.routers.auth import SESSION_ERRORS
from app.routers.vaults import get_vault_port
from app.services.agent_access_guard import AgentAccessGuard
from app.services.limit_guard import guard_for
from app.services.file_service import MAX_FILE_SIZE, MAX_FILE_SIZE_DOCUMENT, FileService, file_path_of
from app.services.vault_service import VaultService

router = APIRouter(prefix="/files", tags=["files"])


# Esquemas de petición/respuesta
class FileUpdate(BaseModel):
    """PATCH /files/{id}: actualizar name y/o visibility (C-5)."""
    name: str | None = None
    visibility: str | None = None
    folder: str | None = None  # presente = mover a esa carpeta (vacía = raíz); ausente = no cambia


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
        # `unsafe-eval`: Plotly (WebGL 2D) compila sus shaders con `new Function`. El documento ya corre
        # aislado (sandbox sin same-origin, sin red) y puede ejecutar scripts propios: no añade superficie.
        "script-src 'unsafe-inline' 'unsafe-eval'; "
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


def file_services(
    ctx: VaultContext,
    principal: TokenPayload,
    db: Session,
    storage: ObjectStoragePort,
    vault_port: VaultPort,
) -> tuple[FileService, AgentAccessGuard]:
    """El servicio y la guardia de archivos sobre la bóveda `ctx` (H-064 F3b1). Un miembro trabaja sobre la base del
    dueño con sus concesiones; el dueño y sus claves, sobre su propia base, como antes. La bóveda se valida contra la base
    del contexto, nunca contra la petición (C-7, mismo criterio que vaults)."""
    vault_service = VaultService(vault_port, ctx.db)
    service = FileService(
        FileRepository(db),
        storage,
        ctx.owner_id,
        ensure_vault=lambda vault_id: vault_service.get(vault_id),
        limit_guard=guard_for(db, ctx.owner_id, vault_port),
        member=ctx.member,
    )
    actor = actor_of(principal) if ctx.member is None else Actor("human")  # H-064 F4: mandan las concesiones, no el registro del propietario
    return service, AgentAccessGuard(vault_port, ctx.db, ctx.owner_id, actor)


def _record_context(file_id: str, principal: TokenPayload, db: Session) -> VaultContext:
    """El contexto de la bóveda a la que pertenece el archivo `file_id` (la ruta no trae `vault_id`)."""
    record = FileRepository(db).get(file_id)
    if record is None:
        raise FileNotFound()
    return resolve_vault_context(principal, record.vault_id, db)


def _optional_principal(request: Request, db: Session) -> TokenPayload | None:
    """La sesión o key si la hay y es válida; `None` si no. Un público se sirve sin credencial y no debe fallar por una
    cookie caducada."""
    try:
        return get_current_principal(request, db)
    except (NotAuthenticated, InvalidToken, StorageUnavailable):
        return None


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=FileMetaOut,
    responses=problem_responses(
        *SESSION_ERRORS, VaultNotFound, FileNotFound, FileTooLarge, UnsupportedFileType, UnsafeSvg, AgentAccessDenied,
        ShareForbidden, StorageLimitReached, StorageUnavailable,
    ),
)
def upload_file(
    vault_id: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    folder: Annotated[str | None, Form()] = None,
    visibility: Annotated[Literal["private", "public"], Form()] = "private",
    principal: TokenPayload = Depends(get_current_principal),
    db: Session = Depends(get_db),
    storage: ObjectStoragePort = Depends(get_object_storage),
    vault_port: VaultPort = Depends(get_vault_port),
):
    # Se lee el archivo con tope por tipo (5 MB imágenes, 25 MB resto). El servicio decide el
    # límite basado en la extensión (C-2/C-11). El handler es síncrono → corre en el threadpool,
    # así la lectura y la subida a MinIO (que bloquean) no frenan el bucle de eventos.
    ctx = resolve_vault_context(principal, vault_id, db)
    service, guard = file_services(ctx, principal, db, storage, vault_port)
    guard.check(vault_id, "file-upload", [file.filename or "archivo"], files=True)
    data = file.file.read(MAX_FILE_SIZE_DOCUMENT + 1)
    return service.create(
        vault_id=vault_id, filename=file.filename or "archivo", data=data, folder=folder, visibility=visibility
    )


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
    Un miembro invitado lo lee si sus concesiones lo cubren; si no, 404 como si no existiera (H-064 F3b1).
    Cabeceras por tipo: imágenes/PDF/HTML inline, resto attachment. HTML con CSP sandbox."""
    record = FileRepository(db).get(file_id)
    if record is None:
        raise FileNotFound()
    if record.visibility != "public":
        # Privado: exige credencial válida (401 sin ella) y ser el dueño o un miembro con concesión (404 si no, C-3/C-12).
        principal = get_current_principal(request, db)
    else:
        principal = _optional_principal(request, db)
    if principal is not None and principal.sub != record.owner_id:
        ctx = resolve_vault_context(principal, record.vault_id, db)
        if ctx.member is not None:
            if level_of(ctx.member, file_path_of(record.folder, record.name)) is None:
                raise FileNotFound()
        elif record.visibility != "public":
            raise FileNotFound()
    data = storage.get_object(record.object_key)
    headers = _get_response_headers(record)
    return Response(content=data, media_type=record.content_type, headers=headers)


@router.patch(
    "/{file_id}",
    response_model=FileMetaOut,
    responses=problem_responses(
        *SESSION_ERRORS, FileNotFound, UnsupportedFileType, AgentAccessDenied, FileVisibilityUserOnly, ShareForbidden,
        StorageUnavailable,
    ),
)
def update_file(
    file_id: str,
    body: FileUpdate,
    principal: TokenPayload = Depends(get_current_principal),
    db: Session = Depends(get_db),
    storage: ObjectStoragePort = Depends(get_object_storage),
    vault_port: VaultPort = Depends(get_vault_port),
):
    """Actualizar name, visibility y/o folder del archivo (C-5, H-046). El dueño lo cambia todo; un miembro con escritura
    cambia la visibilidad, y mover o renombrar le responde 403 (H-064 F3b1). La visibilidad se elige al subir (un agente
    puede pedir `public` entonces); después solo la cambia la persona con su sesión: una API key recibe 403."""
    ctx = _record_context(file_id, principal, db)
    service, guard = file_services(ctx, principal, db, storage, vault_port)
    record = service.get_record(file_id)
    guard.check(record.vault_id, "file-update", [record.name], files=True)
    if body.visibility is not None and principal.via_key:
        raise FileVisibilityUserOnly()

    if body.name is not None:
        record = service.set_name(file_id, body.name)
    if body.visibility is not None:
        record = service.set_visibility(file_id, body.visibility)
    if "folder" in body.model_fields_set:
        record = service.move_file(file_id, body.folder)

    return record


@router.delete(
    "/{file_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=problem_responses(*SESSION_ERRORS, FileNotFound, AgentAccessDenied, ShareForbidden, StorageUnavailable),
)
def delete_file(
    file_id: str,
    principal: TokenPayload = Depends(get_current_principal),
    db: Session = Depends(get_db),
    storage: ObjectStoragePort = Depends(get_object_storage),
    vault_port: VaultPort = Depends(get_vault_port),
):
    """Borra el archivo (objeto + registro): el dueño siempre; un miembro solo con escritura sobre él (H-064 F3b1)."""
    ctx = _record_context(file_id, principal, db)
    service, guard = file_services(ctx, principal, db, storage, vault_port)
    guard.check(service.get_record(file_id).vault_id, "file-delete", [file_id], files=True)
    service.delete(file_id)
