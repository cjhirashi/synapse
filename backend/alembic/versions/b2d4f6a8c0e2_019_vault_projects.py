"""019_vault_projects

Revision ID: b2d4f6a8c0e2
Revises: a1c3e5f7b9d1
Create Date: 2026-11-14 18:30:00.000000

`vault_projects` y `vault_tasks.project_id` (H-058): los proyectos agrupan las tareas de una bóveda. Aditiva: las tareas
existentes quedan sin proyecto. Borrar un proyecto deja a sus tareas sin proyecto (`ON DELETE SET NULL`).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2d4f6a8c0e2'
down_revision: Union[str, None] = 'a1c3e5f7b9d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "vault_projects",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("owner_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("vault_id", sa.String(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'active'")),
        sa.Column("color", sa.String(10), nullable=False, server_default=sa.text("'blue'")),
        sa.Column("assignee_type", sa.String(10), nullable=False, server_default=sa.text("'user'")),
        sa.Column("assignee_agent_id", sa.String(), nullable=True),
        sa.Column("created_by", sa.String(), nullable=False),
        sa.Column("updated_by", sa.String(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_vault_projects_owner_id", "vault_projects", ["owner_id"])
    op.create_index("ix_vault_projects_vault_id", "vault_projects", ["vault_id"])
    op.create_index("ix_vault_projects_owner_vault", "vault_projects", ["owner_id", "vault_id"])
    op.add_column("vault_tasks", sa.Column("project_id", sa.String(), nullable=True))
    op.create_foreign_key("fk_vault_tasks_project_id", "vault_tasks", "vault_projects", ["project_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_vault_tasks_project_id", "vault_tasks", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_vault_tasks_project_id", table_name="vault_tasks")
    op.drop_constraint("fk_vault_tasks_project_id", "vault_tasks", type_="foreignkey")
    op.drop_column("vault_tasks", "project_id")
    op.drop_table("vault_projects")
