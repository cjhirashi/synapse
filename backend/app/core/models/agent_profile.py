from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from app.adapters.database import Base


class AgentProfile(Base):
    """Nombre visible y foto de un agente (H-053), por persona y por `agent_id` de sus API keys.

    Identifica las huellas del agente en la app (tareas, bitácora, listas): el `agent_id` sigue siendo el identificador
    técnico y este perfil solo cambia cómo se muestra. La foto vive en el almacén de objetos; `avatar_version` sube en
    cada cambio para que el navegador no reutilice la anterior.
    """

    __tablename__ = "agent_profiles"

    owner_id = Column(String, ForeignKey("users.id"), primary_key=True)
    agent_id = Column(String(32), primary_key=True)
    display_name = Column(String(60), nullable=True)
    avatar_content_type = Column(String, nullable=True)
    avatar_version = Column(Integer, nullable=False, default=0, server_default="0")
    updated_at = Column(DateTime, nullable=False)
