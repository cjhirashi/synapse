"""021_publication_unpublish_at

Revision ID: d4f6b8a0c2e3
Revises: c3e5a7b9d1f2
Create Date: 2026-11-17 18:00:00.000000

Añade `unpublish_at` a la tabla `publications` para permitir despublicación automática.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4f6b8a0c2e3'
down_revision: Union[str, None] = 'c3e5a7b9d1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('publications', sa.Column('unpublish_at', sa.DateTime(), nullable=True))
    op.create_index('ix_publications_unpublish_at', 'publications', ['unpublish_at'])


def downgrade() -> None:
    op.drop_index('ix_publications_unpublish_at', table_name='publications')
    op.drop_column('publications', 'unpublish_at')
