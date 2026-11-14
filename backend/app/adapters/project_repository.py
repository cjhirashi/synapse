from collections.abc import Sequence

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.models.project import VaultProject
from app.core.models.task import VaultTask


class ProjectRepository:
    """Proyectos sobre la sesión de Postgres (una instancia por petición). Toda lectura va acotada al dueño."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def add(self, project: VaultProject) -> VaultProject:
        self._db.add(project)
        self._db.flush()
        return project

    def get(self, project_id: str, owner_id: str) -> VaultProject | None:
        project = self._db.get(VaultProject, project_id)
        return project if project is not None and project.owner_id == owner_id else None

    def list(self, owner_id: str, vault_id: str | None = None, statuses: list[str] | None = None) -> list[VaultProject]:
        query = self._db.query(VaultProject).filter(VaultProject.owner_id == owner_id)
        if vault_id is not None:
            query = query.filter(VaultProject.vault_id == vault_id)
        if statuses:
            query = query.filter(VaultProject.status.in_(statuses))
        return query.order_by(VaultProject.sort_order, VaultProject.created_at).limit(1000).all()

    def next_sort_order(self, owner_id: str, vault_id: str) -> int:
        current = self._db.query(func.max(VaultProject.sort_order)).filter(
            VaultProject.owner_id == owner_id, VaultProject.vault_id == vault_id).scalar()
        return 0 if current is None else current + 1

    def counts(self, project_ids: Sequence[str]) -> dict[str, tuple[int, int]]:
        """`{project_id: (tareas raíz, hechas)}` de los proyectos dados."""
        if not project_ids:
            return {}
        rows = self._db.query(VaultTask.project_id, VaultTask.status, func.count(VaultTask.id)).filter(
            VaultTask.project_id.in_(project_ids), VaultTask.parent_id.is_(None)).group_by(VaultTask.project_id, VaultTask.status).all()
        out: dict[str, tuple[int, int]] = {}
        for project_id, status, count in rows:
            total, done = out.get(project_id, (0, 0))
            out[project_id] = (total + count, done + (count if status == "done" else 0))
        return out

    def clear_tasks(self, project_id: str) -> None:
        """Deja sin proyecto a todas las tareas del proyecto (en SQLite las FK no actúan solas)."""
        self._db.query(VaultTask).filter(VaultTask.project_id == project_id).update({VaultTask.project_id: None}, synchronize_session=False)

    def delete(self, project: VaultProject) -> None:
        self._db.delete(project)

    def flush(self) -> None:
        self._db.flush()

    def commit(self) -> None:
        self._db.commit()

    def refresh(self, project: VaultProject) -> VaultProject:
        self._db.refresh(project)
        return project
