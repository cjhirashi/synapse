"""Rutas del perfil de agente (H-053): nombre visible y foto de cada agente de la persona.

Solo sesión humana (`get_current_user`): un agente con su clave no edita ni lee estos perfiles (401).
"""
from typing import Annotated

from fastapi import APIRouter, Depends, File, Path, Response, UploadFile
from sqlalchemy.orm import Session

from app.adapters.agent_profile_repository import AgentProfileRepository
from app.adapters.database import get_db
from app.adapters.minio_adapter import get_object_storage
from app.core.dependencies import get_current_user, require_password_changed
from app.core.errors import (
    AgentProfileInvalid, AgentProfileNotFound, AgentProfilePhotoNotFound, PasswordChangeRequired, ProfilePhotoInvalidType,
    ProfilePhotoTooLarge, StorageUnavailable,
)
from app.core.ports.object_storage_port import ObjectStoragePort
from app.core.problems import problem_responses
from app.core.schemas import AgentProfileListOut, AgentProfileOut, AgentProfilePut, TokenPayload
from app.routers.auth import SESSION_ERRORS
from app.services.agent_profile_service import PHOTO_MAX_SIZE, AgentProfileService

router = APIRouter(
    prefix="/agent-profiles",
    tags=["agent-profiles"],
    dependencies=[Depends(require_password_changed)],
    responses=problem_responses(*SESSION_ERRORS, PasswordChangeRequired),
)

AgentId = Annotated[str, Path(pattern=r"^[a-z0-9][a-z0-9-]{0,31}$")]


def get_service(
    user: TokenPayload = Depends(get_current_user),
    db: Session = Depends(get_db),
    storage: ObjectStoragePort = Depends(get_object_storage),
) -> AgentProfileService:
    return AgentProfileService(AgentProfileRepository(db), storage, user.sub)


@router.get("", response_model=AgentProfileListOut)
def list_profiles(service: AgentProfileService = Depends(get_service)):
    return AgentProfileListOut(items=service.list())


@router.put("/{agent_id}", response_model=AgentProfileOut, responses=problem_responses(AgentProfileNotFound, AgentProfileInvalid))
def put_profile(agent_id: AgentId, body: AgentProfilePut, service: AgentProfileService = Depends(get_service)):
    return service.set_name(agent_id, body.display_name)


@router.put(
    "/{agent_id}/photo", response_model=AgentProfileOut,
    responses=problem_responses(AgentProfileNotFound, ProfilePhotoTooLarge, ProfilePhotoInvalidType, StorageUnavailable),
)
async def put_photo(agent_id: AgentId, file: UploadFile = File(...), service: AgentProfileService = Depends(get_service)):
    # Se lee un byte más que el tope: el servicio ve «más de 2 MB» sin cargar un archivo gigante en memoria.
    return service.set_photo(agent_id, await file.read(PHOTO_MAX_SIZE + 1))


@router.delete("/{agent_id}/photo", response_model=AgentProfileOut, responses=problem_responses(AgentProfileNotFound, StorageUnavailable))
def delete_photo(agent_id: AgentId, service: AgentProfileService = Depends(get_service)):
    return service.clear_photo(agent_id)


@router.get("/{agent_id}/photo", responses=problem_responses(AgentProfilePhotoNotFound, StorageUnavailable))
def get_photo(agent_id: AgentId, service: AgentProfileService = Depends(get_service)):
    data, content_type = service.get_photo(agent_id)
    # `private`: la foto es de esta persona; ningún caché compartido (proxy) debe servirla a otra.
    return Response(content=data, media_type=content_type, headers={"Cache-Control": "private, no-cache"})
