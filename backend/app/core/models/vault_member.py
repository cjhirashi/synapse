"""H-064 F1: membresía e invitaciones a bóvedas, con permisos por carpeta.

Fases futuras extenderán con la lógica de invitación y push de cambios de bóveda.
"""

import uuid
from sqlalchemy import Column, DateTime, ForeignKey, Index, String, CheckConstraint, UniqueConstraint, func
from sqlalchemy.orm import relationship

from app.adapters.database import Base


class VaultMember(Base):
    """Membresía de un usuario en una bóveda: propietario + invitado.

    `vault_id` es el id de CouchDB (sin FK: el servicio valida que sea del propietario).
    `status` y `ended_reason` siguen el ciclo del invitado:
    - pendiente → (responde sí) → activo | (rechaza) → revocado (ended_reason=rechazada)
    - activo → (propietario anula) → revocado (ended_reason=revocada)
    - activo → (invitado se va) → revocado (ended_reason=salio)
    - pendiente → (propietario cancela antes de respuesta) → revocado (ended_reason=cancelada)
    """

    __tablename__ = "vault_members"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    vault_id = Column(String, nullable=False, index=True)
    owner_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(12), nullable=False)  # pendiente|activo|revocado
    ended_reason = Column(String(20), nullable=True)  # rechazada|cancelada|revocada|salio
    invited_by = Column(String, nullable=False)  # `user` o `agent:<id>`
    created_at = Column(DateTime, nullable=False)
    responded_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)

    __table_args__ = (
        UniqueConstraint("vault_id", "user_id", name="ix_vault_members_unique"),
        CheckConstraint("status IN ('pendiente', 'activo', 'revocado')", name="ck_vault_members_status"),
        CheckConstraint("owner_id != user_id", name="ck_vault_members_owner_ne_user"),
        Index("ix_vault_members_user_status", "user_id", "status"),
    )


class VaultMemberGrant(Base):
    """Permiso de un miembro en una carpeta de la bóveda.

    `folder` es la ruta (ej. "Proyectos/Synapse") o "*" para toda la bóveda.
    `level` puede ser "lectura" (incluye listar y leer) o "escritura" (incluye crear, editar, borrar).
    """

    __tablename__ = "vault_member_grants"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    member_id = Column(String, ForeignKey("vault_members.id", ondelete="CASCADE"), nullable=False, index=True)
    folder = Column(String(600), nullable=False)
    level = Column(String(10), nullable=False)  # lectura|escritura

    __table_args__ = (
        UniqueConstraint("member_id", "folder", name="ix_vault_member_grants_unique"),
        CheckConstraint("level IN ('lectura', 'escritura')", name="ck_vault_member_grants_level"),
    )
