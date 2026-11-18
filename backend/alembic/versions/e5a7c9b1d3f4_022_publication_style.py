"""022_publication_style

Revision ID: e5a7c9b1d3f4
Revises: d4f6b8a0c2e3
Create Date: 2026-11-18 09:00:00.000000

Añade `style` a `publications`: tipografía, tamaño y color de texto y encabezados del PDF de la plantilla, copiados al publicar.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e5a7c9b1d3f4'
down_revision: Union[str, None] = 'd4f6b8a0c2e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('publications', sa.Column('style', sa.Text(), nullable=False, server_default=sa.text("'{}'")))


def downgrade() -> None:
    op.drop_column('publications', 'style')
