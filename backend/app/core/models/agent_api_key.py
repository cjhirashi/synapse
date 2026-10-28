import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Index, String, text
from sqlalchemy.orm import relationship

from app.adapters.database import Base


class AgentApiKey(Base):
    """Credencial de larga vida de un agente OpenClaw (SPEC-0013).

    Vive en el control plane junto a `users`/`refresh_tokens` (P-1): la autenticación no
    puede residir en la base CouchDB `synapse_user_{id}` porque esa base la elige la propia
    autenticación. Sólo se guarda el hash SHA-256 (P-3/P4); el valor plano se devuelve una
    única vez en la creación y nunca se persiste.
    """

    __tablename__ = "agent_api_keys"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    label = Column(String, nullable=False)  # etiqueta corta por agente/plataforma (p. ej. "aira")
    # SHA-256; nunca el valor en claro. Indexado para el lookup O(1) de `resolve` (P-3).
    key_hash = Column(String, unique=True, index=True, nullable=False)
    created_at = Column(DateTime, nullable=False)
    last_used_at = Column(DateTime, nullable=True)  # best-effort (RF-009)
    revoked_at = Column(DateTime, nullable=True)    # su fecha es a la vez marca y bitácora
    owner = relationship("User")

    # P-10 (Gate 2): `label` único por dueño pero sólo entre keys vigentes — índice parcial,
    # portable entre SQLite y PostgreSQL 15 (ambos soportan `CREATE UNIQUE INDEX ... WHERE`).
    # Revocar libera el label para reutilizarlo (rotación), por eso no es `UniqueConstraint`.
    __table_args__ = (
        Index(
            "uq_agent_api_keys_owner_label_active",
            "owner_id",
            "label",
            unique=True,
            sqlite_where=text("revoked_at IS NULL"),
            postgresql_where=text("revoked_at IS NULL"),
        ),
    )
