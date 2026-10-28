"""005_agent_api_keys

Revision ID: d1f4a6c8e2b9
Revises: c9e3f5a7b2d4
Create Date: 2026-10-28 12:00:00.000000

Tabla del control plane para las API keys de agente (SPEC-0013 P-1). Calcada de la 002
(`refresh_tokens`): sólo el hash en reposo, FK a `users`. El índice parcial aplica la
unicidad de `label` por dueño **sólo entre keys vigentes** (P-10), para permitir reutilizar
un label tras revocar (rotación).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd1f4a6c8e2b9'
down_revision: Union[str, None] = 'c9e3f5a7b2d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('agent_api_keys',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('owner_id', sa.String(), nullable=False),
        sa.Column('label', sa.String(), nullable=False),
        sa.Column('key_hash', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('last_used_at', sa.DateTime(), nullable=True),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('key_hash'),
    )
    op.create_index(op.f('ix_agent_api_keys_owner_id'), 'agent_api_keys', ['owner_id'], unique=False)
    op.create_index(op.f('ix_agent_api_keys_key_hash'), 'agent_api_keys', ['key_hash'], unique=True)
    # P-10 (Gate 2): label único por dueño, sólo entre keys vigentes — índice parcial, portable
    # entre SQLite y PostgreSQL 15 (ambos soportan `CREATE UNIQUE INDEX ... WHERE`).
    op.create_index(
        'uq_agent_api_keys_owner_label_active', 'agent_api_keys', ['owner_id', 'label'],
        unique=True, postgresql_where=sa.text('revoked_at IS NULL'), sqlite_where=sa.text('revoked_at IS NULL'),
    )


def downgrade() -> None:
    op.drop_index('uq_agent_api_keys_owner_label_active', table_name='agent_api_keys')
    op.drop_index(op.f('ix_agent_api_keys_key_hash'), table_name='agent_api_keys')
    op.drop_index(op.f('ix_agent_api_keys_owner_id'), table_name='agent_api_keys')
    op.drop_table('agent_api_keys')
