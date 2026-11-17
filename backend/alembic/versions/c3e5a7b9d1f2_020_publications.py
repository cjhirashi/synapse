"""020_publications

Revision ID: c3e5a7b9d1f2
Revises: b2d4f6a8c0e2
Create Date: 2026-11-17 18:00:00.000000

Tabla `publications` de H-035 (publicar documentos). Aditiva: no toca ninguna tabla existente.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3e5a7b9d1f2'
down_revision: Union[str, None] = 'b2d4f6a8c0e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'publications',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('owner_id', sa.String(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('vault_id', sa.String(), nullable=False),
        sa.Column('note_id', sa.String(), nullable=False),
        sa.Column('token', sa.String(64), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('html', sa.Text(), nullable=False),
        sa.Column('meta', sa.Text(), nullable=False, server_default='{}'),
        sa.Column('toc', sa.Text(), nullable=False, server_default='[]'),
        sa.Column('note_rev', sa.String(), nullable=False),
        sa.Column('published_at', sa.DateTime(), nullable=False),
        sa.Column('republished_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_publications_owner_id', 'publications', ['owner_id'])
    op.create_index('ix_publications_token', 'publications', ['token'], unique=True)
    op.create_unique_constraint('uq_publications_vault_note', 'publications', ['vault_id', 'note_id'])


def downgrade() -> None:
    op.drop_table('publications')
