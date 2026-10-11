import uuid
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Index, func
from sqlalchemy.orm import relationship
from app.adapters.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)  # Argon2id
    is_active = Column(Boolean, default=True)
    must_change_password = Column(Boolean, nullable=False, default=False)
    role_id = Column(String, ForeignKey("roles.id"), nullable=False)
    couchdb_name = Column(String, unique=True)  # synapse_user_{id}
    created_at = Column(DateTime, nullable=False)
    role = relationship("Role", back_populates="users")

    # Unicidad case-insensitive (RF-013); la crea la migración 003.
    __table_args__ = (Index("ix_users_email_lower", func.lower(email), unique=True),)
