"""Contenido de notas vía REST, para agentes OpenClaw (historia 0014, H-004.1: sólo lectura).

Opera sobre la base CouchDB de un único usuario a través de `VaultPort`; no conoce HTTP ni
CouchDB. Mismo patrón que `vault_service.py` (cursor opaco de paginación, `ETag` = `_rev`
entre comillas), clonado porque esta historia no reescribe ese módulo (P-1 de PLAN-0008 era
de alcance, no de integridad — ver historia.md §0). El cursor liga además a `vault_id`: una
nota vive dentro de una bóveda, un listado de bóvedas no.
"""
import base64
import binascii
import json
import uuid
from typing import NamedTuple

from app.core.errors import InvalidCursor, NoteNotFound, VaultNotFound
from app.core.ports.vault_port import VaultPort
from app.core.schemas import NoteListItem, NoteOut, NotePage
from app.core.timestamps import is_timestamp
from app.services.vault_service import is_canonical_uuid

# --- Cursor de paginación: mismo esquema que `vault_service.encode_cursor`, con `vault_id`
# como componente extra (`v`) — un cursor sólo vale para la bóveda y la lista con que se emitió.

_CURSOR_ERROR = [{"parameter": "cursor", "detail": "Invalid cursor."}]


def encode_cursor(vault_id: str, deleted: bool, created_at: str, note_id: str) -> str:
    raw = json.dumps(
        {"v": vault_id, "d": deleted, "c": created_at, "i": note_id}, separators=(",", ":"))
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


_CURSOR_MAX_LENGTH = len(encode_cursor(
    str(uuid.UUID(int=0)), False, "2000-01-01T00:00:00.000000Z", str(uuid.UUID(int=0))))


def decode_cursor(cursor: str, vault_id: str, deleted: bool) -> tuple[str, str]:
    """Devuelve `(created_at, note_id)` o lanza `InvalidCursor`.

    Sólo vale un cursor que `encode_cursor` emitió para esta bóveda y esta lista (misma
    lógica que `vault_service.decode_cursor`, PLAN-0003 §15).
    """
    if len(cursor) > _CURSOR_MAX_LENGTH:
        raise InvalidCursor("cursor longer than any emitted one", errors=_CURSOR_ERROR)
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")))
    except (UnicodeError, binascii.Error, ValueError):
        raise InvalidCursor("undecodable cursor", errors=_CURSOR_ERROR) from None
    if not (
        isinstance(payload, dict)
        and payload.get("v") == vault_id
        and payload.get("d") is deleted
        and isinstance(payload.get("c"), str)
        and isinstance(payload.get("i"), str)
    ):
        raise InvalidCursor("cursor of another list or malformed", errors=_CURSOR_ERROR)
    created_at, note_id = payload["c"], payload["i"]
    if not (
        is_timestamp(created_at)
        and is_canonical_uuid(note_id)
        and encode_cursor(vault_id, deleted, created_at, note_id) == cursor
    ):
        raise InvalidCursor("cursor not emitted by this server", errors=_CURSOR_ERROR)
    return created_at, note_id


# --- Servicio ---


class Versioned(NamedTuple):
    """Nota y su `ETag` (el `_rev` entre comillas), que la ruta pone en la cabecera."""

    note: NoteOut
    etag: str


class NoteContentService:
    """Lectura de las notas de una bóveda sobre la base de un usuario (una instancia por petición)."""

    def __init__(self, port: VaultPort, db: str):
        self._port = port
        self._db = db

    def list(self, vault_id: str, deleted: bool, limit: int, cursor: str | None) -> NotePage:
        self._check_vault(vault_id)
        after = None
        if cursor is not None:
            created_at, note_id = decode_cursor(cursor, vault_id, deleted)
            after = (created_at, _doc_id(vault_id, note_id))
        # Se pide uno de más: si llega, hay página siguiente (mismo truco que `VaultService.list`).
        docs = self._port.list_notes(self._db, vault_id, deleted, limit + 1, after)
        page = docs[:limit]
        next_cursor = None
        if len(docs) > limit:
            last = page[-1]
            next_cursor = encode_cursor(vault_id, deleted, last["created_at"], _note_id(last))
        return NotePage(items=[_to_list_item(doc) for doc in page], next_cursor=next_cursor)

    def get(self, vault_id: str, note_id: str) -> Versioned:
        self._check_vault(vault_id)
        return _versioned(self._load(vault_id, note_id, deleted=False))

    # --- Internos ---

    def _check_vault(self, vault_id: str) -> None:
        """El `vault_id` de la URL existe en esta base, en cualquier estado — una bóveda
        borrada no bloquea leer sus notas (historia §5) — si no, `VaultNotFound` (mismo
        cuerpo que `GET /vaults/{id}` de uno inexistente o ajeno)."""
        if not is_canonical_uuid(vault_id):
            raise VaultNotFound(f"vault_id is not a canonical UUID: {vault_id!r}")
        doc = self._port.get(self._db, f"vault:{vault_id}")
        if doc is None or doc.get("type") != "vault":
            raise VaultNotFound(f"vault:{vault_id} not found")

    def _load(self, vault_id: str, note_id: str, deleted: bool) -> dict:
        """La nota en el estado pedido; cualquier otra cosa es `NoteNotFound` (C-3)."""
        if not (is_canonical_uuid(vault_id) and is_canonical_uuid(note_id)):
            raise NoteNotFound(f"ids not canonical UUIDs: {vault_id!r}, {note_id!r}")
        doc_id = _doc_id(vault_id, note_id)
        doc = self._port.get(self._db, doc_id)
        if doc is None or doc.get("type") != "note" or bool(doc["deleted_at"]) is not deleted:
            raise NoteNotFound(f"{doc_id} not found (deleted={deleted})")
        return doc


def _doc_id(vault_id: str, note_id: str) -> str:
    return f"note:{vault_id}:{note_id}"


def _note_id(doc: dict) -> str:
    return doc["_id"].split(":")[2]


def _etag(doc: dict) -> str:
    return f'"{doc["_rev"]}"'


def _to_out(doc: dict) -> NoteOut:
    return NoteOut(
        id=_note_id(doc),
        vault_id=doc["vault_id"],
        path=doc["path"],
        frontmatter=doc.get("frontmatter"),
        content=doc["content"],
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
        deleted_at=doc["deleted_at"],
    )


def _to_list_item(doc: dict) -> NoteListItem:
    return NoteListItem(**_to_out(doc).model_dump(exclude={"frontmatter", "content"}), etag=_etag(doc))


def _versioned(doc: dict) -> Versioned:
    return Versioned(_to_out(doc), _etag(doc))
