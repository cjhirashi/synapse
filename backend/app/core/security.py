import hashlib

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

MIN_PASSWORD_LENGTH = 10

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(hashed: str, password: str) -> bool:
    try:
        return _hasher.verify(hashed, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def validate_new_password(new: str, current: str) -> None:
    if len(new) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"La contraseña debe tener al menos {MIN_PASSWORD_LENGTH} caracteres")
    if new == current:
        raise ValueError("La nueva contraseña debe ser distinta de la actual")


def hash_refresh_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode()).hexdigest()
