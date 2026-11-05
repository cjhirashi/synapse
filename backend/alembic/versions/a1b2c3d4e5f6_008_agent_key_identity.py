"""008_agent_key_identity

Revision ID: a1b2c3d4e5f6
Revises: f3a6c8e1b4d2
Create Date: 2026-11-05 00:00:00.000000

H-030 E5/E6: una clave por agente. Aditiva: `agent_id` (a qué agente identifica la clave; NULL = clave
general, comportamiento anterior) e `is_admin` (la clave es de un agente administrador). Más la bitácora
del modo sombra (`agent_access_log`): cada escritura de agente y lo que habría decidido el registro.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'f3a6c8e1b4d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('agent_api_keys', sa.Column('agent_id', sa.String(), nullable=True))
    op.add_column(
        'agent_api_keys',
        sa.Column('is_admin', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index(op.f('ix_agent_api_keys_agent_id'), 'agent_api_keys', ['agent_id'], unique=False)
    op.create_table('agent_access_log',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('at', sa.DateTime(), nullable=False),
        sa.Column('owner_id', sa.String(), nullable=False),
        sa.Column('vault_id', sa.String(), nullable=True),
        sa.Column('agent_id', sa.String(), nullable=True),
        sa.Column('key_label', sa.String(), nullable=True),
        sa.Column('declared', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('op', sa.String(), nullable=False),
        sa.Column('paths', sa.Text(), nullable=False),
        sa.Column('decision', sa.String(), nullable=False),
        sa.Column('reason', sa.String(), nullable=True),
        sa.Column('mode', sa.String(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_agent_access_log_at'), 'agent_access_log', ['at'], unique=False)
    op.create_index(op.f('ix_agent_access_log_decision'), 'agent_access_log', ['decision'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_agent_access_log_decision'), table_name='agent_access_log')
    op.drop_index(op.f('ix_agent_access_log_at'), table_name='agent_access_log')
    op.drop_table('agent_access_log')
    op.drop_index(op.f('ix_agent_api_keys_agent_id'), table_name='agent_api_keys')
    op.drop_column('agent_api_keys', 'is_admin')
    op.drop_column('agent_api_keys', 'agent_id')
