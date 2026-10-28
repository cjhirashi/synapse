from abc import ABC, abstractmethod
from datetime import datetime

from app.core.models.agent_api_key import AgentApiKey


class AgentKeyPort(ABC):
    """Puerto de persistencia de las API keys de agente (SPEC-0013).

    Mismo contrato que `AuthPort`: las escrituras hacen `flush` sin confirmar y es el
    llamante (el servicio) quien hace `commit`/`rollback`.
    """

    @abstractmethod
    def create(
        self, key_id: str, owner_id: str, label: str, key_hash: str, created_at: datetime
    ) -> AgentApiKey:
        """Inserta (flush) sin confirmar; el llamante hace commit o rollback."""

    @abstractmethod
    def get_active_by_hash(self, key_hash: str) -> AgentApiKey | None:
        """La key vigente (no revocada) con ese hash, o `None`. Lookup indexado O(1)."""

    @abstractmethod
    def list_by_owner(self, owner_id: str) -> list[AgentApiKey]: ...

    @abstractmethod
    def get_owned(self, owner_id: str, key_id: str) -> AgentApiKey | None:
        """La key `key_id` sólo si es de `owner_id`; `None` en cualquier otro caso (P3)."""

    @abstractmethod
    def revoke(self, key: AgentApiKey, revoked_at: datetime) -> None: ...

    @abstractmethod
    def touch_last_used(self, key_id: str, when: datetime) -> None:
        """UPDATE por PK de `last_used_at` (best-effort, RF-009)."""

    @abstractmethod
    def commit(self) -> None: ...

    @abstractmethod
    def rollback(self) -> None: ...
