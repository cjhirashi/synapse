"""025_vault_sharing

Revision ID: 9f1c5a3b7e2d
Revises: 84bbfb64f6bc4874
Create Date: 2026-11-19 10:00:00.000000

H-064 F1: tablas de membresía e invitaciones (vault_members) y permisos por carpeta (vault_member_grants).
Fases siguientes extenderán con lógica de invitación y push de cambios.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '9f1c5a3b7e2d'
down_revision: Union[str, None] = '84bbfb64f6bc4874'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Tabla vault_members: membresía (propietario + invitado en una bóveda)
    op.create_table(
        "vault_members",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("vault_id", sa.String(), nullable=False),
        sa.Column("owner_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("status", sa.String(12), nullable=False),
        sa.Column("ended_reason", sa.String(20), nullable=True),
        sa.Column("invited_by", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("responded_at", sa.DateTime(), nullable=True),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("vault_id", "user_id", name="ix_vault_members_unique"),
        sa.CheckConstraint("status IN ('pendiente', 'activo', 'revocado')", name="ck_vault_members_status"),
        sa.CheckConstraint("owner_id != user_id", name="ck_vault_members_owner_ne_user"),
    )

    op.create_index("ix_vault_members_vault_id", "vault_members", ["vault_id"])
    op.create_index("ix_vault_members_owner_id", "vault_members", ["owner_id"])
    op.create_index("ix_vault_members_user_id", "vault_members", ["user_id"])
    op.create_index("ix_vault_members_user_status", "vault_members", ["user_id", "status"])

    # Tabla vault_member_grants: permisos por carpeta para cada miembro
    op.create_table(
        "vault_member_grants",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("member_id", sa.String(), nullable=False),
        sa.Column("folder", sa.String(600), nullable=False),
        sa.Column("level", sa.String(10), nullable=False),
        sa.ForeignKeyConstraint(["member_id"], ["vault_members.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("member_id", "folder", name="ix_vault_member_grants_unique"),
        sa.CheckConstraint("level IN ('lectura', 'escritura')", name="ck_vault_member_grants_level"),
    )

    op.create_index("ix_vault_member_grants_member_id", "vault_member_grants", ["member_id"])


def downgrade() -> None:
    op.drop_table("vault_member_grants")
    op.drop_table("vault_members")
