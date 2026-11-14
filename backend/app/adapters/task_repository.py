from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.core.models.task import VaultTask

MAX_LIST = 1000


class TaskRepository:
    """Tareas sobre la sesión de Postgres (una instancia por petición). Toda lectura va acotada al dueño."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def add(self, task: VaultTask) -> VaultTask:
        self._db.add(task)
        self._db.flush()
        return task

    def get(self, task_id: str, owner_id: str) -> VaultTask | None:
        task = self._db.get(VaultTask, task_id)
        return task if task is not None and task.owner_id == owner_id else None

    def children(self, parent_id: str) -> list[VaultTask]:
        return self._db.query(VaultTask).filter(VaultTask.parent_id == parent_id).order_by(VaultTask.sort_order, VaultTask.created_at).all()

    def next_sort_order(self, owner_id: str, vault_id: str, parent_id: str | None) -> int:
        query = self._db.query(func.max(VaultTask.sort_order)).filter(VaultTask.owner_id == owner_id, VaultTask.vault_id == vault_id)
        query = query.filter(VaultTask.parent_id.is_(None) if parent_id is None else VaultTask.parent_id == parent_id)
        current = query.scalar()
        return 0 if current is None else current + 1

    def list(
        self, owner_id: str, vault_id: str | None = None, statuses: list[str] | None = None, assignee: str | None = None,
        due_after: datetime | None = None, due_before: datetime | None = None,
    ) -> list[VaultTask]:
        """Tareas del dueño (de una bóveda o de todas) con filtros. `assignee`: `user` o el id de un agente."""
        query = self._db.query(VaultTask).filter(VaultTask.owner_id == owner_id)
        if vault_id is not None:
            query = query.filter(VaultTask.vault_id == vault_id)
        if statuses:
            query = query.filter(VaultTask.status.in_(statuses))
        if assignee == "user":
            query = query.filter(VaultTask.assignee_type == "user")
        elif assignee:
            query = query.filter(VaultTask.assignee_type == "agent", VaultTask.assignee_agent_id == assignee)
        if due_after is not None:
            query = query.filter(VaultTask.due_at >= due_after)
        if due_before is not None:
            query = query.filter(VaultTask.due_at <= due_before)
        return query.options(selectinload(VaultTask.blockers)).order_by(VaultTask.sort_order, VaultTask.created_at).limit(MAX_LIST).all()

    def delete(self, task: VaultTask) -> None:
        self._db.delete(task)

    def flush(self) -> None:
        self._db.flush()

    def commit(self) -> None:
        self._db.commit()

    def rollback(self) -> None:
        self._db.rollback()

    def refresh(self, task: VaultTask) -> VaultTask:
        self._db.refresh(task)
        return task

    def purge_closed_roots(self, cutoff: datetime) -> int:
        """Borra las raíces cerradas antes de `cutoff` (con sus subtareas, en cascada). Retorna cuántas raíces."""
        roots = self._db.query(VaultTask).filter(
            VaultTask.parent_id.is_(None), VaultTask.status.in_(("done", "cancelled")), VaultTask.completed_at < cutoff
        ).all()
        for root in roots:
            self._db.delete(root)
        self._db.commit()
        return len(roots)
