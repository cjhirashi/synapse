"""017_task_start_at

Revision ID: d5e7f9a1b2c4
Revises: c4d6e8f0a1b3
Create Date: 2026-11-13 14:00:00.000000

`vault_tasks.start_at` (H-053): fecha de inicio de la tarea, para que la línea de tiempo (Gantt) no tenga que suponer que empieza al crearse.
NULL = sin fecha de inicio (las tareas existentes no cambian). Aditiva.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd5e7f9a1b2c4'
down_revision: Union[str, None] = 'c4d6e8f0a1b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("vault_tasks", sa.Column("start_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("vault_tasks", "start_at")
