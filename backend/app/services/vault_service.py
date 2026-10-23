"""Reglas de negocio de las bóvedas (SPEC-0003, PLAN-0003 §2).

Opera sobre la base CouchDB de un único usuario a través de `VaultPort`; no conoce HTTP
ni CouchDB. Lanza errores de dominio de `core/errors.py`.
"""
import base64
import binascii
import json
import unicodedata
import uuid
from collections.abc import Callable
from typing import NamedTuple

from app.core.errors import (
    InvalidCursor, PreconditionFailed, PreconditionRequired, RevisionConflict,
    VaultNameTaken, VaultNotFound,
)
from app.core.ports.vault_port import VaultPort
from app.core.schemas import VaultCreate, VaultListItem, VaultOut, VaultPage, VaultUpdate
from app.core.timestamps import is_timestamp, utc_now
from app.services.reservations import RESERVATION_LEASE, ReservationTaken, Reservations

# --- Ids ---


def is_canonical_uuid(value: str) -> bool:
    """¿`value` es un UUID en forma canónica (minúsculas, con guiones, sin envoltorio)?"""
    try:
        return str(uuid.UUID(value)) == value
    except ValueError:
        return False


# --- Cursor de paginación (RF-002, RF-003) ---
# base64url (sin relleno) de {"d": deleted, "c": created_at, "i": id}: la clave de la última
# bóveda devuelta. `d` ata el cursor a su lista (normal o papelera).

_CURSOR_ERROR = [{"parameter": "cursor", "detail": "Invalid cursor."}]


def encode_cursor(deleted: bool, created_at: str, vault_id: str) -> str:
    raw = json.dumps({"d": deleted, "c": created_at, "i": vault_id}, separators=(",", ":"))
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


# Longitud de cualquier cursor emitido: la fecha y el UUID canónico tienen ancho fijo y
# `false` es el más largo de los dos valores de `d`.
_CURSOR_MAX_LENGTH = len(encode_cursor(False, "2000-01-01T00:00:00.000000Z", str(uuid.UUID(int=0))))


def decode_cursor(cursor: str, deleted: bool) -> tuple[str, str]:
    """Devuelve `(created_at, id)` o lanza `InvalidCursor`.

    Sólo vale un cursor que `encode_cursor` emitió para esta lista (RF-003, PLAN-0003 §15):
    la longitud se comprueba antes de decodificar (nada demasiado largo o anidado llega a
    `json.loads`) y al final se exige la ida y vuelta exacta, que descarta datos añadidos,
    relleno, espacios y claves extra.
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
        and payload.get("d") is deleted
        and isinstance(payload.get("c"), str)
        and isinstance(payload.get("i"), str)
    ):
        raise InvalidCursor("cursor of another list or malformed", errors=_CURSOR_ERROR)
    created_at, vault_id = payload["c"], payload["i"]
    if not (
        is_timestamp(created_at)
        and is_canonical_uuid(vault_id)
        and encode_cursor(deleted, created_at, vault_id) == cursor
    ):
        raise InvalidCursor("cursor not emitted by this server", errors=_CURSOR_ERROR)
    return created_at, vault_id


# --- Servicio ---

# `RESERVATION_LEASE` (importado arriba) vive en `reservations.py`; se sigue exponiendo desde
# aquí porque los tests y el push de sincronización lo importan de este módulo.


class Versioned(NamedTuple):
    """Bóveda y su `ETag` (el `_rev` entre comillas), que la ruta pone en la cabecera."""

    vault: VaultOut
    etag: str


class VaultService:
    """Operaciones de bóvedas sobre la base de un usuario (una instancia por petición).

    Unicidad del nombre (RF-007, RF-021, RF-027): documento `vault-name:{name_key}` (NFKC +
    `casefold`) que apunta a la bóveda que lo usa y guarda cuándo se tomó (`reserved_at`).
    Una reserva **bloquea** si esa bóveda existe, no está borrada y tiene un nombre
    equivalente, o si todavía está dentro de su arrendamiento (`RESERVATION_LEASE`): la
    reserva se escribe antes que la bóveda, y sin el arrendamiento una escritura en curso no
    se distingue de una que falló (PLAN-0003 §12). Fuera de esos casos es huérfana y se
    reasigna, así que una escritura que falla a medias bloquea el nombre como mucho lo que
    dura el arrendamiento. La liberación es de mejor esfuerzo: sólo se intenta tras una
    escritura confirmada que deja el nombre sin usar (borrado o renombrado).
    """

    def __init__(self, port: VaultPort, db: str, clock: Callable[[], str] = utc_now):
        self._port = port
        self._db = db
        self._clock = clock
        self._reservations = Reservations(
            port, db, clock, kind="vault-name", owner_field="vault_id")

    # --- Lectura ---

    def list(self, deleted: bool, limit: int, cursor: str | None) -> VaultPage:
        after = None
        if cursor is not None:
            created_at, vault_id = decode_cursor(cursor, deleted)
            after = (created_at, _doc_id(vault_id))
        # Se pide uno de más: si llega, hay página siguiente y el cursor apunta al último
        # que se devuelve, no al sobrante.
        docs = self._port.list_page(self._db, deleted, limit + 1, after)
        page = docs[:limit]
        next_cursor = None
        if len(docs) > limit:
            last = page[-1]
            next_cursor = encode_cursor(deleted, last["created_at"], _vault_id(last))
        return VaultPage(items=[_to_list_item(doc) for doc in page], next_cursor=next_cursor)

    def get(self, vault_id: str) -> Versioned:
        return _versioned(self._load(vault_id, deleted=False))

    # --- Escritura ---

    def create(self, data: VaultCreate, owner_id: str) -> Versioned:
        vault_id = str(uuid.uuid4())
        now = self._clock()
        self.reserve(data.name, vault_id)
        doc = {
            "_id": _doc_id(vault_id),
            "type": "vault",
            "name": data.name,
            "description": data.description,
            "tags": data.tags,
            "icon": data.icon,
            "owner_id": owner_id,
            "created_at": now,
            "updated_at": now,
            "deleted_at": None,
        }
        # Si este `put` falla, la reserva queda huérfana (su bóveda no existe) y no
        # bloquea: no se libera, porque un fallo de red puede ocultar un `put` que sí entró.
        doc["_rev"] = self._port.put(self._db, doc)
        return _versioned(doc)

    def update(self, vault_id: str, data: VaultUpdate, if_match: str | None) -> Versioned:
        doc = self._load(vault_id, deleted=False)
        _check_precondition(doc, if_match)
        changes = data.model_dump(exclude_unset=True)
        old_name = doc["name"]
        # Cambiar a un nombre equivalente (mayúsculas, forma Unicode) conserva la misma
        # reserva: no choca consigo misma.
        renamed = "name" in changes and name_key(changes["name"]) != name_key(old_name)
        if renamed:
            self.reserve(changes["name"], _vault_id(doc))
        updated = {**doc, **changes, "updated_at": self._clock()}
        updated["_rev"] = self._write(updated)
        if renamed:
            self.release(old_name, _vault_id(doc))
        return _versioned(updated)

    def delete(self, vault_id: str, if_match: str | None) -> None:
        doc = self._load(vault_id, deleted=False)
        _check_precondition(doc, if_match)
        self._write({**doc, "deleted_at": self._clock()})
        self.release(doc["name"], _vault_id(doc))

    def restore(self, vault_id: str, if_match: str | None) -> Versioned:
        doc = self._load(vault_id, deleted=True)
        _check_precondition(doc, if_match)
        self.reserve(doc["name"], _vault_id(doc))
        restored = {**doc, "deleted_at": None}
        restored["_rev"] = self._write(restored)
        return _versioned(restored)

    # --- Internos ---

    def _load(self, vault_id: str, deleted: bool) -> dict:
        """La bóveda en el estado pedido; cualquier otra cosa es `VaultNotFound` (RF-014, RF-026).

        Sólo se acepta el id en forma canónica, la que devuelve la API (PLAN-0003 §15, VA-5).
        """
        if not is_canonical_uuid(vault_id):
            raise VaultNotFound(f"vault_id is not a canonical UUID: {vault_id!r}")
        doc_id = _doc_id(vault_id)
        doc = self._port.get(self._db, doc_id)
        if doc is None or doc.get("type") != "vault" or bool(doc["deleted_at"]) is not deleted:
            raise VaultNotFound(f"{doc_id} not found (deleted={deleted})")
        return doc

    def _write(self, doc: dict) -> str:
        """`put` con el `_rev` leído: si otra escritura entró entre medias, 412 (RF-010)."""
        try:
            return self._port.put(self._db, doc)
        except RevisionConflict:
            raise PreconditionFailed(f"{doc['_id']} changed before the write") from None

    def _holder(self, reservation: dict, name: str) -> bool:
        """¿Alguna hoja viva de la bóveda de la reserva está activa y usa un nombre equivalente?

        Se miran **todas** las hojas, no sólo la ganadora (SPEC-0005 RF-008, PLAN-0005 P-4):
        una rama perdedora llegada por la sincronización puede ganar al resolverse el
        conflicto, y su nombre debe seguir reservado. Sin conflictos hay una sola hoja.
        """
        key = name_key(name)
        return any(
            leaf.get("type") == "vault"
            and not leaf.get("deleted_at")
            and name_key(leaf["name"]) == key
            for leaf in self._port.leaves(self._db, _doc_id(reservation["vault_id"]))
        )

    def _leased(self, reservation: dict) -> bool:
        """¿La reserva sigue dentro de su arrendamiento? (puede haber una escritura en curso)."""
        return self._reservations.leased(reservation)

    # --- Reservas de nombre (públicas: el push de sincronización usa las mismas, SPEC-0005 RF-008) ---
    # El algoritmo vive en `reservations.py` (lo comparte con las rutas de nota, SPEC-0008);
    # aquí sólo se fija la clave, el predicado de uso (`_holder`) y el error de dominio.

    def reserve(self, name: str, vault_id: str) -> None:
        """Escribe `vault-name:{clave}` para `vault_id` o lanza `VaultNameTaken` (RF-007, RF-021)."""
        try:
            self._reservations.reserve(
                _name_key(name), vault_id, lambda reservation: self._holder(reservation, name))
        except ReservationTaken as taken:
            raise VaultNameTaken(str(taken)) from None

    def release(self, name: str, vault_id: str) -> None:
        """Borra la reserva de `vault_id` si ya no la usa; mejor esfuerzo (ver `Reservations.release`)."""
        self._reservations.release(
            _name_key(name), vault_id, lambda reservation: self._holder(reservation, name))


def _doc_id(vault_id: str) -> str:
    return f"vault:{vault_id}"


def _vault_id(doc: dict) -> str:
    return doc["_id"].removeprefix("vault:")


def name_key(name: str) -> str:
    """Forma de `name` que decide la unicidad: NFKC + `casefold` (SPEC-0003 §3, enmienda 1).

    Une los nombres que una persona lee como iguales (mayúsculas, ß/SS, composiciones
    NFC/NFD, ligaduras, anchura completa); el nombre se guarda tal como llega.
    """
    return unicodedata.normalize("NFKC", name).casefold()


def _name_key(name: str) -> str:
    return f"vault-name:{name_key(name)}"


def _etag(doc: dict) -> str:
    return f'"{doc["_rev"]}"'


def _check_precondition(doc: dict, if_match: str | None) -> None:
    """`If-Match` obligatorio e igual al `ETag` vigente (RF-010)."""
    if if_match is None:
        raise PreconditionRequired()
    if if_match != _etag(doc):
        raise PreconditionFailed(f"If-Match {if_match} != {_etag(doc)}")


def _to_out(doc: dict) -> VaultOut:
    return VaultOut(
        id=_vault_id(doc),
        name=doc["name"],
        description=doc["description"],
        tags=doc["tags"],
        # `.get`: las bóvedas anteriores a SPEC-0009 no tienen la clave (ausente = null).
        icon=doc.get("icon"),
        owner_id=doc["owner_id"],
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
        deleted_at=doc["deleted_at"],
    )


def _to_list_item(doc: dict) -> VaultListItem:
    return VaultListItem(**_to_out(doc).model_dump(), etag=_etag(doc))


def _versioned(doc: dict) -> Versioned:
    return Versioned(_to_out(doc), _etag(doc))
