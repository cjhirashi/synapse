import logging
import uuid
from datetime import datetime

from sqlalchemy.exc import IntegrityError

from app.core.errors import AgentKeyLabelTaken, AgentKeyNotFound
from app.core.models.agent_api_key import AgentApiKey
from app.core.ports.agent_key_port import AgentKeyPort
from app.core.security import generate_api_key, hash_api_key, is_well_formed_api_key

logger = logging.getLogger(__name__)


class AgentKeyService:
    """Dominio de las API keys de agente (SPEC-0013). Sin dependencia de CouchDB: sólo
    identidad en el control plane. Calcado del hexágono de `AuthService` (P-6)."""

    def __init__(self, repo: AgentKeyPort):
        self.repo = repo

    def create(self, owner_id: str, label: str) -> tuple[AgentApiKey, str]:
        """Genera, hashea y persiste una key; devuelve el valor plano **una sola vez** (RF-001).

        Revalida el label contra las keys vigentes del dueño con un mensaje de dominio claro
        (RF-010); el índice parcial único es el cinturón de seguridad ante una carrera.
        """
        if self._active_label_exists(owner_id, label):
            raise AgentKeyLabelTaken()
        raw = generate_api_key()
        try:
            key = self.repo.create(
                str(uuid.uuid4()), owner_id, label, hash_api_key(raw), datetime.utcnow()
            )
            self.repo.commit()
        except IntegrityError as exc:
            # Otra petición insertó el mismo label vigente entre la comprobación y el INSERT.
            self.repo.rollback()
            raise AgentKeyLabelTaken() from exc
        return key, raw

    def resolve(self, raw: str) -> AgentApiKey | None:
        """La key vigente que corresponde a `raw`, o `None` si no debe autenticar (RF-002/003/007).

        Devuelve `None` (→ 401 en la dependencia, nunca 403) si la forma es inválida, el hash
        no existe entre las vigentes, o el dueño está inactivo. `last_used_at` es best-effort.
        """
        if not is_well_formed_api_key(raw):
            return None  # rechazo barato previo a la BD (RF-003)
        key = self.repo.get_active_by_hash(hash_api_key(raw))
        if key is None or key.owner is None or not key.owner.is_active:
            return None
        self._touch(key)
        return key

    def list(self, owner_id: str) -> list[AgentApiKey]:
        """Todas las keys del dueño (incluidas las revocadas, con su fecha), scoped (RF-004)."""
        return self.repo.list_by_owner(owner_id)

    def revoke(self, owner_id: str, key_id: str) -> None:
        """Revoca una key propia; una ajena o inexistente → `AgentKeyNotFound` (RF-005, P3)."""
        key = self.repo.get_owned(owner_id, key_id)
        if key is None:
            raise AgentKeyNotFound()
        self.repo.revoke(key, datetime.utcnow())
        self.repo.commit()

    # --- internos ---

    def _active_label_exists(self, owner_id: str, label: str) -> bool:
        return any(
            k.label == label for k in self.repo.list_by_owner(owner_id) if k.revoked_at is None
        )

    def _touch(self, key: AgentApiKey) -> None:
        """`last_used_at` en commit propio y aislado (P-7): si falla, no tumba la petición
        principal (RF-009) y no se expone el hash en el registro."""
        try:
            self.repo.touch_last_used(key.id, datetime.utcnow())
            self.repo.commit()
        except Exception:
            self.repo.rollback()
            logger.warning("last_used_at update failed for agent key %s", key.id)
