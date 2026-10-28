import hashlib
import re
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

MIN_PASSWORD_LENGTH = 10
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# --- API keys de agente (SPEC-0013, P-2) ---
# Prefijo visible fijo: hace reconocible el *tipo* de credencial en logs/filtraciones sin
# exponer el secreto y permite rechazar lo mal formado (RF-003) antes de tocar la BD.
API_KEY_PREFIX = "syn_ak_"
# Cuerpo = secrets.token_urlsafe(32): 43 caracteres del alfabeto URL-safe, ~256 bits.
_API_KEY_BODY = re.compile(r"[A-Za-z0-9_-]{43}")

_hasher = PasswordHasher()


def _sha256_hex(raw: str) -> str:
    """Hash determinista para secretos de alta entropía (refresh tokens y API keys, P-3).

    Único estándar del repo para secretos no fuerza-bruteables: permite el lookup por índice
    (`WHERE hash = ?`), imposible con argon2 (sal distinta por fila). Argon2 (`hash_password`)
    queda sólo para contraseñas de baja entropía.
    """
    return hashlib.sha256(raw.encode()).hexdigest()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(hashed: str, password: str) -> bool:
    try:
        return _hasher.verify(hashed, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def normalize_email(email: str) -> str:
    """Un email es el mismo usuario sin importar espacios exteriores ni mayúsculas (RF-013)."""
    return email.strip().lower()


def validate_new_password(new: str, current: str) -> None:
    if len(new) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters long")
    if new == current:
        raise ValueError("New password must differ from the current one")


def hash_refresh_token(raw_token: str) -> str:
    return _sha256_hex(raw_token)


def generate_api_key() -> str:
    """Nueva API key de agente: prefijo reconocible + 256 bits de entropía (RF-001, P-2)."""
    return API_KEY_PREFIX + secrets.token_urlsafe(32)


def hash_api_key(raw: str) -> str:
    """Hash en reposo de una API key; mismo primitivo que los refresh tokens (P-3)."""
    return _sha256_hex(raw)


def is_well_formed_api_key(raw: str) -> bool:
    """Forma válida (prefijo + charset + longitud): rechazo barato previo a la BD (RF-003)."""
    return raw.startswith(API_KEY_PREFIX) and bool(
        _API_KEY_BODY.fullmatch(raw[len(API_KEY_PREFIX):])
    )
