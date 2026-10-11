from abc import ABC, abstractmethod
from datetime import datetime

from app.core.models.refresh_token import RefreshToken
from app.core.models.user import User


class AuthPort(ABC):
    @abstractmethod
    def get_user_count(self) -> int: ...

    @abstractmethod
    def get_user_by_email(self, email: str) -> User | None: ...

    @abstractmethod
    def get_user_by_id(self, user_id: str) -> User | None: ...

    @abstractmethod
    def create_user(
        self,
        user_id: str,
        email: str,
        hashed_password: str,
        role_id: str,
        couchdb_name: str,
        must_change_password: bool = False,
    ) -> User:
        """Inserta (flush) sin confirmar; el llamante hace commit o rollback."""

    @abstractmethod
    def update_password(self, user: User, hashed_password: str) -> None:
        """Guarda el hash, desactiva el cambio forzado e incrementa `token_version`."""

    @abstractmethod
    def save_refresh_token(self, user_id: str, token_hash: str, expires_at: datetime) -> RefreshToken: ...

    @abstractmethod
    def get_refresh_token(self, token_hash: str) -> RefreshToken | None: ...

    @abstractmethod
    def revoke_refresh_token(self, token: RefreshToken, rotated: bool = False) -> None: ...

    @abstractmethod
    def revoke_refresh_tokens(self, user_id: str) -> None: ...

    @abstractmethod
    def commit(self) -> None: ...

    @abstractmethod
    def rollback(self) -> None: ...
