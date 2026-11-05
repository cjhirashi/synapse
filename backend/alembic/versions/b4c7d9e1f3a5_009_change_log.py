"""009_change_log

Revision ID: b4c7d9e1f3a5
Revises: a1b2c3d4e5f6
Create Date: 2026-11-05 03:00:00.000000

H-030b: registro de cambios de los documentos (`change_log`, origen de la BITACORA automática) y la zona
horaria del propietario (`users.timezone`, por defecto America/Mexico_City). Aditiva.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b4c7d9e1f3a5'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('timezone', sa.String(), nullable=False, server_default='America/Mexico_City'),
    )
    op.create_table('change_log',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('at', sa.DateTime(), nullable=False),
        sa.Column('owner_id', sa.String(), nullable=False),
        sa.Column('vault_id', sa.String(), nullable=False),
        sa.Column('note_id', sa.String(), nullable=False),
        sa.Column('rev', sa.String(), nullable=True),
        sa.Column('op', sa.String(), nullable=False),
        sa.Column('path', sa.Text(), nullable=False),
        sa.Column('prev_path', sa.Text(), nullable=True),
        sa.Column('title', sa.Text(), nullable=True),
        sa.Column('author_kind', sa.String(), nullable=False),
        sa.Column('author', sa.String(), nullable=False),
        sa.Column('via', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False, server_default='pending'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('vault_id', 'note_id', 'rev', name='uq_change_log_rev'),
    )
    op.create_index('ix_change_log_vault_at', 'change_log', ['vault_id', 'at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_change_log_vault_at', table_name='change_log')
    op.drop_table('change_log')
    op.drop_column('users', 'timezone')
