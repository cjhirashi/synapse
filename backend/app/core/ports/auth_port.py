from abc import ABC, abstractmethod
from app.core.models.user import User


class AuthPort(ABC):
    @abstractmethod
    def get_user_count(self) -> int: ...

    @abstractmethod
    def get_user_by_email(self, email: str) -> User | None: ...

    @abstractmethod
    def create_user(
        self,
        user_id: str,
        email: str,
        hashed_password: str,
        role_id: str,
        couchdb_name: str,
    ) -> User: ...
