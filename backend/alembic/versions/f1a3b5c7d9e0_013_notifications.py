"""013_notifications

Revision ID: f1a3b5c7d9e0
Revises: e7f0a2c4d6b8
Create Date: 2026-11-12 22:00:00.000000

Tablas `notifications` (avisos para la persona, con `dedupe_key` única) y `notification_prefs` (tipos apagados) de H-053.
Aditiva: no toca ninguna tabla existente.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f1a3b5c7d9e0'
down_revision: Union[str, None] = 'e7f0a2c4d6b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'notifications',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('owner_id', sa.String(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('kind', sa.String(40), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('body', sa.Text(), nullable=True),
        sa.Column('vault_id', sa.String(), nullable=True),
        sa.Column('resource_type', sa.String(40), nullable=True),
        sa.Column('resource_id', sa.String(), nullable=True),
        sa.Column('url', sa.String(500), nullable=True),
        sa.Column('dedupe_key', sa.String(200), nullable=True, unique=True),
        sa.Column('read_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_notifications_owner_id', 'notifications', ['owner_id'])
    op.create_index('ix_notifications_owner_unread', 'notifications', ['owner_id', 'read_at', 'created_at'])
    op.create_table(
        'notification_prefs',
        sa.Column('owner_id', sa.String(), sa.ForeignKey('users.id'), primary_key=True),
        sa.Column('disabled_kinds', sa.Text(), nullable=False, server_default='[]'),
    )


def downgrade() -> None:
    op.drop_table('notification_prefs')
    op.drop_table('notifications')
