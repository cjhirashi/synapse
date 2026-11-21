"""Rutas de proyectos de bóveda (H-058): agrupan las tareas de una bóveda (como Asana).

Mismo patrón que `tasks.py`: `get_current_principal` (cookie o `Bearer` key) resuelve al dueño y la bóveda se valida
contra su base. `ETag` es la `version` del proyecto y `If-Match` la precondición opcional de `PATCH`. `GET /projects`
es la vista transversal del dueño (todas sus bóvedas). Borrar un proyecto deja sus tareas sin proyecto.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Response, status
from sqlalchemy.orm import Session

from app.adapters.database import get_db
from app.adapters.project_repository import ProjectRepository
from app.core.agent_access import actor_of
from app.core.dependencies import get_current_principal, require_password_changed
from app.core.errors import (
    AgentAccessDenied, PasswordChangeRequired, ProjectNotFound, ProjectPreconditionFailed, StorageUnavailable, TaskInvalid, VaultNotFound,
)
from app.core.json_body import DeepJsonRoute
from app.core.ports.vault_port import VaultPort
from app.core.problems import problem_responses
from app.core.schemas import ProjectCreate, ProjectListOut, ProjectOut, ProjectUpdate, TokenPayload
from app.core.vault_context import user_db_name
from app.routers.auth import SESSION_ERRORS
from app.routers.vaults import VaultId, get_vault_port
from app.services.agent_access_guard import AgentAccessGuard
from app.services.project_service import ProjectService
from app.services.vault_service import VaultService

router = APIRouter(
    route_class=DeepJsonRoute,
    tags=["projects"],
    dependencies=[Depends(require_password_changed)],
    responses=problem_responses(*SESSION_ERRORS, PasswordChangeRequired),
)


def _etag(status_code: int) -> dict[int, dict]:
    header = {"description": "Versión del proyecto; se envía en `If-Match`.", "schema": {"type": "string"}}
    return {status_code: {"headers": {"ETag": header}}}


def get_project_service(
    principal: TokenPayload = Depends(get_current_principal),
    db: Session = Depends(get_db),
    vault_port: VaultPort = Depends(get_vault_port),
) -> ProjectService:
    couch = user_db_name(principal.sub)
    vault_service = VaultService(vault_port, couch)
    guard = AgentAccessGuard(vault_port, couch, principal.sub, actor_of(principal))
    return ProjectService(ProjectRepository(db), principal.sub, guard, ensure_vault=lambda vault_id: vault_service.get(vault_id))


def _respond(service: ProjectService, project, response: Response) -> ProjectOut:
    response.headers["ETag"] = f'"{project.version}"'
    return service.to_out(project)


def _listing(service: ProjectService, projects) -> ProjectListOut:
    items = service.to_outs(projects)
    return ProjectListOut(items=items, total=len(items))


@router.get("/vaults/{vault_id}/projects", response_model=ProjectListOut, responses=problem_responses(VaultNotFound, StorageUnavailable))
def list_vault_projects(
    vault_id: VaultId, status_in: Annotated[list[str] | None, Query(alias="status")] = None,
    service: ProjectService = Depends(get_project_service),
):
    """Proyectos de la bóveda con su avance. Filtro `status` (repetible)."""
    return _listing(service, service.list(vault_id, status_in))


@router.get("/projects", response_model=ProjectListOut, responses=problem_responses(StorageUnavailable))
def list_my_projects(
    status_in: Annotated[list[str] | None, Query(alias="status")] = None, service: ProjectService = Depends(get_project_service),
):
    """Proyectos del dueño en todas sus bóvedas."""
    return _listing(service, service.list(None, status_in))


@router.post(
    "/vaults/{vault_id}/projects", status_code=status.HTTP_201_CREATED, response_model=ProjectOut,
    responses=_etag(201) | problem_responses(VaultNotFound, TaskInvalid, AgentAccessDenied, StorageUnavailable),
)
def create_project(vault_id: VaultId, body: ProjectCreate, response: Response, service: ProjectService = Depends(get_project_service)):
    return _respond(service, service.create(vault_id, body), response)


@router.get(
    "/vaults/{vault_id}/projects/{project_id}", response_model=ProjectOut,
    responses=_etag(200) | problem_responses(VaultNotFound, ProjectNotFound, StorageUnavailable),
)
def get_project(vault_id: VaultId, project_id: str, response: Response, service: ProjectService = Depends(get_project_service)):
    return _respond(service, service.get(vault_id, project_id), response)


@router.patch(
    "/vaults/{vault_id}/projects/{project_id}", response_model=ProjectOut,
    responses=_etag(200) | problem_responses(
        VaultNotFound, ProjectNotFound, TaskInvalid, ProjectPreconditionFailed, AgentAccessDenied, StorageUnavailable),
)
def update_project(
    vault_id: VaultId, project_id: str, body: ProjectUpdate, response: Response,
    if_match: str | None = Header(None), service: ProjectService = Depends(get_project_service),
):
    """Cambia solo lo enviado. `If-Match` (la `version` vigente) es opcional: con él, un cambio ajeno da 412."""
    return _respond(service, service.update(vault_id, project_id, body, if_match), response)


@router.delete(
    "/vaults/{vault_id}/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT,
    responses=problem_responses(VaultNotFound, ProjectNotFound, AgentAccessDenied, StorageUnavailable),
)
def delete_project(vault_id: VaultId, project_id: str, service: ProjectService = Depends(get_project_service)):
    """Borra el proyecto; sus tareas no se borran: quedan sin proyecto."""
    service.delete(vault_id, project_id)
