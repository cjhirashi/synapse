"""004_token_version

Revision ID: c9e3f5a7b2d4
Revises: b8d2e4f6a1c3
Create Date: 2026-10-11 20:00:00.000000

users.token_version: versión de credenciales; el JWT la lleva en el claim `ver` y se
incrementa al cambiar la contraseña, invalidando los access tokens anteriores (RF-021).
refresh_tokens.rotated: marca los refresh tokens revocados por rotación, para detectar su
reutilización (RF-022).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c9e3f5a7b2d4'
down_revision: Union[str, None] = 'b8d2e4f6a1c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('token_version', sa.Integer(), nullable=False, server_default='0'),
    )
    op.add_column(
        'refresh_tokens',
        sa.Column('rotated', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    with op.batch_alter_table('refresh_tokens') as batch:
        batch.drop_column('rotated')
    with op.batch_alter_table('users') as batch:
        batch.drop_column('token_version')
