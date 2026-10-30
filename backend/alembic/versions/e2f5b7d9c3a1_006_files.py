"""006_files

Revision ID: e2f5b7d9c3a1
Revises: d1f4a6c8e2b9
Create Date: 2026-10-30 18:00:00.000000

Tabla de metadatos de archivos subidos a MinIO (H-015). Los bytes viven en MinIO bajo
`object_key` (`vaults/<vault_id>/<file_id>`); aquí sólo los metadatos y el control de acceso.
`vault_id` NO lleva FK: las bóvedas viven en CouchDB, no en Postgres (el servicio valida en
cada subida que la bóveda sea del usuario). `visibility` nace en `private` (C-1).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e2f5b7d9c3a1'
down_revision: Union[str, None] = 'd1f4a6c8e2b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('files',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('owner_id', sa.String(), nullable=False),
        sa.Column('vault_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('content_type', sa.String(), nullable=False),
        sa.Column('size', sa.Integer(), nullable=False),
        sa.Column('visibility', sa.String(), server_default=sa.text("'private'"), nullable=False),
        sa.Column('object_key', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_files_owner_id'), 'files', ['owner_id'], unique=False)
    op.create_index(op.f('ix_files_vault_id'), 'files', ['vault_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_files_vault_id'), table_name='files')
    op.drop_index(op.f('ix_files_owner_id'), table_name='files')
    op.drop_table('files')
