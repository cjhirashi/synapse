"""018_task_blockers

Revision ID: a1c3e5f7b9d1
Revises: d5e7f9a1b2c4
Create Date: 2026-11-14 17:30:00.000000

`task_blockers` (H-057): una tarea puede estar bloqueada por otras de su misma bóveda; no se puede dar por hecha hasta que
todas sus bloqueadoras estén hechas. Tabla nueva y aditiva: las tareas existentes no cambian.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1c3e5f7b9d1'
down_revision: Union[str, None] = 'd5e7f9a1b2c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "task_blockers",
        sa.Column("task_id", sa.String(), sa.ForeignKey("vault_tasks.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("blocker_id", sa.String(), sa.ForeignKey("vault_tasks.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_index("ix_task_blockers_blocker_id", "task_blockers", ["blocker_id"])


def downgrade() -> None:
    op.drop_index("ix_task_blockers_blocker_id", table_name="task_blockers")
    op.drop_table("task_blockers")
