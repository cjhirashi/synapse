"""Rutas de tareas de bóveda (H-053): crear, listar, leer, cambiar y borrar tareas y subtareas.

Patrón de `files.py`: `get_current_principal` (cookie o `Bearer` key) resuelve al dueño; la bóveda se valida
contra la base del dueño, nunca contra la petición. Los permisos por agente (`AgentAccessGuard.check_task`) los
aplica el servicio, que conoce el autor y el asignado de cada tarea. `ETag` es la `version` de la tarea y
`If-Match` la precondición opcional de `PATCH`. `GET /tasks` es la vista transversal del dueño: todas sus bóvedas.
"""
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Response, status
from sqlalchemy.orm import Session

from app.adapters.database import get_db
from app.adapters.task_repository import TaskRepository
from app.core.agent_access import actor_of
from app.core.dependencies import get_current_principal, require_password_changed
from app.core.errors import (
    AgentAccessDenied, PasswordChangeRequired, StorageUnavailable, TaskInvalid, TaskNotFound, TaskPreconditionFailed, VaultNotFound,
)
from app.core.json_body import DeepJsonRoute
from app.core.ports.vault_port import VaultPort
from app.core.problems import problem_responses
from app.core.schemas import TaskCreate, TaskListOut, TaskOut, TaskUpdate, TokenPayload
from app.routers.auth import SESSION_ERRORS
from app.routers.vaults import VaultId, get_vault_port
from app.services.agent_access_guard import AgentAccessGuard
from app.services.task_service import TaskService
from app.services.vault_service import VaultService

router = APIRouter(
    route_class=DeepJsonRoute,
    tags=["tasks"],
    dependencies=[Depends(require_password_changed)],
    responses=problem_responses(*SESSION_ERRORS, PasswordChangeRequired),
)



def _etag(status_code: int) -> dict[int, dict]:
    """Documenta la cabecera `ETag` (la `version` de la tarea entre comillas)."""
    header = {"description": "Versión de la tarea; se envía en `If-Match`.", "schema": {"type": "string"}}
    return {status_code: {"headers": {"ETag": header}}}


def get_task_service(
    principal: TokenPayload = Depends(get_current_principal),
    db: Session = Depends(get_db),
    vault_port: VaultPort = Depends(get_vault_port),
) -> TaskService:
    # La bóveda se valida contra la base del dueño resuelto (cookie o key): una key solo opera en las de su dueño.
    couch = f"synapse_user_{principal.sub}"
    vault_service = VaultService(vault_port, couch)
    guard = AgentAccessGuard(vault_port, couch, principal.sub, actor_of(principal))
    return TaskService(
        TaskRepository(db), principal.sub, guard, ensure_vault=lambda vault_id: vault_service.get(vault_id))


def _respond(service: TaskService, task, response: Response) -> TaskOut:
    response.headers["ETag"] = f'"{task.version}"'
    return service.to_out(task)


def _listing(service: TaskService, tasks) -> TaskListOut:
    return TaskListOut(items=[service.to_out(t) for t in tasks], total=len(tasks))


@router.get(
    "/vaults/{vault_id}/tasks",
    response_model=TaskListOut,
    responses=problem_responses(VaultNotFound, StorageUnavailable),
)
def list_vault_tasks(
    vault_id: VaultId,
    status_in: Annotated[list[str] | None, Query(alias="status")] = None,
    assignee: Annotated[str | None, Query(description="`user` o el id de un agente")] = None,
    due_after: datetime | None = None,
    due_before: datetime | None = None,
    service: TaskService = Depends(get_task_service),
):
    """Tareas de la bóveda (raíces y subtareas, planas: la jerarquía va en `parent_id`)."""
    tasks = service.list(vault_id, statuses=status_in, assignee=assignee, due_after=due_after, due_before=due_before)
    return _listing(service, tasks)


@router.get("/tasks", response_model=TaskListOut, responses=problem_responses(StorageUnavailable))
def list_my_tasks(
    status_in: Annotated[list[str] | None, Query(alias="status")] = None,
    assignee: Annotated[str | None, Query(description="`user` o el id de un agente")] = None,
    due_after: datetime | None = None,
    due_before: datetime | None = None,
    service: TaskService = Depends(get_task_service),
):
    """Tareas del dueño en todas sus bóvedas (p. ej. «mis tareas» o las pendientes de un agente)."""
    tasks = service.list(None, statuses=status_in, assignee=assignee, due_after=due_after, due_before=due_before)
    return _listing(service, tasks)


@router.post(
    "/vaults/{vault_id}/tasks",
    status_code=status.HTTP_201_CREATED,
    response_model=TaskOut,
    responses=_etag(201) | problem_responses(VaultNotFound, TaskNotFound, TaskInvalid, AgentAccessDenied, StorageUnavailable),
)
def create_task(
    vault_id: VaultId, body: TaskCreate, response: Response, service: TaskService = Depends(get_task_service),
):
    return _respond(service, service.create(vault_id, body), response)


@router.post(
    "/vaults/{vault_id}/tasks/{task_id}/subtasks",
    status_code=status.HTTP_201_CREATED,
    response_model=TaskOut,
    responses=_etag(201) | problem_responses(VaultNotFound, TaskNotFound, TaskInvalid, AgentAccessDenied, StorageUnavailable),
)
def create_subtask(
    vault_id: VaultId, task_id: str, body: TaskCreate, response: Response, service: TaskService = Depends(get_task_service),
):
    """Crea una subtarea bajo la raíz `task_id` (el `parent_id` del cuerpo se ignora: manda la ruta)."""
    return _respond(service, service.create(vault_id, body.model_copy(update={"parent_id": task_id})), response)


@router.get(
    "/vaults/{vault_id}/tasks/{task_id}",
    response_model=TaskOut,
    responses=_etag(200) | problem_responses(VaultNotFound, TaskNotFound, StorageUnavailable),
)
def get_task(vault_id: VaultId, task_id: str, response: Response, service: TaskService = Depends(get_task_service)):
    return _respond(service, service.get(vault_id, task_id), response)


@router.patch(
    "/vaults/{vault_id}/tasks/{task_id}",
    response_model=TaskOut,
    responses=_etag(200) | problem_responses(
        VaultNotFound, TaskNotFound, TaskInvalid, TaskPreconditionFailed, AgentAccessDenied, StorageUnavailable),
)
def update_task(
    vault_id: VaultId, task_id: str, body: TaskUpdate, response: Response,
    if_match: str | None = Header(None), service: TaskService = Depends(get_task_service),
):
    """Cambia solo lo enviado. `If-Match` (la `version` vigente) es opcional: con él, un cambio ajeno da 412."""
    return _respond(service, service.update(vault_id, task_id, body, if_match), response)


@router.delete(
    "/vaults/{vault_id}/tasks/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=problem_responses(VaultNotFound, TaskNotFound, AgentAccessDenied, StorageUnavailable),
)
def delete_task(vault_id: VaultId, task_id: str, service: TaskService = Depends(get_task_service)):
    """Borra la tarea y, si es una raíz, sus subtareas."""
    service.delete(vault_id, task_id)
