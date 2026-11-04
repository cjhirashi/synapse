"""Contenido de notas vía REST, para agentes OpenClaw (historia 0014: H-004.1 lectura,
H-004.2 escritura).

Opera sobre la base CouchDB de un único usuario a través de `VaultPort`; no conoce HTTP ni
CouchDB. Mismo patrón que `vault_service.py` (cursor opaco de paginación, `ETag` = `_rev`
entre comillas), clonado porque esta historia no reescribe ese módulo (P-1 de PLAN-0008 era
de alcance, no de integridad — ver historia.md §0). El cursor liga además a `vault_id`: una
nota vive dentro de una bóveda, un listado de bóvedas no.

La escritura (`create`/`update`/`delete`/`restore`) reusa sin reescribir:
- `core/note_rules.py` (`check_path`, `check_content`, `check_frontmatter`) para validar — el
  mismo código que valida el push de `/sync` (C-5, C-10): un solo vocabulario de rechazo.
- `services/note_service.py` (`NoteService.reserve_path`/`release_path`) para la unicidad de
  `path` por bóveda — el mismo mecanismo de `reservations.py` que usan las bóvedas.
Exige la bóveda **activa** (no sólo existente) para escribir, igual que
`sync_push.py::_check_vault_is_active` (RF-004/RF-014 de 0008): una bóveda borrada congela sus
notas también por REST — ningún atajo nuevo (C-10).
"""
import base64
import binascii
import json
import uuid
from typing import NamedTuple

from app.core.errors import (
    InvalidCursor, NoteNotFound, NotePathTaken as NotePathTakenProblem, PreconditionFailed,
    PreconditionRequired, RevisionConflict, ValidationFailed, VaultNotFound,
)
from app.core.etag import etag_matches
from app.core.wikilink_rewrite import Rename
from app.core.index_body import render_body
from app.core.index_rules import ancestor_folders, changed_keys, check_op, folder_of, index_path_for, is_index_path
from app.core.note_dates import stamp_dates, today_cdmx
from app.core.note_rules import check_content, check_frontmatter, check_path, path_key
from app.core.ports.vault_port import VaultPort
from app.core.schemas import NoteCreate, NoteListItem, NoteOut, NotePage, NoteUpdate
from app.core.timestamps import is_timestamp, utc_now
from app.services.note_service import NotePathTaken, NoteService
from app.services.vault_service import is_canonical_uuid
from app.services.wikilink_rewrite_service import RewriteReport, WikilinkRewriteService

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
    rewrite: RewriteReport | None = None  # H-039: solo en un PATCH que cambió `path`


class NoteContentService:
    """Notas de una bóveda sobre la base de un usuario (una instancia por petición)."""

    def __init__(self, port: VaultPort, db: str, auto_indexes: bool = True):
        self._port = port
        self._db = db
        self._notes = NoteService(port, db)
        self._auto_indexes = auto_indexes

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
        doc = self._load(vault_id, note_id, deleted=False)
        if is_index_path(doc["path"]):
            doc = {**doc, "content": self._index_body(vault_id, doc["path"])}  # H-031: el cuerpo no se guarda, se genera
        return _versioned(doc)

    # --- Escritura (H-004.2) ---

    def create(self, vault_id: str, data: NoteCreate) -> Versioned:
        """C-4: crea la nota, reserva `path` y devuelve 201 + `ETag`.

        Igual que el push (`sync_push.py::_check_vault_is_active`), exige la bóveda activa,
        no sólo existente: una bóveda borrada congela la escritura de sus notas (C-10).
        """
        if not is_canonical_uuid(vault_id):
            raise VaultNotFound(f"vault_id is not a canonical UUID: {vault_id!r}")
        self._check_vault_active(vault_id)
        fields = data.model_dump(exclude_unset=True)
        _check_rules(
            data.path, data.content, fields.get("frontmatter"), frontmatter_set="frontmatter" in fields)
        if (code := check_op("create_user", data.path)) is not None:
            raise _field_error("path", code)
        note_id = str(uuid.uuid4())
        doc_id = _doc_id(vault_id, note_id)
        now = utc_now()
        self._reserve(doc_id, data.path)
        doc = {
            "_id": doc_id,
            "type": "note",
            "vault_id": vault_id,
            "path": data.path,
            "content": data.content,
            "created_at": now,
            "updated_at": now,
            "deleted_at": None,
        }
        # El frontmatter siempre lleva las fechas de la nota (H-029): las sella el servidor, con la fecha
        # de CDMX, porque quien escribe por REST es un agente sin reloj de la app.
        doc["frontmatter"] = stamp_dates(fields.get("frontmatter"), today_cdmx(), now)
        # Si este `put` falla, la reserva queda huérfana (su nota no existe) y no se libera:
        # un fallo de red puede ocultar un `put` que sí entró (mismo riesgo que `VaultService.create`).
        doc["_rev"] = self._port.put(self._db, doc)
        if self._auto_indexes:
            self._ensure_indexes(vault_id, data.path)
        return _versioned(doc)

    def update(self, vault_id: str, note_id: str, data: NoteUpdate, if_match: str | None) -> Versioned:
        """C-7/C-8: `If-Match` obligatorio; si cambia `path`, libera la reserva vieja y
        reserva la nueva (reuso de `NoteService.reserve_path`/`release_path`)."""
        self._check_vault(vault_id)
        doc = self._load(vault_id, note_id, deleted=False)
        _check_precondition(doc, if_match)
        changes = data.model_dump(exclude_unset=True)
        # Sólo se revalida lo que el cuerpo trae: lo que no cambia ya era válido (se guardó
        # como tal) y revalidarlo sería repetir trabajo sin más garantía (C-5).
        if "path" in changes:
            if (code := check_path(changes["path"])) is not None:
                raise _field_error("path", code)
        if "content" in changes:
            if (code := check_content(changes["content"])) is not None:
                raise _field_error("content", code)
        if "frontmatter" in changes and changes["frontmatter"] is not None:
            if (code := check_frontmatter(changes["frontmatter"])) is not None:
                raise _field_error("frontmatter", code)
        old_path = doc["path"]
        renamed = "path" in changes and changes["path"] != old_path
        # `frontmatter: null` explícito borra las propiedades libres, pero las fechas de la nota se conservan
        # y se actualizan (H-029): cada escritura de un agente refresca `fecha_actualizacion`.
        old = doc.get("frontmatter") or {}
        base = dict(changes.get("frontmatter") or {}) if "frontmatter" in changes else dict(old)
        if "fecha_creacion" not in base and "fecha_creacion" in old:
            base["fecha_creacion"] = old["fecha_creacion"]  # reemplazar las propiedades no borra la fecha de creación
        # H-031: un INDICE no se renombra ni se edita salvo su `descripcion`; ninguna otra nota toma su nombre.
        # Se comprueba antes de reservar la ruta nueva para no dejar una reserva huérfana.
        if renamed and (code := check_op("rename_or_move", old_path, to=changes["path"])) is not None:
            raise _field_error("path", code)
        content_changed = "content" in changes and changes["content"] != doc.get("content")
        if (code := check_op("edit", old_path, changed=changed_keys(old, base), content_changed=content_changed)) is not None:
            raise _field_error("content" if code == "index-readonly:content" else "frontmatter", code)
        if renamed:
            self._reserve(doc["_id"], changes["path"])
        updated = {**doc, **changes, "updated_at": utc_now()}
        updated["frontmatter"] = stamp_dates(base, today_cdmx(), doc.get("created_at"))
        updated["_rev"] = self._write(updated)
        if renamed:
            self._release(doc["_id"], old_path)
            if self._auto_indexes:
                self._ensure_indexes(vault_id, changes["path"])
            # H-039: los wikilinks de las demás notas (y los de la propia) siguen a la nota movida.
            report = WikilinkRewriteService(self._port, self._db).rewrite(
                vault_id, {doc["_id"]: Rename(old_path, changes["path"])})
            # La propia nota pudo reescribirse (enlace a sí misma): se devuelve su versión vigente.
            current = self._port.get(self._db, doc["_id"]) or updated
            return _versioned(current)._replace(rewrite=report)
        return _versioned(updated)

    def delete(self, vault_id: str, note_id: str, if_match: str | None) -> None:
        """C-9: soft-delete (`deleted_at`, nunca borra el documento) y libera `path`.

        H-031: un INDICE sólo se borra si no queda ninguna otra nota viva bajo su carpeta; el de la raíz, nunca.
        """
        self._check_vault(vault_id)
        doc = self._load(vault_id, note_id, deleted=False)
        _check_precondition(doc, if_match)
        if is_index_path(doc["path"]):
            below = self._count_live_below(vault_id, doc["path"], doc["_id"])
            if (code := check_op("delete", doc["path"], other_live_below_after=below)) is not None:
                raise _field_error("path", code)
        self._write({**doc, "deleted_at": utc_now()})
        self._release(doc["_id"], doc["path"])

    def restore(self, vault_id: str, note_id: str, if_match: str | None) -> Versioned:
        """Restaura una nota de la papelera: vuelve a reservar `path` (mismo patrón que
        `VaultService.restore`; C-6 si otra nota viva ya lo usa)."""
        self._check_vault(vault_id)
        doc = self._load(vault_id, note_id, deleted=True)
        _check_precondition(doc, if_match)
        self._reserve(doc["_id"], doc["path"])
        restored = {**doc, "deleted_at": None}
        restored["_rev"] = self._write(restored)
        if self._auto_indexes:
            self._ensure_indexes(vault_id, doc["path"])
        return _versioned(restored)

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

    def check_vault_active(self, vault_id: str) -> None:
        self._check_vault_active(vault_id)

    def ensure_indexes(self, vault_id: str, path: str) -> None:
        self._ensure_indexes(vault_id, path)

    def _check_vault_active(self, vault_id: str) -> None:
        """Como `_check_vault`, pero además exige que la bóveda no esté en la papelera
        (mismo chequeo que `sync_push.py::_check_vault_is_active`, C-10)."""
        doc = self._port.get(self._db, f"vault:{vault_id}")
        if doc is None or doc.get("type") != "vault" or doc.get("deleted_at"):
            raise VaultNotFound(f"vault:{vault_id} not found or not active")

    def _load(self, vault_id: str, note_id: str, deleted: bool) -> dict:
        """La nota en el estado pedido; cualquier otra cosa es `NoteNotFound` (C-3)."""
        if not (is_canonical_uuid(vault_id) and is_canonical_uuid(note_id)):
            raise NoteNotFound(f"ids not canonical UUIDs: {vault_id!r}, {note_id!r}")
        doc_id = _doc_id(vault_id, note_id)
        doc = self._port.get(self._db, doc_id)
        if doc is None or doc.get("type") != "note" or bool(doc["deleted_at"]) is not deleted:
            raise NoteNotFound(f"{doc_id} not found (deleted={deleted})")
        return doc

    def _write(self, doc: dict) -> str:
        """`put` con el `_rev` leído: si otra escritura entró entre medias, 412 (C-8)."""
        try:
            return self._port.put(self._db, doc)
        except RevisionConflict:
            raise PreconditionFailed(f"{doc['_id']} changed before the write") from None

    def _reserve(self, note_id: str, path: str) -> None:
        """Reserva `path` para `note_id` o lanza `NotePathTakenProblem` (C-6)."""
        try:
            self._notes.reserve_path(note_id, path)
        except NotePathTaken as taken:
            raise NotePathTakenProblem(str(taken)) from None

    def _release(self, note_id: str, path: str) -> None:
        self._notes.release_path(note_id, path)

    def _index_body(self, vault_id: str, index_path: str) -> str:
        """Cuerpo del INDICE con las cinco columnas generales, desde las notas vivas de la bóveda."""
        vault = self._port.get(self._db, f"vault:{vault_id}")
        notes, after = [], None
        while True:
            page = self._port.list_notes(self._db, vault_id, False, 100, after)
            notes += [{"path": d["path"], "frontmatter": d.get("frontmatter")} for d in page if not d.get("deleted_at")]
            if len(page) < 100:
                break
            after = (page[-1]["created_at"], page[-1]["_id"])
        return render_body(vault["name"], folder_of(index_path), notes)

    def _count_live_below(self, vault_id: str, index_path: str, index_doc_id: str) -> int:
        """Notas vivas de la bóveda por debajo de la carpeta del INDICE, sin contar el propio INDICE
        (en la raíz, todas las demás)."""
        folder = folder_of(index_path)
        prefix = path_key(folder) + "/" if folder else ""
        count, after = 0, None
        while True:
            page = self._port.list_notes(self._db, vault_id, False, 100, after)
            count += sum(
                1 for doc in page
                if doc["_id"] != index_doc_id and not doc.get("deleted_at") and path_key(doc["path"]).startswith(prefix))
            if len(page) < 100:
                return count
            after = (page[-1]["created_at"], page[-1]["_id"])

    def _ensure_indexes(self, vault_id: str, path: str) -> None:
        """Crea el INDICE de cada carpeta de `path` (y el de la raíz) que aún no exista."""
        for folder in ancestor_folders(path):
            index_path = index_path_for(folder)
            doc_id = _doc_id(vault_id, str(uuid.uuid4()))
            try:
                self._notes.reserve_path(doc_id, index_path)
            except NotePathTaken:
                continue  # ya existe
            now = utc_now()
            doc = {
                "_id": doc_id, "type": "note", "vault_id": vault_id, "path": index_path, "content": "",
                "frontmatter": stamp_dates({}, today_cdmx(), now),
                "created_at": now, "updated_at": now, "deleted_at": None,
            }
            self._port.put(self._db, doc)


def _doc_id(vault_id: str, note_id: str) -> str:
    return f"note:{vault_id}:{note_id}"


def _note_id(doc: dict) -> str:
    return doc["_id"].split(":")[2]


def _etag(doc: dict) -> str:
    return f'"{doc["_rev"]}"'


def _field_error(field: str, code: str) -> ValidationFailed:
    """422 de dominio para `code` (p. ej. `validation-error:path`, `not-normalized:path`):
    el mismo código de rechazo que el push de `/sync` usa en `reason` (C-5, C-10). `code` es
    texto fijo del catálogo de reglas, nunca el valor enviado por el cliente (RF-011 de 0004)."""
    return ValidationFailed(errors=[{"pointer": f"#/{field}", "detail": code}])


def _check_rules(path: object, content: object, frontmatter: object, *, frontmatter_set: bool) -> None:
    """`check_path`/`check_content`/`check_frontmatter` de `core/note_rules.py`, el mismo
    código que valida el push (C-5, C-10): un solo vocabulario de rechazo en los dos canales.

    `frontmatter` sólo se comprueba si el cuerpo lo trajo (es opcional, como en el documento
    de nota); `None` explícito (borrarlo) no se valida, igual que el push lo admite ausente.
    """
    if (code := check_path(path)) is not None:
        raise _field_error("path", code)
    if (code := check_content(content)) is not None:
        raise _field_error("content", code)
    if frontmatter_set and frontmatter is not None:
        if (code := check_frontmatter(frontmatter)) is not None:
            raise _field_error("frontmatter", code)


def _check_precondition(doc: dict, if_match: str | None) -> None:
    """`If-Match` obligatorio e igual al `ETag` vigente (C-7/C-8).

    Acepta `W/"..."` (débil, por intermediarios que lo comprimen).
    """
    if if_match is None:
        raise PreconditionRequired()
    rev = doc["_rev"]
    if not etag_matches(if_match, rev):
        raise PreconditionFailed(f"If-Match {if_match} != {_etag(doc)}")


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
    return NoteListItem(**_to_out(doc).model_dump(exclude={"content"}), etag=_etag(doc))


def _versioned(doc: dict) -> Versioned:
    return Versioned(_to_out(doc), _etag(doc))
