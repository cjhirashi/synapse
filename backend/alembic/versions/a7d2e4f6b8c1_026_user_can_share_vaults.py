"""026_user_can_share_vaults

Revision ID: a7d2e4f6b8c1
Revises: 9f1c5a3b7e2d
Create Date: 2026-11-21 02:00:00.000000

H-064 F5d: interruptor por usuario que decide quién puede compartir bóvedas (admin y super admin siempre).
Apagado por defecto; más adelante lo decidirá el plan de suscripción.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a7d2e4f6b8c1'
down_revision: Union[str, None] = '9f1c5a3b7e2d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("can_share_vaults", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("users", "can_share_vaults")
