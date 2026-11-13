"""015_agent_profiles

Revision ID: b3c5d7e9f1a2
Revises: a2b4c6d8e0f1
Create Date: 2026-11-13 10:00:00.000000

Tabla `agent_profiles` de H-053: nombre visible y foto de cada agente (por persona y `agent_id`). Aditiva.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b3c5d7e9f1a2'
down_revision: Union[str, None] = 'a2b4c6d8e0f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "agent_profiles",
        sa.Column("owner_id", sa.String(), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("agent_id", sa.String(32), primary_key=True),
        sa.Column("display_name", sa.String(60), nullable=True),
        sa.Column("avatar_content_type", sa.String(), nullable=True),
        sa.Column("avatar_version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("agent_profiles")
