"""Reglas de negocio de los proyectos de bóveda (H-058).

Opera sobre el repositorio de Postgres y no conoce HTTP. Valida que la bóveda sea del usuario, que el agente
responsable esté registrado y activo en la bóveda y los permisos por agente (los de las tareas: un agente registrado
crea, cambia el estado de los que tiene asignados y edita o borra solo los que creó). Borrar un proyecto no borra sus
tareas: quedan sin proyecto.
"""
import re
import uuid
from collections.abc import Callable
from datetime import UTC, datetime

from app.adapters.project_repository import ProjectRepository
from app.core.errors import ProjectNotFound, ProjectPreconditionFailed, TaskInvalid
from app.core.models.project import VaultProject
from app.core.schemas import ProjectCreate, ProjectOut, ProjectUpdate
from app.services.agent_access_guard import AgentAccessGuard

_VERSION = re.compile(r'^(?:W/)?"?(\d{1,9})"?$')


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _invalid(pointer: str, detail: str) -> TaskInvalid:
    return TaskInvalid(errors=[{"pointer": pointer, "detail": detail}])


def parse_version(if_match: str | None) -> int | None:
    if if_match is None:
        return None
    found = _VERSION.match(if_match.strip())
    if found is None:
        raise ProjectPreconditionFailed()
    return int(found.group(1))


class ProjectService:
    def __init__(
        self, repo: ProjectRepository, owner_id: str, guard: AgentAccessGuard, ensure_vault: Callable[[str], object],
    ) -> None:
        self._repo = repo
        self._owner_id = owner_id
        self._guard = guard
        self._ensure_vault = ensure_vault  # lanza `VaultNotFound` si la bóveda no existe o no es del usuario

    # --- Lectura ---

    def to_outs(self, projects: list[VaultProject]) -> list[ProjectOut]:
        counts = self._repo.counts([p.id for p in projects])
        outs = []
        for project in projects:
            out = ProjectOut.model_validate(project)
            out.tasks_total, out.tasks_done = counts.get(project.id, (0, 0))
            outs.append(out)
        return outs

    def to_out(self, project: VaultProject) -> ProjectOut:
        return self.to_outs([project])[0]

    def get(self, vault_id: str, project_id: str) -> VaultProject:
        self._ensure_vault(vault_id)
        return self._owned(vault_id, project_id)

    def list(self, vault_id: str | None, statuses: list[str] | None = None) -> list[VaultProject]:
        if vault_id is not None:
            self._ensure_vault(vault_id)
        return self._repo.list(self._owner_id, vault_id, statuses)

    # --- Escritura ---

    def create(self, vault_id: str, body: ProjectCreate) -> VaultProject:
        self._ensure_vault(vault_id)
        self._guard.check_task(vault_id, "create", body.title, created_by=None, assignee_agent_id=None)
        agent_id = self._assignee(vault_id, body.assignee_type, body.assignee_agent_id)
        now = _now()
        project = VaultProject(
            id=str(uuid.uuid4()), owner_id=self._owner_id, vault_id=vault_id,
            sort_order=body.sort_order if body.sort_order is not None else self._repo.next_sort_order(self._owner_id, vault_id),
            title=body.title, description=body.description, status=body.status, color=body.color,
            assignee_type=body.assignee_type, assignee_agent_id=agent_id,
            created_by=self._guard.author, updated_by=self._guard.author, version=1, created_at=now, updated_at=now,
        )
        self._repo.add(project)
        return self._save(project)

    def update(self, vault_id: str, project_id: str, body: ProjectUpdate, if_match: str | None = None) -> VaultProject:
        self._ensure_vault(vault_id)
        project = self._owned(vault_id, project_id)
        expected = parse_version(if_match)
        if expected is not None and expected != project.version:
            raise ProjectPreconditionFailed()
        sent = body.model_fields_set
        for field in ("title", "status", "color"):
            if field in sent and getattr(body, field) is None:
                raise _invalid(f"/{field}", f"{field.capitalize()} cannot be empty")
        self._guard.check_task(
            vault_id, "update", project.title, created_by=project.created_by, assignee_agent_id=project.assignee_agent_id,
            changed=frozenset(sent))
        for field in ("title", "status", "color", "sort_order"):
            if field in sent and getattr(body, field) is not None:
                setattr(project, field, getattr(body, field))
        if "description" in sent:
            project.description = body.description
        if "assignee_type" in sent or "assignee_agent_id" in sent:
            kind = body.assignee_type if "assignee_type" in sent and body.assignee_type else project.assignee_type
            agent_id = body.assignee_agent_id if "assignee_agent_id" in sent else project.assignee_agent_id
            project.assignee_agent_id = self._assignee(vault_id, kind, agent_id)
            project.assignee_type = kind
        project.version += 1
        project.updated_at = _now()
        project.updated_by = self._guard.author
        return self._save(project)

    def delete(self, vault_id: str, project_id: str) -> None:
        self._ensure_vault(vault_id)
        project = self._owned(vault_id, project_id)
        self._guard.check_task(
            vault_id, "delete", project.title, created_by=project.created_by, assignee_agent_id=project.assignee_agent_id)
        self._repo.clear_tasks(project.id)  # las tareas no se borran: quedan sin proyecto
        self._repo.delete(project)
        self._repo.commit()

    # --- Reglas ---

    def _owned(self, vault_id: str, project_id: str) -> VaultProject:
        project = self._repo.get(project_id, self._owner_id)
        if project is None or project.vault_id != vault_id:
            raise ProjectNotFound()
        return project

    def _assignee(self, vault_id: str, kind: str, agent_id: str | None) -> str | None:
        """Id del agente responsable, o `None` si es la persona. Un agente debe estar registrado y activo en la bóveda."""
        if kind == "user":
            return None
        if agent_id is None:
            raise _invalid("/assignee_agent_id", "An agent is required when the project is assigned to an agent")
        registration = self._guard.read_registry(vault_id).get(agent_id)
        if registration is None or registration.estado != "activo":
            raise _invalid("/assignee_agent_id", "The agent is not registered and active in this vault")
        return agent_id

    def _save(self, project: VaultProject) -> VaultProject:
        self._repo.commit()
        return self._repo.refresh(project)


