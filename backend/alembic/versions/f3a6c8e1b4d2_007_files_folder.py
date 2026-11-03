"""007_files_folder

Revision ID: f3a6c8e1b4d2
Revises: e2f5b7d9c3a1
Create Date: 2026-11-03 10:00:00.000000

Añade campo opcional folder a files (H-025 paso 1). Permite organizar archivos
en carpetas dentro de una bóveda. None o vacío = sin carpeta.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f3a6c8e1b4d2'
down_revision: Union[str, None] = 'e2f5b7d9c3a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('files') as batch_op:
        batch_op.add_column(sa.Column('folder', sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('files') as batch_op:
        batch_op.drop_column('folder')
