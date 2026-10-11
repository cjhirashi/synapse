import pytest

from app.core.security import (
    hash_password,
    hash_refresh_token,
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
    with pytest.raises(ValueError, match="distinta"):
        validate_new_password("admin1234!!", current="admin1234!!")


def test_rf_010_refresh_hash_is_deterministic_sha256():
    h = hash_refresh_token("abc")
    assert h == hash_refresh_token("abc")
    assert len(h) == 64
    assert h != "abc"
