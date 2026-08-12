from datetime import datetime
from sqlalchemy.orm import Session
from app.core.ports.auth_port import AuthPort
from app.core.models.user import User


class AuthRepository(AuthPort):
    def __init__(self, db: Session):
        self.db = db

    def get_user_count(self) -> int:
        return self.db.query(User).count()

    def get_user_by_email(self, email: str) -> User | None:
        return self.db.query(User).filter(User.email == email).first()

    def create_user(
        self,
        user_id: str,
        email: str,
        hashed_password: str,
        role_id: str,
        couchdb_name: str,
    ) -> User:
        user = User(
            id=user_id,
            email=email,
            hashed_password=hashed_password,
            role_id=role_id,
            couchdb_name=couchdb_name,
            created_at=datetime.utcnow(),
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user
