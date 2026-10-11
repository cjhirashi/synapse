import secrets
import uuid
from datetime import datetime, timedelta

import jwt
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.models.user import User
from app.core.ports.auth_port import AuthPort
from app.core.ports.couchdb_port import CouchDBPort
from app.core.security import (
    hash_password,
    hash_refresh_token,
    validate_new_password,
    verify_password,
)

ADMIN_ROLE_ID = "admin-role-id"
GUEST_ROLE_ID = "guest-role-id"

ACCESS_TOKEN_TTL = timedelta(hours=24)
REFRESH_TOKEN_TTL = timedelta(days=30)


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
        if self.repo.get_user_by_email(email):
            raise self._email_taken()
        try:
            return self._provision_user(email, password, GUEST_ROLE_ID, must_change_password=True)
        except IntegrityError:
            raise self._email_taken()

    @staticmethod
    def _email_taken() -> HTTPException:
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    def login(self, email: str, password: str) -> User:
        user = self.repo.get_user_by_email(email)
        if not user or not user.is_active or not verify_password(user.hashed_password, password):
            raise self._invalid_credentials()
        return user

    @staticmethod
    def _invalid_credentials() -> HTTPException:
        return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    def create_token(self, user: User) -> str:
        payload = {
            "sub": user.id,
            "role": user.role.name,
            "exp": datetime.utcnow() + ACCESS_TOKEN_TTL,
        }
        return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")

    def create_refresh_token(self, user: User) -> str:
        raw = secrets.token_urlsafe(64)
        self.repo.save_refresh_token(
            user.id, hash_refresh_token(raw), datetime.utcnow() + REFRESH_TOKEN_TTL
        )
        self.repo.commit()
        return raw

    def refresh(self, raw_token: str | None) -> User:
        stored = self.repo.get_refresh_token(hash_refresh_token(raw_token)) if raw_token else None
        if (
            stored is None
            or stored.revoked
            or stored.expires_at < datetime.utcnow()
            or not stored.user.is_active
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
            )
        return stored.user

    def logout(self, raw_token: str | None) -> None:
        if not raw_token:
            return
        stored = self.repo.get_refresh_token(hash_refresh_token(raw_token))
        if stored is not None:
            self.repo.revoke_refresh_token(stored)
            self.repo.commit()

    def change_password(self, user_id: str, current_password: str, new_password: str) -> None:
        user = self.repo.get_user_by_id(user_id)
        if user is None:
            raise self._invalid_credentials()
        if not verify_password(user.hashed_password, current_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect"
            )
        try:
            validate_new_password(new_password, current=current_password)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
            )
        self.repo.update_password(user, hash_password(new_password))
        self.repo.revoke_refresh_tokens(user.id)
        self.repo.commit()
