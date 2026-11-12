"""012_vault_tasks

Revision ID: e7f0a2c4d6b8
Revises: d6e9f1a3b5c7
Create Date: 2026-11-12 20:00:00.000000

Tabla `vault_tasks` (H-053): tareas de una bóveda en dos niveles (raíz y subtareas), asignables a la
persona o a un agente. Aditiva: no toca ninguna tabla existente.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e7f0a2c4d6b8'
down_revision: Union[str, None] = 'd6e9f1a3b5c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'vault_tasks',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('owner_id', sa.String(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('vault_id', sa.String(), nullable=False),
        sa.Column('parent_id', sa.String(), sa.ForeignKey('vault_tasks.id', ondelete='CASCADE'), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default=sa.text("'pending'")),
        sa.Column('priority', sa.String(10), nullable=False, server_default=sa.text("'medium'")),
        sa.Column('due_at', sa.DateTime(), nullable=True),
        sa.Column('assignee_type', sa.String(10), nullable=False, server_default=sa.text("'user'")),
        sa.Column('assignee_agent_id', sa.String(), nullable=True),
        sa.Column('path', sa.String(500), nullable=True),
        sa.Column('created_by', sa.String(), nullable=False),
        sa.Column('updated_by', sa.String(), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False, server_default=sa.text('1')),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_vault_tasks_owner_id', 'vault_tasks', ['owner_id'])
    op.create_index('ix_vault_tasks_vault_id', 'vault_tasks', ['vault_id'])
    op.create_index('ix_vault_tasks_parent_id', 'vault_tasks', ['parent_id'])
    op.create_index('ix_vault_tasks_status', 'vault_tasks', ['status'])
    op.create_index('ix_vault_tasks_due_at', 'vault_tasks', ['due_at'])
    op.create_index('ix_vault_tasks_completed_at', 'vault_tasks', ['completed_at'])
    op.create_index('ix_vault_tasks_owner_vault_status', 'vault_tasks', ['owner_id', 'vault_id', 'status'])
    op.create_index('ix_vault_tasks_assignee', 'vault_tasks', ['owner_id', 'assignee_type', 'assignee_agent_id', 'status'])


def downgrade() -> None:
    op.drop_table('vault_tasks')
