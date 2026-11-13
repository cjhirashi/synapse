from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.orm import relationship

from app.adapters.database import Base


class VaultTask(Base):
    """Tarea de una bóveda (H-053), en dos niveles: una raíz y sus subtareas.

    Vive en el control plane (Postgres) junto a `files`: `vault_id` es el id de una bóveda de CouchDB
    (sin FK) y el servicio valida en cada operación que sea del dueño. `parent_id` apunta a la raíz; una
    subtarea nunca tiene hijas (lo garantiza `TaskService`). `path` es una ruta INDICATIVA a un documento o
    carpeta: no se comprueba que exista ni bloquea nada. Las fechas son UTC naive, como el resto de tablas.
    `version` sube en cada cambio y sirve de ETag (`If-Match`) para que una persona y un agente no se pisen.
    `completed_at` marca el cierre (hecha o cancelada) y arranca la cuenta de retención de la raíz.
    """

    __tablename__ = "vault_tasks"

    id = Column(String, primary_key=True)
    owner_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    vault_id = Column(String, nullable=False, index=True)
    parent_id = Column(String, ForeignKey("vault_tasks.id", ondelete="CASCADE"), nullable=True, index=True)
    sort_order = Column(Integer, nullable=False, server_default=text("0"), default=0)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, server_default=text("'pending'"), default="pending", index=True)
    priority = Column(String(10), nullable=False, server_default=text("'medium'"), default="medium")
    # Inicio opcional (para la línea de tiempo); nunca posterior al vencimiento. NULL = sin fecha de inicio.
    start_at = Column(DateTime, nullable=True)
    due_at = Column(DateTime, nullable=True, index=True)
    assignee_type = Column(String(10), nullable=False, server_default=text("'user'"), default="user")
    assignee_agent_id = Column(String, nullable=True)
    path = Column(String(500), nullable=True)
    # Recordatorios de vencimiento: JSON con los minutos antes de `due_at` (p. ej. `[1440, 60]`). NULL = los de siempre (1 día y 1 hora);
    # `[]` = ninguno. El aviso de «venció» no depende de esta lista.
    reminders = Column(Text, nullable=True)
    created_by = Column(String, nullable=False)  # `user` o `agent:<id>`
    updated_by = Column(String, nullable=False)
    version = Column(Integer, nullable=False, server_default=text("1"), default=1)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)
    completed_at = Column(DateTime, nullable=True, index=True)

    # Borrar la raíz borra sus subtareas también en SQLite (donde las FK no cascadan solas).
    children = relationship("VaultTask", cascade="all, delete-orphan", order_by="VaultTask.sort_order")

    __table_args__ = (
        Index("ix_vault_tasks_owner_vault_status", "owner_id", "vault_id", "status"),
        Index("ix_vault_tasks_assignee", "owner_id", "assignee_type", "assignee_agent_id", "status"),
    )
