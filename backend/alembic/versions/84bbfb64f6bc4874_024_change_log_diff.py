"""024_change_log_diff

Revision ID: 84bbfb64f6bc4874
Revises: f2a4c6e8b0d1
Create Date: 2026-11-19 10:00:00.000000

H-062: bitácora automática registra diff de cada cambio (líneas añadidas, eliminadas y texto del diff).
Nullable porque los cambios anteriores a H-062 quedan sin detalle (no se reconstruyen).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '84bbfb64f6bc4874'
down_revision: Union[str, None] = 'f2a4c6e8b0d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("change_log", sa.Column("lines_added", sa.Integer(), nullable=True))
    op.add_column("change_log", sa.Column("lines_removed", sa.Integer(), nullable=True))
    op.add_column("change_log", sa.Column("diff", sa.Text(), nullable=True))
    op.add_column("change_log", sa.Column("diff_truncated", sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column("change_log", "diff_truncated")
    op.drop_column("change_log", "diff")
    op.drop_column("change_log", "lines_removed")
    op.drop_column("change_log", "lines_added")
