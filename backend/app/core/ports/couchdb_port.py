from abc import ABC, abstractmethod


class CouchDBPort(ABC):
    @abstractmethod
    def ensure_user_db(self, name: str) -> None:
        """Crea la base del usuario; debe ser idempotente. Lanza ProvisioningError si falla."""

    @abstractmethod
    def drop_user_db(self, name: str) -> None:
        """Borra la base del usuario (H-060, purga de una cuenta); idempotente: una base inexistente no es error.
        Lanza ProvisioningError si falla."""
