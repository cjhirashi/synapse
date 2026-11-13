"""014_web_push

Revision ID: a2b4c6d8e0f1
Revises: f1a3b5c7d9e0
Create Date: 2026-11-12 23:55:00.000000

Web Push de H-053: `push_subscriptions` (un dispositivo por fila), `notifications.pushed_at` (cola del despachador; los avisos
existentes se marcan ya revisados para no enviar push de lo viejo) y horas silenciosas en `notification_prefs`.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a2b4c6d8e0f1'
down_revision: Union[str, None] = 'f1a3b5c7d9e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("owner_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False, unique=True),
        sa.Column("p256dh", sa.String(200), nullable=False),
        sa.Column("auth", sa.String(100), nullable=False),
        sa.Column("user_agent", sa.String(300), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_success_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_push_subscriptions_owner_id", "push_subscriptions", ["owner_id"])
    op.add_column("notifications", sa.Column("pushed_at", sa.DateTime(), nullable=True))
    op.execute("UPDATE notifications SET pushed_at = created_at")
    op.create_index("ix_notifications_pending_push", "notifications", ["created_at"], postgresql_where=sa.text("pushed_at IS NULL"))
    op.add_column("notification_prefs", sa.Column("quiet_enabled", sa.Boolean(), nullable=False, server_default="true"))
    op.add_column("notification_prefs", sa.Column("quiet_start", sa.String(5), nullable=False, server_default="22:00"))
    op.add_column("notification_prefs", sa.Column("quiet_end", sa.String(5), nullable=False, server_default="07:00"))


def downgrade() -> None:
    op.drop_column("notification_prefs", "quiet_end")
    op.drop_column("notification_prefs", "quiet_start")
    op.drop_column("notification_prefs", "quiet_enabled")
    op.drop_index("ix_notifications_pending_push", table_name="notifications")
    op.drop_column("notifications", "pushed_at")
    op.drop_index("ix_push_subscriptions_owner_id", table_name="push_subscriptions")
    op.drop_table("push_subscriptions")
