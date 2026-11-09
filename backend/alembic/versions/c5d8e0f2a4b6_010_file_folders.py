"""010_file_folders

Revision ID: c5d8e0f2a4b6
Revises: b4c7d9e1f3a5
Create Date: 2026-11-09 18:00:00.000000

Tabla de carpetas explícitas de archivos (H-046): permite crear carpetas vacías y subcarpetas.
Aditiva: no toca `files`. Las carpetas con archivos siguen derivándose de `files.folder`.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c5d8e0f2a4b6'
down_revision: Union[str, None] = 'b4c7d9e1f3a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'file_folders',
        sa.Column('vault_id', sa.String(), nullable=False),
        sa.Column('path', sa.String(), nullable=False),
        sa.Column('owner_id', sa.String(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('vault_id', 'path'),
    )
    op.create_index('ix_file_folders_owner_id', 'file_folders', ['owner_id'])


def downgrade() -> None:
    op.drop_index('ix_file_folders_owner_id', table_name='file_folders')
    op.drop_table('file_folders')
