"""011_user_profile

Revision ID: d6e9f1a3b5c7
Revises: c5d8e0f2a4b6
Create Date: 2026-11-10 00:00:00.000000

Perfil de usuario (H-028): añade display_name, avatar_content_type, avatar_version a users.
Permite a usuarios editar nombre visible y foto de avatar almacenada en MinIO.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd6e9f1a3b5c7'
down_revision: Union[str, None] = 'c5d8e0f2a4b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Añade columnas de perfil a users.
    op.add_column(
        'users',
        sa.Column('display_name', sa.String(80), nullable=True)
    )
    op.add_column(
        'users',
        sa.Column('avatar_content_type', sa.String(), nullable=True)
    )
    op.add_column(
        'users',
        sa.Column('avatar_version', sa.Integer(), nullable=False, server_default='0')
    )


def downgrade() -> None:
    # Elimina las columnas de perfil.
    op.drop_column('users', 'avatar_version')
    op.drop_column('users', 'avatar_content_type')
    op.drop_column('users', 'display_name')
