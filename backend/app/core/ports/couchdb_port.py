from abc import ABC, abstractmethod


class CouchDBPort(ABC):
    @abstractmethod
    def ensure_user_db(self, name: str) -> None:
        """Crea la base del usuario; debe ser idempotente. Lanza ProvisioningError si falla."""
