from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.models.refresh_token import RefreshToken
from app.core.models.user import User
from app.core.ports.auth_port import AuthPort


class AuthRepository(AuthPort):
    def __init__(self, db: Session):
        self.db = db

    def get_user_count(self) -> int:
        return self.db.query(User).count()

    def get_user_by_email(self, email: str) -> User | None:
        return self.db.query(User).filter(func.lower(User.email) == email.lower()).first()

    def get_user_by_id(self, user_id: str) -> User | None:
        return self.db.get(User, user_id)

    def create_user(
        self,
        user_id: str,
        email: str,
        hashed_password: str,
        role_id: str,
        couchdb_name: str,
        must_change_password: bool = False,
    ) -> User:
        user = User(
            id=user_id,
            email=email,
            hashed_password=hashed_password,
            role_id=role_id,
            couchdb_name=couchdb_name,
            must_change_password=must_change_password,
            created_at=datetime.utcnow(),
        )
        self.db.add(user)
        self.db.flush()
        return user

    def update_password(self, user: User, hashed_password: str) -> None:
        user.hashed_password = hashed_password
        user.must_change_password = False
        self.db.flush()

    def save_refresh_token(self, user_id: str, token_hash: str, expires_at: datetime) -> RefreshToken:
        token = RefreshToken(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
            created_at=datetime.utcnow(),
        )
        self.db.add(token)
        self.db.flush()
        return token

    def get_refresh_token(self, token_hash: str) -> RefreshToken | None:
        return self.db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()

    def revoke_refresh_token(self, token: RefreshToken) -> None:
        token.revoked = True
        self.db.flush()

    def revoke_refresh_tokens(self, user_id: str) -> None:
        self.db.query(RefreshToken).filter(
            RefreshToken.user_id == user_id, RefreshToken.revoked.is_(False)
        ).update({"revoked": True})
        self.db.flush()

    def commit(self) -> None:
        self.db.commit()

    def rollback(self) -> None:
        self.db.rollback()
