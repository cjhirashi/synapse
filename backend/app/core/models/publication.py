from sqlalchemy import Column, DateTime, ForeignKey, String, Text, UniqueConstraint, text

from app.adapters.database import Base


class Publication(Base):
    """Copia fija de una nota publicada en `/p/<token>` (H-035).

    La publicación es una instantánea: `html` es el cuerpo renderizado al momento,
    `meta` y `toc` son JSON, y `note_rev` permite detectar si la nota original cambió.
    Una sola publicación por (vault_id, note_id); las republicaciones usan
    `republished_at` para distinguirlas.
    """

    __tablename__ = "publications"

    id = Column(String, primary_key=True)
    owner_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    vault_id = Column(String, nullable=False)
    note_id = Column(String, nullable=False)
    token = Column(String(64), nullable=False, unique=True, index=True)
    title = Column(String(255), nullable=False)
    html = Column(Text, nullable=False)
    meta = Column(Text, nullable=False, server_default=text("'{}'"), default="{}")
    toc = Column(Text, nullable=False, server_default=text("'[]'"), default="[]")
    note_rev = Column(String, nullable=False)
    published_at = Column(DateTime, nullable=False)
    republished_at = Column(DateTime, nullable=True)
    unpublish_at = Column(DateTime, nullable=True, index=True)  # Fecha en que el trabajo de fondo la despublica; None = sin vencimiento.

    __table_args__ = (
        UniqueConstraint("vault_id", "note_id", name="uq_publications_vault_note"),
    )
