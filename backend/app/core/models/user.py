import uuid
from sqlalchemy import BigInteger, Column, String, Boolean, DateTime, ForeignKey, Index, Integer, false as sa_false, func
from sqlalchemy.orm import relationship
from app.adapters.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)  # Argon2id
    is_active = Column(Boolean, default=True)
    must_change_password = Column(Boolean, nullable=False, default=False)
    token_version = Column(Integer, nullable=False, default=0)  # claim `ver` del JWT (RF-021)
    role_id = Column(String, ForeignKey("roles.id"), nullable=False)
    couchdb_name = Column(String, unique=True)  # synapse_user_{id}
    created_at = Column(DateTime, nullable=False)
    # Zona horaria del propietario (H-030b): hora de la bitácora y corte de día. Nombre IANA.
    timezone = Column(String, nullable=False, default="America/Mexico_City", server_default="America/Mexico_City")
    # Perfil (H-028)
    display_name = Column(String(80), nullable=True)  # Nombre visible del usuario
    avatar_content_type = Column(String, nullable=True)  # image/png, image/jpeg, image/webp
    avatar_version = Column(Integer, nullable=False, default=0, server_default='0')  # Versión de foto para cache-busting
    # H-060: límites por usuario (nulo = sin límite). Solo rigen para los invitados; admin y super admin no tienen.
    max_vaults = Column(Integer, nullable=True)
    max_notes_per_vault = Column(Integer, nullable=True)
    max_storage_bytes_per_vault = Column(BigInteger, nullable=True)
    # H-064: quién puede compartir bóvedas (admin y super admin siempre; un guest solo si un admin lo activa o, más adelante, su plan).
    can_share_vaults = Column(Boolean, nullable=False, default=False, server_default=sa_false())
    # H-060: baja con gracia de 30 días. Mientras no sea nulo la cuenta está inactiva y puede recuperarse.
    deleted_at = Column(DateTime, nullable=True)
    role = relationship("Role", back_populates="users")

    # Unicidad case-insensitive (RF-013); la crea la migración 003.
    __table_args__ = (Index("ix_users_email_lower", func.lower(email), unique=True),)
