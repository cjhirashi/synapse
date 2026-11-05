import uuid

from sqlalchemy import Column, DateTime, Integer, String

from app.adapters.database import Base


class PurgeLog(Base):
    """Una conversación de `AG - MENSAJES` eliminada por la purga (H-030 E7): qué, cuándo y dónde quedó su volcado."""

    __tablename__ = "purge_log"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    ran_at = Column(DateTime, nullable=False, index=True)
    owner_id = Column(String, nullable=False)
    vault_id = Column(String, nullable=False)
    conversation = Column(String, nullable=False)  # carpeta de la conversación
    notes_deleted = Column(Integer, nullable=False)
    dump_file = Column(String, nullable=False)
