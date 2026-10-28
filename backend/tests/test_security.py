import re

import pytest

from app.core.security import (
    API_KEY_PREFIX,
    generate_api_key,
    hash_api_key,
    hash_password,
    hash_refresh_token,
    is_well_formed_api_key,
    validate_new_password,
    verify_password,
)


def test_rf_003_hash_is_argon2id_and_not_plaintext():
    hashed = hash_password("admin1234")
    assert hashed.startswith("$argon2id$")
    assert "admin1234" not in hashed


def test_rf_003_verify_password():
    hashed = hash_password("correct-horse")
    assert verify_password(hashed, "correct-horse") is True
    assert verify_password(hashed, "wrong") is False


def test_rf_003_hash_is_salted():
    assert hash_password("same-password") != hash_password("same-password")


def test_rf_018_policy_accepts_valid_password():
    validate_new_password("a-long-enough-pass", current="admin1234")


def test_rf_018_policy_rejects_short_password():
    with pytest.raises(ValueError, match="10"):
        validate_new_password("short", current="admin1234")


def test_rf_018_policy_rejects_same_as_current():
    with pytest.raises(ValueError, match="differ"):
        validate_new_password("admin1234!!", current="admin1234!!")


def test_rf_010_refresh_hash_is_deterministic_sha256():
    h = hash_refresh_token("abc")
    assert h == hash_refresh_token("abc")
    assert len(h) == 64
    assert h != "abc"


# --- Formato y hash de las API keys de agente (SPEC-0013 RF-001/RF-003, P-2/P-3) ---

def test_rf_001_generate_api_key_has_prefix_and_entropy():
    key = generate_api_key()
    assert key.startswith(API_KEY_PREFIX)
    body = key[len(API_KEY_PREFIX):]
    # secrets.token_urlsafe(32) → 43 caracteres del alfabeto URL-safe, sin relleno.
    assert re.fullmatch(r"[A-Za-z0-9_-]{43}", body)
    # Aleatoria: dos llamadas no coinciden (256 bits de entropía, P-2).
    assert generate_api_key() != generate_api_key()


def test_rf_001_hash_api_key_is_deterministic_sha256_not_plaintext():
    raw = generate_api_key()
    h = hash_api_key(raw)
    assert h == hash_api_key(raw)        # determinista → permite lookup indexado (P-3)
    assert len(h) == 64 and re.fullmatch(r"[0-9a-f]{64}", h)
    assert h != raw and raw not in h     # el plano nunca es el hash (P4/RNF-002)
    # Mismo primitivo SHA-256 que los refresh tokens (P-3): no hay un segundo estándar.
    assert h == hash_refresh_token(raw)


def test_rf_003_is_well_formed_accepts_generated_key():
    assert is_well_formed_api_key(generate_api_key()) is True


@pytest.mark.parametrize("bad", [
    "",                                    # vacío
    "nope_" + "a" * 43,                    # prefijo incorrecto
    API_KEY_PREFIX,                        # sólo prefijo, sin cuerpo
    API_KEY_PREFIX + "a" * 42,             # cuerpo demasiado corto
    API_KEY_PREFIX + "a" * 44,             # cuerpo demasiado largo
    API_KEY_PREFIX + "!" * 43,             # charset inválido
    API_KEY_PREFIX + "a" * 43 + " ",       # espacio al final
])
def test_rf_003_is_well_formed_rejects_malformed(bad):
    # Rechazo barato por forma, antes de tocar la BD (RF-003).
    assert is_well_formed_api_key(bad) is False
