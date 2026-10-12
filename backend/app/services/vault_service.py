"""Reglas de negocio de las bóvedas (SPEC-0003, PLAN-0003 §2).

Opera sobre la base CouchDB de un único usuario a través de `VaultPort`; no conoce HTTP
ni CouchDB. Lanza errores de dominio de `core/errors.py`.
"""
import base64
import binascii
import json

from app.core.errors import InvalidCursor

# --- Cursor de paginación (RF-002, RF-003) ---
# base64url (sin relleno) de {"d": deleted, "c": created_at, "i": id}: la clave de la última
# bóveda devuelta. `d` ata el cursor a su lista (normal o papelera).

_CURSOR_ERROR = [{"parameter": "cursor", "detail": "Invalid cursor."}]


def encode_cursor(deleted: bool, created_at: str, vault_id: str) -> str:
    raw = json.dumps({"d": deleted, "c": created_at, "i": vault_id}, separators=(",", ":"))
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def decode_cursor(cursor: str, deleted: bool) -> tuple[str, str]:
    """Devuelve `(created_at, id)` o lanza `InvalidCursor` si no es de esta lista."""
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")))
    except (UnicodeError, binascii.Error, ValueError):
        raise InvalidCursor("undecodable cursor", errors=_CURSOR_ERROR) from None
    if not (
        isinstance(payload, dict)
        and payload.get("d") is deleted
        and isinstance(payload.get("c"), str)
        and isinstance(payload.get("i"), str)
    ):
        raise InvalidCursor("cursor of another list or malformed", errors=_CURSOR_ERROR)
    return payload["c"], payload["i"]
