import uuid

from sqlalchemy import Boolean, Column, DateTime, String, Text

from app.adapters.database import Base


class AgentAccessLog(Base):
    """Bitácora del modo sombra de H-030 E6: una fila por escritura de un agente, con lo que el registro de
    `AG - AGENTES` habría decidido. No guarda contenido de notas, solo rutas. Se purga a los 30 días."""

    __tablename__ = "agent_access_log"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    at = Column(DateTime, nullable=False, index=True)
    owner_id = Column(String, nullable=False)
    vault_id = Column(String, nullable=True)
    agent_id = Column(String, nullable=True)
    key_label = Column(String, nullable=True)
    declared = Column(Boolean, nullable=False, default=False)  # agente declarado por cabecera, no por la clave
    op = Column(String, nullable=False)
    paths = Column(Text, nullable=False)  # JSON: lista de rutas evaluadas
    decision = Column(String, nullable=False, index=True)  # allow | deny
    reason = Column(String, nullable=True)
    mode = Column(String, nullable=False)  # shadow | enforce
