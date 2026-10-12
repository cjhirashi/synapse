"""Reglas de `VaultService` (SPEC-0003) con un doble en memoria de `VaultPort`.

Zona de coordinación: sin CouchDB ni HTTP.
"""
import base64
import json

import pytest

from app.core.errors import InvalidCursor
from app.services.vault_service import decode_cursor, encode_cursor

CURSOR_ERROR = [{"parameter": "cursor", "detail": "Invalid cursor."}]


def _raw_cursor(payload) -> str:
    return base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")


# --- Cursor (RF-002, RF-003) ---

@pytest.mark.parametrize("deleted", [False, True])
def test_rf_002_cursor_round_trip(deleted):
    key = ("2026-10-12T10:00:00.000000Z", "0b8e2f4c-7b9d-4c2a-9a51-3f1e2d4c5b6a")
    assert decode_cursor(encode_cursor(deleted, *key), deleted) == key


def test_rf_002_cursor_is_opaque_url_safe_text():
    cursor = encode_cursor(False, "2026-10-12T10:00:00.000000Z", "id")
    assert set(cursor) <= set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")


@pytest.mark.parametrize(
    "cursor",
    [
        "%%%",                                   # no es base64url
        "bm90LWpzb24",                           # base64 de texto que no es JSON
        _raw_cursor([1, 2, 3]),                  # JSON que no es objeto
        _raw_cursor({"d": False, "c": "x"}),     # falta una clave
        _raw_cursor({"d": "no", "c": "x", "i": "y"}),  # tipos incorrectos
        _raw_cursor({"d": False, "c": 1, "i": "y"}),
    ],
)
def test_rf_003_unreadable_cursor_is_invalid(cursor):
    with pytest.raises(InvalidCursor) as exc:
        decode_cursor(cursor, False)
    assert exc.value.errors == CURSOR_ERROR


def test_rf_003_cursor_from_the_other_list_is_invalid():
    trash_cursor = encode_cursor(True, "2026-10-12T10:00:00.000000Z", "id")
    with pytest.raises(InvalidCursor) as exc:
        decode_cursor(trash_cursor, False)
    assert exc.value.errors == CURSOR_ERROR
