from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.core.models.agent_api_key import AgentApiKey
from app.core.models.agent_profile import AgentProfile


class AgentProfileRepository:
    """Perfiles de agente sobre la sesión de Postgres (una instancia por petición). Todo va acotado a la persona."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def key_agent_ids(self, owner_id: str) -> set[str]:
        rows = self._db.query(AgentApiKey.agent_id).filter(AgentApiKey.owner_id == owner_id, AgentApiKey.agent_id.isnot(None)).distinct().all()
        return {row[0] for row in rows}

    def profiles(self, owner_id: str) -> dict[str, AgentProfile]:
        return {p.agent_id: p for p in self._db.query(AgentProfile).filter(AgentProfile.owner_id == owner_id).all()}

    def get(self, owner_id: str, agent_id: str) -> AgentProfile | None:
        return self._db.get(AgentProfile, (owner_id, agent_id))

    def get_or_create(self, owner_id: str, agent_id: str, now: datetime) -> AgentProfile:
        found = self.get(owner_id, agent_id)
        if found is None:
            found = AgentProfile(owner_id=owner_id, agent_id=agent_id, avatar_version=0, updated_at=now)
            self._db.add(found)
        return found

    def commit(self) -> None:
        self._db.commit()
