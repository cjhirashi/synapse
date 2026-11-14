from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text, text

from app.adapters.database import Base


class VaultProject(Base):
    """Proyecto de una bóveda (H-058): una forma de agrupar sus tareas. Vive en el control plane junto a `vault_tasks`.

    `vault_id` es el id de una bóveda de CouchDB (sin FK; el servicio valida que sea del dueño). Borrar un proyecto no
    borra sus tareas: `vault_tasks.project_id` pasa a NULL. `version` sube en cada cambio y sirve de ETag.
    """

    __tablename__ = "vault_projects"

    id = Column(String, primary_key=True)
    owner_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    vault_id = Column(String, nullable=False, index=True)
    sort_order = Column(Integer, nullable=False, server_default=text("0"), default=0)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, server_default=text("'active'"), default="active")
    color = Column(String(10), nullable=False, server_default=text("'blue'"), default="blue")
    assignee_type = Column(String(10), nullable=False, server_default=text("'user'"), default="user")
    assignee_agent_id = Column(String, nullable=True)
    created_by = Column(String, nullable=False)  # `user` o `agent:<id>`
    updated_by = Column(String, nullable=False)
    version = Column(Integer, nullable=False, server_default=text("1"), default=1)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)

    __table_args__ = (Index("ix_vault_projects_owner_vault", "owner_id", "vault_id"),)
