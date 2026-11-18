import secrets
import uuid
from datetime import datetime, timedelta

import jwt
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.errors import (
    EmailTaken,
    InvalidCredentials,
    InvalidRefreshToken,
    PasswordPolicyViolation,
    ProfilePhotoInvalidType,
    ProfilePhotoNotFound,
    ProfilePhotoTooLarge,
    WrongCurrentPassword,
)
from app.core.file_safety import JPEG, PNG, WEBP, sniff_content_type
from app.core.limits import UserLimits, for_role
from app.core.models.user import User
from app.core.ports.auth_port import AuthPort
from app.core.ports.couchdb_port import CouchDBPort
from app.core.ports.object_storage_port import ObjectStoragePort
from app.core.security import (
    DEFAULT_USER_PASSWORD,
    hash_password,
    hash_refresh_token,
    normalize_email,
    validate_new_password,
    verify_password,
)

ADMIN_ROLE_ID = "admin-role-id"
GUEST_ROLE_ID = "guest-role-id"
SUPER_ADMIN_ROLE_ID = "super-admin-role-id"
ROLE_IDS = {"super_admin": SUPER_ADMIN_ROLE_ID, "admin": ADMIN_ROLE_ID, "guest": GUEST_ROLE_ID}

ACCESS_TOKEN_TTL = timedelta(hours=24)
REFRESH_TOKEN_TTL = timedelta(days=30)

# Límites para avatar (H-028). Solo formatos de imagen de foto de perfil: GIF y SVG se
# admiten como archivos en /files, pero no como avatar.
AVATAR_MAX_SIZE = 2 * 1024 * 1024  # 2 MB
AVATAR_TYPES = {PNG, JPEG, WEBP}

# Se verifica contra este hash cuando el usuario no existe o está inactivo, para que el
# login tarde lo mismo en todos los casos y no permita enumerar emails (RF-005).
_DUMMY_HASH = hash_password(secrets.token_urlsafe(32))


class AuthService:
    def __init__(self, repo: AuthPort, couchdb: CouchDBPort, object_storage: ObjectStoragePort):
        self.repo = repo
        self.couchdb = couchdb
        self.object_storage = object_storage

    def _provision_user(
        self, email: str, password: str, role_id: str, must_change_password: bool, limits: UserLimits | None = None
    ) -> User:
        """Inserta el usuario y su base CouchDB; si algo falla, no queda nada en PostgreSQL."""
        email = normalize_email(email)
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
                limits=limits,
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

    def create_user(self, email: str, role: str, limits: UserLimits) -> User:
        """Cuenta nueva con la contraseña base (H-060): el primer ingreso obliga a cambiarla. Solo el invitado lleva
        límites; admin y super admin no los tienen aunque se envíen."""
        if self.repo.get_user_by_email(normalize_email(email)):
            raise EmailTaken()
        try:
            return self._provision_user(
                email, DEFAULT_USER_PASSWORD, ROLE_IDS[role], must_change_password=True,
                limits=for_role(role, limits))
        except IntegrityError as exc:
            # Otra petición insertó el mismo email entre la comprobación y el INSERT.
            raise EmailTaken() from exc

    def login(self, email: str, password: str) -> User:
        user = self.repo.get_user_by_email(normalize_email(email))
        if not user or not user.is_active:
            verify_password(_DUMMY_HASH, password)
            raise InvalidCredentials()
        if not verify_password(user.hashed_password, password):
            raise InvalidCredentials()  # mismo error que sin usuario (RF-007 de SPEC-0004)
        return user

    def create_token(self, user: User) -> str:
        payload = {
            "sub": user.id,
            "role": user.role.name,
            "exp": datetime.utcnow() + ACCESS_TOKEN_TTL,
            "ver": user.token_version,
        }
        return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")

    def create_refresh_token(self, user: User) -> str:
        raw = secrets.token_urlsafe(64)
        self.repo.save_refresh_token(
            user.id, hash_refresh_token(raw), datetime.utcnow() + REFRESH_TOKEN_TTL
        )
        self.repo.commit()
        return raw

    def refresh(self, raw_token: str | None) -> tuple[User, str]:
        """Rota el refresh token: revoca el usado y devuelve el usuario y uno nuevo (RF-010)."""
        stored = self.repo.get_refresh_token(hash_refresh_token(raw_token)) if raw_token else None
        if stored is not None and stored.rotated:
            # Reutilización de un token ya rotado: posible robo, se cierra todo (RF-022).
            self.repo.revoke_refresh_tokens(stored.user_id)
            self.repo.commit()
        if (
            stored is None
            or stored.revoked
            or stored.expires_at < datetime.utcnow()
            or not stored.user.is_active
        ):
            raise InvalidRefreshToken()
        if not self.repo.claim_refresh_token(stored):
            # Otra petición lo rotó entre la lectura y ahora: equivale a reutilizarlo (RF-022).
            self.repo.revoke_refresh_tokens(stored.user_id)
            self.repo.commit()
            raise InvalidRefreshToken("refresh token claimed concurrently")
        return stored.user, self.create_refresh_token(stored.user)

    def logout(self, raw_token: str | None) -> None:
        if not raw_token:
            return
        stored = self.repo.get_refresh_token(hash_refresh_token(raw_token))
        if stored is not None:
            self.repo.revoke_refresh_token(stored)
            self.repo.commit()

    def change_password(self, user_id: str, current_password: str, new_password: str) -> User:
        user = self.repo.get_user_by_id(user_id)
        if user is None:
            raise InvalidCredentials()
        if not verify_password(user.hashed_password, current_password):
            raise WrongCurrentPassword()
        try:
            validate_new_password(new_password, current=current_password)
        except ValueError as exc:
            # Mismo formato que un 422 de pydantic: el fallo señala el campo del cuerpo.
            raise PasswordPolicyViolation(
                errors=[{"pointer": "#/new_password", "detail": str(exc)}]
            ) from exc
        self.repo.update_password(user, hash_password(new_password))
        self.repo.revoke_refresh_tokens(user.id)
        self.repo.commit()
        return user

    def update_display_name(self, user_id: str, display_name: str | None) -> User:
        """Guarda display_name del usuario (H-028).

        El recorte de espacios y el tope de 80 caracteres los aplica el esquema
        (`UpdateDisplayNameRequest`) antes de llegar aquí; el servicio sólo convierte "" en NULL.
        """
        user = self.repo.get_user_by_id(user_id)
        if user is None:
            raise InvalidCredentials()

        user.display_name = display_name or None
        self.repo.commit()
        return user

    def set_avatar(self, user_id: str, data: bytes) -> User:
        """Guarda la foto de avatar del usuario en el almacén (H-028).

        Las dos validaciones van aquí, en un único punto, para que ninguna ruta pueda saltárselas:
        - Tamaño primero: es barato y evita husmear o subir un archivo que ya sabemos inválido.
        - Tipo por CONTENIDO (firma de bytes), nunca por el nombre ni el Content-Type del cliente:
          un texto renombrado a `.png` se rechaza igual.
        `avatar_version` sube en cada subida para que el navegador no reutilice la foto anterior.
        """
        user = self.repo.get_user_by_id(user_id)
        if user is None:
            raise InvalidCredentials()

        if len(data) > AVATAR_MAX_SIZE:
            raise ProfilePhotoTooLarge()
        content_type = sniff_content_type(data)
        if content_type not in AVATAR_TYPES:
            raise ProfilePhotoInvalidType()

        # Guardar en el almacén antes de tocar la BD: si falla, los metadatos siguen como estaban.
        key = f"users/{user_id}/avatar"
        self.object_storage.put_object(key, data, content_type)

        user.avatar_content_type = content_type
        user.avatar_version += 1
        self.repo.commit()
        return user

    def clear_avatar(self, user_id: str) -> User:
        """Borra la foto de avatar del usuario (H-028).

        Borra primero el objeto y sólo después limpia los metadatos. Si el almacén falla, la
        excepción sube (503) y la BD sigue diciendo "hay foto": así nunca queda un objeto huérfano
        con la BD ya en "sin foto", y el usuario puede reintentar. No se silencia ningún error.
        """
        user = self.repo.get_user_by_id(user_id)
        if user is None:
            raise InvalidCredentials()

        if user.avatar_content_type is not None:
            self.object_storage.delete_object(f"users/{user_id}/avatar")

        user.avatar_content_type = None
        # avatar_version NO se resetea: si se vuelve a subir, la URL cambia y el caché no sirve la vieja.
        self.repo.commit()
        return user

    def get_avatar(self, user_id: str) -> tuple[bytes, str]:
        """Descarga la foto de avatar del usuario (H-028).

        Devuelve (bytes, content_type). Lanza ProfilePhotoNotFound si el usuario no tiene foto.
        """
        user = self.repo.get_user_by_id(user_id)
        if user is None:
            raise InvalidCredentials()

        if user.avatar_content_type is None:
            raise ProfilePhotoNotFound()

        key = f"users/{user_id}/avatar"
        data = self.object_storage.get_object(key)
        return data, user.avatar_content_type
