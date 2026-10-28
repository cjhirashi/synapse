from datetime import datetime

from sqlalchemy.orm import Session

from app.core.models.agent_api_key import AgentApiKey
from app.core.ports.agent_key_port import AgentKeyPort


class AgentKeyRepository(AgentKeyPort):
    """Adaptador SQLAlchemy del puerto de API keys, calcado de `AuthRepository`."""

    def __init__(self, db: Session):
        self.db = db

    def create(
        self, key_id: str, owner_id: str, label: str, key_hash: str, created_at: datetime
    ) -> AgentApiKey:
        key = AgentApiKey(
            id=key_id,
            owner_id=owner_id,
            label=label,
            key_hash=key_hash,
            created_at=created_at,
        )
        self.db.add(key)
        self.db.flush()
        return key

    def get_active_by_hash(self, key_hash: str) -> AgentApiKey | None:
        # Hash exacto indexado y sólo vigentes (revoked_at IS NULL): una revocada no se
        # encuentra, así su siguiente uso da 401 idéntico a una inexistente (RF-007).
        return (
            self.db.query(AgentApiKey)
            .filter(AgentApiKey.key_hash == key_hash, AgentApiKey.revoked_at.is_(None))
            .first()
        )

    def list_by_owner(self, owner_id: str) -> list[AgentApiKey]:
        return (
            self.db.query(AgentApiKey)
            .filter(AgentApiKey.owner_id == owner_id)
            .order_by(AgentApiKey.created_at)
            .all()
        )

    def get_owned(self, owner_id: str, key_id: str) -> AgentApiKey | None:
        return (
            self.db.query(AgentApiKey)
            .filter(AgentApiKey.id == key_id, AgentApiKey.owner_id == owner_id)
            .first()
        )

    def revoke(self, key: AgentApiKey, revoked_at: datetime) -> None:
        key.revoked_at = revoked_at
        self.db.flush()

    def touch_last_used(self, key_id: str, when: datetime) -> None:
        self.db.query(AgentApiKey).filter(AgentApiKey.id == key_id).update(
            {"last_used_at": when}
        )
        self.db.flush()

    def commit(self) -> None:
        self.db.commit()

    def rollback(self) -> None:
        self.db.rollback()
