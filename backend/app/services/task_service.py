"""Reglas de negocio de las tareas de bóveda (H-053).

Opera sobre el repositorio de Postgres y no conoce HTTP. Valida que la bóveda sea del usuario, los dos niveles
(raíz y subtareas), que el agente asignado esté registrado y activo en la bóveda, la ruta indicativa (solo su
forma) y los permisos de cada agente (`AgentAccessGuard.check_task`). El estado de una raíz con subtareas se
deriva de ellas al escribir; no hay planificador. Lanza errores de dominio de `core/errors.py`.
"""
import re
import json
import uuid
from collections.abc import Callable, Sequence
from datetime import UTC, datetime, timedelta

from app.adapters.task_repository import TaskRepository
from app.core import task_rules
from app.core.config import settings
from app.core.errors import TaskInvalid, TaskNotFound, TaskPreconditionFailed
from app.core.models.task import VaultTask
from app.core.schemas import TaskCreate, TaskOut, TaskUpdate
from app.services.agent_access_guard import AgentAccessGuard
from app.services.notification_service import NotificationService

_VERSION = re.compile(r'^(?:W/)?"?(\d{1,9})"?$')


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _reminders_json(values: list[int] | None) -> str | None:
    """Los recordatorios como se guardan en la columna (JSON); `None` = los de siempre."""
    normalized = task_rules.normalize_reminders(values)
    return None if normalized is None else json.dumps(normalized)


def _naive_utc(value: datetime | None) -> datetime | None:
    """Una fecha con zona se lleva a UTC; una sin zona se toma como UTC (así se guarda y así se devuelve con `Z`)."""
    if value is None:
        return None
    return value.astimezone(UTC).replace(tzinfo=None) if value.tzinfo else value


def _invalid(pointer: str, detail: str) -> TaskInvalid:
    return TaskInvalid(errors=[{"pointer": pointer, "detail": detail}])


def parse_version(if_match: str | None) -> int | None:
    """`If-Match` de una tarea: su `version` (`"3"`, `W/"3"` o `3`). Ausente → `None` (sin precondición)."""
    if if_match is None:
        return None
    found = _VERSION.match(if_match.strip())
    if found is None:
        raise TaskPreconditionFailed()
    return int(found.group(1))


class TaskService:
    def __init__(
        self, repo: TaskRepository, owner_id: str, guard: AgentAccessGuard, ensure_vault: Callable[[str], object],
        notifier: NotificationService | None = None,
    ) -> None:
        self._repo = repo
        self._owner_id = owner_id
        self._guard = guard
        # Lanza `VaultNotFound` si la bóveda no existe o no es del usuario (lo provee la ruta con el `VaultService`).
        self._ensure_vault = ensure_vault
        # Avisos a la persona cuando un agente cambia algo que le toca (misma transacción que el cambio).
        self._notifier = notifier

    # --- Lectura ---

    def to_out(self, task: VaultTask) -> TaskOut:
        out = TaskOut.model_validate(task)
        if task.parent_id is None and task.completed_at is not None and task.status in task_rules.CLOSED_STATUSES:
            out.purge_at = task.completed_at + timedelta(days=settings.TASKS_RETENTION_DAYS)
        return out

    def get(self, vault_id: str, task_id: str) -> VaultTask:
        self._ensure_vault(vault_id)
        return self._owned(vault_id, task_id)

    def list(self, vault_id: str | None, **filters) -> list[VaultTask]:
        if vault_id is not None:
            self._ensure_vault(vault_id)
        return self._repo.list(self._owner_id, vault_id, **filters)

    # --- Escritura ---

    def create(self, vault_id: str, body: TaskCreate) -> VaultTask:
        self._ensure_vault(vault_id)
        parent = self._parent_for(vault_id, body.parent_id)
        self._guard.check_task(vault_id, "create", body.title, created_by=None, assignee_agent_id=None)
        path = self._path(body.path)
        agent_id = self._assignee(vault_id, body.assignee_type, body.assignee_agent_id)
        self._check_span(_naive_utc(body.start_at), _naive_utc(body.due_at))
        blockers = self._resolve_blockers(vault_id, None, parent, body.blocked_by)
        self._check_not_blocked(body.status, blockers)
        project_id = self._project_for(vault_id, parent, body.project_id)
        now = _now()
        closed = body.status in task_rules.CLOSED_STATUSES
        task = VaultTask(
            id=str(uuid.uuid4()), owner_id=self._owner_id, vault_id=vault_id,
            parent_id=parent.id if parent else None,
            sort_order=body.sort_order if body.sort_order is not None else self._repo.next_sort_order(
                self._owner_id, vault_id, parent.id if parent else None),
            title=body.title, description=body.description, notes=body.notes, status=body.status,
            project_id=project_id, priority=body.priority, start_at=_naive_utc(body.start_at), due_at=_naive_utc(body.due_at), reminders=_reminders_json(body.reminders), assignee_type=body.assignee_type,
            assignee_agent_id=agent_id, path=path, created_by=self._guard.author, updated_by=self._guard.author,
            version=1, created_at=now, updated_at=now, completed_at=now if closed else None,
        )
        self._repo.add(task)
        task.blockers = blockers
        if parent is not None:
            self._refresh_parent(parent)
        if task.assignee_type == "user":
            self._notify_assigned(task)
        return self._save(task)

    def update(self, vault_id: str, task_id: str, body: TaskUpdate, if_match: str | None = None) -> VaultTask:
        self._ensure_vault(vault_id)
        task = self._owned(vault_id, task_id)
        expected = parse_version(if_match)
        if expected is not None and expected != task.version:
            raise TaskPreconditionFailed()
        sent = body.model_fields_set
        if "title" in sent and body.title is None:
            raise _invalid("/title", "Title cannot be empty")
        self._guard.check_task(
            vault_id, "update", task.title, created_by=task.created_by, assignee_agent_id=task.assignee_agent_id,
            changed=frozenset(sent))
        if "status" in sent and body.status is None:
            raise _invalid("/status", "Status cannot be empty")
        if "status" in sent and body.status != task.status and self._repo.children(task.id):
            raise _invalid("/status", "A task with subtasks takes its status from them")
        blockers = self._resolve_blockers(vault_id, task, None, body.blocked_by or []) if "blocked_by" in sent else None
        if "project_id" in sent:
            project_id = self._project_for(vault_id, self._repo.get(task.parent_id, self._owner_id) if task.parent_id else None, body.project_id)
            task.project_id = project_id
            for child in self._repo.children(task.id):
                child.project_id = project_id
        if "status" in sent and body.status != task.status:
            self._check_not_blocked(body.status, task.blockers if blockers is None else blockers)
        for field in ("title", "priority", "sort_order"):
            if field in sent and getattr(body, field) is not None:
                setattr(task, field, getattr(body, field))
        for field in ("description", "notes"):  # un `null` explícito los vacía
            if field in sent:
                setattr(task, field, getattr(body, field))
        was_status, was_assignee = task.status, task.assignee_type
        if "start_at" in sent or "due_at" in sent:  # se valida el par resultante antes de tocar la tarea
            start = _naive_utc(body.start_at) if "start_at" in sent else task.start_at
            due = _naive_utc(body.due_at) if "due_at" in sent else task.due_at
            self._check_span(start, due)
            task.start_at, task.due_at = start, due
        if "path" in sent:
            task.path = self._path(body.path)
        if "reminders" in sent:  # `null` vuelve a los de siempre; `[]` los quita todos
            task.reminders = _reminders_json(body.reminders)
        if "assignee_type" in sent or "assignee_agent_id" in sent:
            kind = body.assignee_type if "assignee_type" in sent and body.assignee_type else task.assignee_type
            agent_id = body.assignee_agent_id if "assignee_agent_id" in sent else task.assignee_agent_id
            task.assignee_agent_id = self._assignee(vault_id, kind, agent_id)
            task.assignee_type = kind
        if blockers is not None:
            task.blockers = blockers
        if "status" in sent and body.status is not None:
            self._set_status(task, body.status)
        self._touch(task)
        if task.assignee_type == "user" and was_assignee != "user":
            self._notify_assigned(task)
        if task.status != was_status:
            self._notify_status(task)
        self._repo.flush()  # la sesión no vuelca sola: la raíz debe ver el estado nuevo de esta subtarea
        if task.parent_id is not None:
            self._refresh_parent(self._owned(vault_id, task.parent_id))
        elif blockers is not None:
            self._refresh_parent(task)
        if task.status != was_status:
            self._refresh_dependents([task])
        return self._save(task)

    def delete(self, vault_id: str, task_id: str) -> None:
        self._ensure_vault(vault_id)
        task = self._owned(vault_id, task_id)
        self._guard.check_task(
            vault_id, "delete", task.title, created_by=task.created_by, assignee_agent_id=task.assignee_agent_id)
        parent_id = task.parent_id
        dependents = {dep.id for gone in [task, *self._repo.children(task.id)] for dep in gone.blocking}
        self._repo.delete(task)
        self._repo.commit()
        if parent_id is not None:
            parent = self._repo.get(parent_id, self._owner_id)
            if parent is not None:
                self._refresh_parent(parent)
                self._repo.commit()
        # Las tareas que esperaban a la borrada (o a sus subtareas) pueden quedar libres.
        self._refresh_dependents([dep for dep in (self._repo.get(i, self._owner_id) for i in dependents) if dep is not None])
        self._repo.commit()

    # --- Reglas ---

    def _owned(self, vault_id: str, task_id: str) -> VaultTask:
        task = self._repo.get(task_id, self._owner_id)
        if task is None or task.vault_id != vault_id:
            raise TaskNotFound()
        return task

    def _parent_for(self, vault_id: str, parent_id: str | None) -> VaultTask | None:
        """La raíz bajo la que cuelga una subtarea. Una subtarea no puede tener hijas: dos niveles exactos."""
        if parent_id is None:
            return None
        parent = self._owned(vault_id, parent_id)
        if parent.parent_id is not None:
            raise _invalid("/parent_id", "A subtask cannot have subtasks")
        return parent

    def _resolve_blockers(
        self, vault_id: str, task: VaultTask | None, parent: VaultTask | None, ids: Sequence[str] | None,
    ) -> Sequence[VaultTask]:
        """Las tareas que bloquean a `task` (o a la que se va a crear bajo `parent`): de su misma bóveda, sin ciclos y
        sin la relación padre-hija (la raíz ya espera a sus subtareas y una subtarea no puede esperar a su raíz)."""
        found = []
        parent_id = parent.id if parent is not None else (task.parent_id if task is not None else None)
        for blocker_id in dict.fromkeys(ids or []):
            if task is not None and blocker_id == task.id:
                raise _invalid("/blocked_by", "A task cannot block itself")
            blocker = self._repo.get(blocker_id, self._owner_id)
            if blocker is None or blocker.vault_id != vault_id:
                raise _invalid("/blocked_by", "A blocking task must exist in the same vault")
            if blocker.id == parent_id or (task is not None and blocker.parent_id == task.id):
                raise _invalid("/blocked_by", "A task cannot be blocked by its parent task or by its own subtasks")
            if task is not None and self._reaches(blocker, task.id):
                raise _invalid("/blocked_by", "Blocking tasks cannot form a cycle")
            found.append(blocker)
        return found

    def _project_for(self, vault_id: str, parent: VaultTask | None, project_id: str | None) -> str | None:
        """El proyecto de una tarea (H-058): de su misma bóveda. Una subtarea toma el de su raíz y no tiene uno propio."""
        if parent is not None:
            if project_id is not None and project_id != parent.project_id:
                raise _invalid("/project_id", "A subtask takes the project of its task")
            return parent.project_id
        if project_id is None:
            return None
        project = self._repo.project(project_id, self._owner_id)
        if project is None or project.vault_id != vault_id:
            raise _invalid("/project_id", "The project must exist in the same vault")
        return project.id

    @staticmethod
    def _reaches(start: VaultTask, target_id: str) -> bool:
        """¿`start` espera, directa o indirectamente, a la tarea `target_id`?"""
        seen: set[str] = set()
        pending = [start]
        while pending:
            current = pending.pop()
            if current.id == target_id:
                return True
            if current.id in seen:
                continue
            seen.add(current.id)
            pending.extend(current.blockers)
        return False

    @staticmethod
    def _check_not_blocked(status: str | None, blockers: Sequence[VaultTask]) -> None:
        """Una tarea con bloqueadoras sin hacer puede ponerse en curso, pero no darse por hecha."""
        if status == "done" and any(blocker.status != "done" for blocker in blockers):
            raise _invalid("/status", "This task is blocked: its blocking tasks must be done first")

    def _refresh_dependents(self, tasks: Sequence[VaultTask]) -> None:
        """Las raíces con subtareas que esperaban a `tasks` recalculan su estado: pueden haber quedado libres."""
        for task in tasks:
            for dependent in list(task.blocking):
                if dependent.parent_id is None and self._repo.children(dependent.id):
                    self._refresh_parent(dependent)

    def _path(self, path: str | None) -> str | None:
        try:
            return task_rules.normalize_path(path)
        except ValueError:
            raise _invalid("/path", "Path is not valid") from None

    def _assignee(self, vault_id: str, kind: str, agent_id: str | None) -> str | None:
        """Id del agente asignado, o `None` si es de la persona. Un agente debe estar registrado y activo en la bóveda."""
        if kind == "user":
            return None
        if agent_id is None:
            raise _invalid("/assignee_agent_id", "An agent is required when assigned to an agent")
        registration = self._guard.read_registry(vault_id).get(agent_id)
        if registration is None or registration.estado != "activo":
            raise _invalid("/assignee_agent_id", "The agent is not registered and active in this vault")
        return agent_id

    def _set_status(self, task: VaultTask, status: str) -> None:
        """Cambia el estado; `completed_at` marca el cierre y arranca la cuenta de retención (reabrir la reinicia)."""
        closed = status in task_rules.CLOSED_STATUSES
        if closed and task.completed_at is None:
            task.completed_at = _now()
        elif not closed:
            task.completed_at = None
        task.status = status

    @staticmethod
    def _check_span(start: datetime | None, due: datetime | None) -> None:
        """El inicio nunca es posterior al vencimiento."""
        if start is not None and due is not None and start > due:
            raise _invalid("/start_at", "The start date cannot be after the due date")

    def _touch(self, task: VaultTask) -> None:
        task.version += 1
        task.updated_at = _now()
        task.updated_by = self._guard.author

    def _refresh_parent(self, parent: VaultTask) -> None:
        """Recalcula el estado de la raíz a partir de sus subtareas (vigentes en la sesión)."""
        derived = task_rules.derive_parent_status(c.status for c in self._repo.children(parent.id))
        if derived == "done" and parent.status != "done" and parent.blocked:
            derived = "in_progress"  # una raíz bloqueada no se da por hecha sola aunque sus subtareas lo estén
        if derived is not None and derived != parent.status:
            self._set_status(parent, derived)
            self._touch(parent)

    def _agent(self) -> str | None:
        """El agente que hace el cambio, o `None` si lo hace la persona (la persona no se avisa de su propia acción)."""
        author = self._guard.author
        return author.removeprefix("agent:") if author != task_rules.USER else None

    def _notify_assigned(self, task: VaultTask) -> None:
        agent = self._agent()
        if self._notifier is not None and agent is not None:
            self._notifier.notify(
                "task_assigned", f"{agent} te asignó una tarea", body=task.title, vault_id=task.vault_id,
                resource_type="task", resource_id=task.id, url=f"/vaults/{task.vault_id}?tab=tareas&task={task.id}")

    def _notify_status(self, task: VaultTask) -> None:
        agent = self._agent()
        if self._notifier is not None and agent is not None and task.created_by == task_rules.USER:
            self._notifier.notify(
                "task_status", f"{agent} marcó «{task.title}» como {task_rules.STATUS_ES[task.status]}", vault_id=task.vault_id,
                resource_type="task", resource_id=task.id, url=f"/vaults/{task.vault_id}?tab=tareas&task={task.id}")

    def _save(self, task: VaultTask) -> VaultTask:
        self._repo.commit()
        return self._repo.refresh(task)
