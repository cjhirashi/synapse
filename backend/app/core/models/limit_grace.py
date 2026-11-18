import uuid

from sqlalchemy import Column, DateTime, ForeignKey, String

from app.adapters.database import Base

KIND_VAULTS = "vaults"
KIND_DOCUMENTS = "documents"
KIND_STORAGE = "storage"


class LimitGrace(Base):
    """Plazo de 30 días de un usuario que quedó por encima de un límite tras bajárselo (H-060).

    Una fila por exceso: `kind` (bóvedas, documentos o almacenamiento) y, salvo en bóvedas, la bóveda (`vault_id`,
    id de CouchDB, sin FK). Al vencer `deadline_at`, si sigue por encima, el reajuste manda a la papelera lo más
    viejo; si ya cumple, la fila se borra sola.
    """

    __tablename__ = "limit_grace"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    kind = Column(String, nullable=False)
    vault_id = Column(String, nullable=True)
    started_at = Column(DateTime, nullable=False)
    deadline_at = Column(DateTime, nullable=False, index=True)
