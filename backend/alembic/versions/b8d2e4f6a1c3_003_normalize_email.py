"""003_normalize_email

Revision ID: b8d2e4f6a1c3
Revises: a7c1d2e3f4b5
Create Date: 2026-10-11 18:00:00.000000

Normaliza los emails existentes (sin espacios, en minúsculas) y añade un índice único
sobre lower(email) para que dos emails que sólo difieren en mayúsculas no puedan
coexistir (RF-013). Si ya hubiera duplicados por mayúsculas, la creación del índice
falla y deben resolverse a mano antes de migrar.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b8d2e4f6a1c3'
down_revision: Union[str, None] = 'a7c1d2e3f4b5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        'ix_users_email_lower', 'users', [sa.text('lower(email)')], unique=True,
    )
    op.execute("UPDATE users SET email = lower(trim(email))")


def downgrade() -> None:
    op.drop_index('ix_users_email_lower', table_name='users')
