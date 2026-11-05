import uuid

from sqlalchemy import Column, DateTime, Index, String, Text, UniqueConstraint

from app.adapters.database import Base


class ChangeLog(Base):
    """Registro de cambios de los documentos de una bóveda (H-030b). Solo se añade; de aquí se generan los
    documentos de `BITACORA/`. Se escribe ANTES que la nota (`status=pending`) y se confirma al escribirla
    (`applied`) o se marca (`failed`): nunca queda un cambio sin registro.

    `rev` es la revisión CouchDB resultante; única por (bóveda, nota) para que el reintento de una
    sincronización no duplique. Las filas de REST nacen sin `rev` (CouchDB la asigna al escribir)."""

    __tablename__ = "change_log"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    at = Column(DateTime, nullable=False)  # UTC
    owner_id = Column(String, nullable=False)
    vault_id = Column(String, nullable=False)
    note_id = Column(String, nullable=False)
    rev = Column(String, nullable=True)
    op = Column(String, nullable=False)  # create | edit | rename | move | delete | restore
    path = Column(Text, nullable=False)
    prev_path = Column(Text, nullable=True)
    title = Column(Text, nullable=True)
    author_kind = Column(String, nullable=False)  # human | agent | general | system
    author = Column(String, nullable=False)
    via = Column(String, nullable=False)  # rest | sync | system
    status = Column(String, nullable=False, default="pending")  # pending | applied | failed

    __table_args__ = (
        UniqueConstraint("vault_id", "note_id", "rev", name="uq_change_log_rev"),
        Index("ix_change_log_vault_at", "vault_id", "at"),
    )
