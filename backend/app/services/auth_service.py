import uuid
from datetime import datetime, timedelta

import httpx
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import HTTPException, status

from app.core.config import settings
from app.core.ports.auth_port import AuthPort

ph = PasswordHasher()

ADMIN_ROLE_ID = "admin-role-id"


class AuthService:
    def __init__(self, repo: AuthPort):
        self.repo = repo

    def register_first_user(self, email: str, password: str):
        if self.repo.get_user_count() > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Registration closed — admin already exists",
            )
        user_id = str(uuid.uuid4())
        couchdb_name = f"synapse_user_{user_id}"
        hashed = ph.hash(password)

        user = self.repo.create_user(
            user_id=user_id,
            email=email,
            hashed_password=hashed,
            role_id=ADMIN_ROLE_ID,
            couchdb_name=couchdb_name,
        )
        self._create_user_couchdb(user_id)
        return user

    def login(self, email: str, password: str):
        user = self.repo.get_user_by_email(email)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
            )
        try:
            ph.verify(user.hashed_password, password)
        except VerifyMismatchError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
            )
        return user

    def create_token(self, user) -> str:
        payload = {
            "sub": user.id,
            "role": user.role.name,
            "exp": datetime.utcnow() + timedelta(hours=24),
        }
        return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")

    def _create_user_couchdb(self, user_id: str):
        db_name = f"synapse_user_{user_id}"
        with httpx.Client() as client:
            response = client.put(
                f"{settings.COUCHDB_URL}/{db_name}",
                auth=(settings.COUCHDB_USER, settings.COUCHDB_PASSWORD),
            )
            response.raise_for_status()
