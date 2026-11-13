"""Perfil de agente (H-053): nombre visible y foto de cada agente de la persona.

Solo existe para un `agent_id` que lleve alguna API key de la persona (vigente o revocada). La foto se valida igual que
la del usuario: tamaño y tipo por contenido, nunca por el nombre ni el Content-Type del cliente.
"""
from datetime import UTC, datetime

from app.adapters.agent_profile_repository import AgentProfileRepository
from app.core.errors import (
    AgentProfileInvalid, AgentProfileNotFound, AgentProfilePhotoNotFound, ProfilePhotoInvalidType, ProfilePhotoTooLarge,
)
from app.core.file_safety import JPEG, PNG, WEBP, sniff_content_type
from app.core.models.agent_profile import AgentProfile
from app.core.ports.object_storage_port import ObjectStoragePort

PHOTO_MAX_SIZE = 2 * 1024 * 1024
PHOTO_TYPES = {PNG, JPEG, WEBP}
NAME_MAX = 60


def photo_key(owner_id: str, agent_id: str) -> str:
    return f"users/{owner_id}/agents/{agent_id}/avatar"


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class AgentProfileService:
    def __init__(self, repo: AgentProfileRepository, storage: ObjectStoragePort, owner_id: str) -> None:
        self._repo = repo
        self._storage = storage
        self._owner_id = owner_id

    def _require_agent(self, agent_id: str) -> None:
        if agent_id not in self._repo.key_agent_ids(self._owner_id):
            raise AgentProfileNotFound()

    @staticmethod
    def view(agent_id: str, profile: AgentProfile | None) -> dict:
        has_photo = profile is not None and profile.avatar_content_type is not None
        return {
            "agent_id": agent_id,
            "display_name": profile.display_name if profile is not None else None,
            "photo_url": f"/agent-profiles/{agent_id}/photo?v={profile.avatar_version}" if has_photo else None,
        }

    def list(self) -> list[dict]:
        profiles = self._repo.profiles(self._owner_id)
        ids = sorted(self._repo.key_agent_ids(self._owner_id) | set(profiles))
        return [self.view(agent_id, profiles.get(agent_id)) for agent_id in ids]

    def set_name(self, agent_id: str, display_name: str | None) -> dict:
        self._require_agent(agent_id)
        name = (display_name or "").strip() or None
        if name is not None and len(name) > NAME_MAX:
            raise AgentProfileInvalid(errors=[{"pointer": "/display_name", "detail": f"El nombre no puede superar {NAME_MAX} caracteres."}])
        profile = self._repo.get_or_create(self._owner_id, agent_id, _now())
        profile.display_name, profile.updated_at = name, _now()
        self._repo.commit()
        return self.view(agent_id, profile)

    def set_photo(self, agent_id: str, data: bytes) -> dict:
        self._require_agent(agent_id)
        if len(data) > PHOTO_MAX_SIZE:
            raise ProfilePhotoTooLarge()
        content_type = sniff_content_type(data)
        if content_type not in PHOTO_TYPES:
            raise ProfilePhotoInvalidType()
        # Primero el almacén: si falla, los metadatos siguen como estaban.
        self._storage.put_object(photo_key(self._owner_id, agent_id), data, content_type)
        profile = self._repo.get_or_create(self._owner_id, agent_id, _now())
        profile.avatar_content_type, profile.updated_at = content_type, _now()
        profile.avatar_version = (profile.avatar_version or 0) + 1
        self._repo.commit()
        return self.view(agent_id, profile)

    def clear_photo(self, agent_id: str) -> dict:
        self._require_agent(agent_id)
        profile = self._repo.get(self._owner_id, agent_id)
        if profile is not None and profile.avatar_content_type is not None:
            self._storage.delete_object(photo_key(self._owner_id, agent_id))
            profile.avatar_content_type, profile.updated_at = None, _now()  # la versión no se reinicia: la URL nueva rompe la caché
            self._repo.commit()
        return self.view(agent_id, profile)

    def get_photo(self, agent_id: str) -> tuple[bytes, str]:
        profile = self._repo.get(self._owner_id, agent_id)
        if profile is None or profile.avatar_content_type is None:
            raise AgentProfilePhotoNotFound()
        return self._storage.get_object(photo_key(self._owner_id, agent_id)), profile.avatar_content_type
