import uuid
from datetime import datetime, timedelta

import jwt
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.models.user import User
from app.core.ports.auth_port import AuthPort
from app.core.ports.couchdb_port import CouchDBPort
from app.core.security import hash_password, verify_password

ADMIN_ROLE_ID = "admin-role-id"
GUEST_ROLE_ID = "guest-role-id"


class AuthService:
    def __init__(self, repo: AuthPort, couchdb: CouchDBPort):
        self.repo = repo
        self.couchdb = couchdb

    def _provision_user(self, email: str, password: str, role_id: str, must_change_password: bool) -> User:
        """Inserta el usuario y su base CouchDB; si algo falla, no queda nada en PostgreSQL."""
        user_id = str(uuid.uuid4())
        couchdb_name = f"synapse_user_{user_id}"
        try:
            user = self.repo.create_user(
                user_id=user_id,
                email=email,
                hashed_password=hash_password(password),
                role_id=role_id,
                couchdb_name=couchdb_name,
                must_change_password=must_change_password,
            )
            self.couchdb.ensure_user_db(couchdb_name)
            self.repo.commit()
        except Exception:
            self.repo.rollback()
            raise
        return user

    def bootstrap_admin(self, email: str, password: str) -> User | None:
        """Crea el admin sembrado si no hay usuarios. Idempotente y seguro ante carreras."""
        if self.repo.get_user_count() > 0:
            return None
        try:
            return self._provision_user(email, password, ADMIN_ROLE_ID, must_change_password=True)
        except IntegrityError:
            # Otra réplica ganó la carrera: el admin ya existe.
            return None

    def create_guest_user(self, email: str, password: str) -> User:
        return self._provision_user(email, password, GUEST_ROLE_ID, must_change_password=True)

    # --- transitorio: se retira en T-018 junto con POST /auth/register ---
    def register_first_user(self, email: str, password: str):
        if self.repo.get_user_count() > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Registration closed — admin already exists",
            )
        return self._provision_user(email, password, ADMIN_ROLE_ID, must_change_password=False)

    def login(self, email: str, password: str):
        user = self.repo.get_user_by_email(email)
        if not user or not verify_password(user.hashed_password, password):
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
