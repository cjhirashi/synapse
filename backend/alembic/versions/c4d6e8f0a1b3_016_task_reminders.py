"""016_task_reminders

Revision ID: c4d6e8f0a1b3
Revises: b3c5d7e9f1a2
Create Date: 2026-11-13 12:00:00.000000

`vault_tasks.reminders` (H-053): recordatorios de vencimiento por tarea, JSON con los minutos antes de `due_at`. NULL conserva el
comportamiento de siempre (1 día y 1 hora antes), así que las tareas existentes no cambian. Aditiva.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c4d6e8f0a1b3'
down_revision: Union[str, None] = 'b3c5d7e9f1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("vault_tasks", sa.Column("reminders", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("vault_tasks", "reminders")
