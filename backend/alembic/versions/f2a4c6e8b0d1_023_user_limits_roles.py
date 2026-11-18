"""023_user_limits_roles

Revision ID: f2a4c6e8b0d1
Revises: e5a7c9b1d3f4
Create Date: 2026-11-18 14:00:00.000000

H-060: rol `super_admin`; límites por usuario y `deleted_at` (baja con gracia) en `users`; tabla `limit_grace`
(plazo de 30 días tras bajar un límite). Aditiva: todo usuario existente queda sin límites y activo.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f2a4c6e8b0d1'
down_revision: Union[str, None] = 'e5a7c9b1d3f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("INSERT INTO roles (id, name) VALUES ('super-admin-role-id', 'super_admin')")
    op.add_column("users", sa.Column("max_vaults", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("max_notes_per_vault", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("max_storage_bytes_per_vault", sa.BigInteger(), nullable=True))
    op.add_column("users", sa.Column("deleted_at", sa.DateTime(), nullable=True))
    op.create_table(
        "limit_grace",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("vault_id", sa.String(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("deadline_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_limit_grace_user_id", "limit_grace", ["user_id"])
    op.create_index("ix_limit_grace_deadline_at", "limit_grace", ["deadline_at"])


def downgrade() -> None:
    op.drop_index("ix_limit_grace_deadline_at", table_name="limit_grace")
    op.drop_index("ix_limit_grace_user_id", table_name="limit_grace")
    op.drop_table("limit_grace")
    op.drop_column("users", "deleted_at")
    op.drop_column("users", "max_storage_bytes_per_vault")
    op.drop_column("users", "max_notes_per_vault")
    op.drop_column("users", "max_vaults")
    op.execute("DELETE FROM roles WHERE id = 'super-admin-role-id'")
