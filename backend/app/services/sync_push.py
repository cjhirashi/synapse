"""Push validado de la sincronización: `_bulk_docs` con `new_edits:false` (SPEC-0005 RF-005…RF-008,
RF-011; SPEC-0008 RF-004, RF-005; PLAN-0005 §2.3, PLAN-0008 §2.3).

Cada revisión del lote se acepta o se rechaza con `{"id", "rev", "error": "forbidden",
"reason": "<código>"}`; PouchDB trata `forbidden` como *denied*: avisa, no reintenta y sigue
con el resto (RF-006). Las aceptadas se escriben juntas en una sola llamada.

Orden de las comprobaciones por documento (la primera que falla da el código):
1. id `vault:{uuid}` o `note:{uuid}:{uuid}` canónico → si no, `invalid-id` (RF-007);
   después, `_rev` y `_revisions` bien formados (los pasos 2 y 3 dependen de ellos);
   superada la pasada de identidad, las bóvedas se procesan antes que las notas;
2. ya almacenada → aceptada sin tocar nada (reenvío de un lote cortado);
3. lápida → sólo si cierra una rama y queda otra hoja viva (`delete-not-allowed`);
4. forma, 5. campos sin normalizar, 6. reglas del servidor (para una nota, 6c: su bóveda
   existe y está activa, `vault-not-found`; también en sus lápidas);
7. reserva del nombre o de la ruta (`vault-name-taken`, `note-path-taken`).
Luego 8. escritura y 9. liberación de los nombres y rutas que ya no usa ninguna hoja.

Las comprobaciones 4–7 salen de una tabla por tipo de documento (`_KINDS`: `vault:` con las
reglas de 0005, `note:` con las de `core/note_rules.py`); los pasos 1–3 y 8–9 son comunes.

**Proyección de hojas:** por documento se parte de sus hojas vivas en el servidor y se aplica
cada revisión aceptada del lote (quita las hojas que están en su historia y se añade si está
viva). Así las reglas que miran "las hojas existentes" (lápidas, `created_at`, liberación)
ven el estado que dejará la escritura, también entre documentos del mismo lote.

**Invariante de reservas (P-4):** toda hoja viva con `deleted_at = null` tiene reservado su
nombre (o su ruta); por eso se reserva cada revisión viva y activa antes de escribirla.

El puerto de bóvedas y los servicios son síncronos: sus llamadas corren en un hilo
(`anyio.to_thread`) para no bloquear el bucle de eventos; el de replicación es async.
"""
import logging
import re
from collections.abc import Awaitable, Callable
from typing import NamedTuple

from anyio import to_thread
from pydantic import TypeAdapter, ValidationError

from app.core import ag_rules, doc_names, meta_rules, plantilla_rules, skill_rules
from app.core.agent_access import Actor, check_registration_frontmatter
from app.core.config import settings
from app.core.errors import StorageUnavailable, VaultNameTaken
from app.core.index_rules import changed_keys, check_op, folder_of, is_index_path
from app.core.note_rules import (
    NOTE_KEYS, NOTE_REQUIRED, check_content, check_frontmatter, check_path, path_key,
)
from app.core.ports.replication_port import ReplicationPort
from app.core.ports.vault_port import VaultPort
from app.core.schemas import VaultAttributes, VaultDescription, VaultIcon, VaultName, VaultTags
from app.core.timestamps import is_timestamp
from app.services.agent_access_guard import AgentAccessGuard, invalidate_registry, read_registry
from app.services.change_log_service import ChangeLogService
from app.services.mensajes_service import MensajesService
from app.services.note_service import NotePathTaken, NoteService
from app.services.sync_filter import NOTE_PREFIX, VAULT_PREFIX, is_replicable_id
from app.services.vault_service import VaultService, name_key

# Claves de una revisión de bóveda, en el orden en que se informa la que falta (§2.3 paso 4).
_VAULT_KEYS = (
    "_id", "_rev", "_revisions", "type", "name", "description", "tags",
    "owner_id", "created_at", "updated_at", "deleted_at", "icon", "attributes",
)
# `icon` (SPEC-0009 RF-012) y `attributes` (H-029) son admitidas pero no obligatorias:
# las bóvedas anteriores no las tienen.
_VAULT_REQUIRED = tuple(key for key in _VAULT_KEYS if key not in ("icon", "attributes"))
# Una lápida no lleva nada más (P-5): el borrado de una bóveda es el soft delete de 0003.
_TOMBSTONE_KEYS = {"_id", "_rev", "_revisions", "_deleted"}

# `{generación}-{hash}`: generación ≥ 1; hash hexadecimal en minúscula, el que generan
# CouchDB, PouchDB y el cliente determinista (`conflicts.ts`). Otro hash CouchDB lo guardaría
# y fallaría más tarde con un error del almacén, no del cliente (enmienda 1, VC-5).
_REV_HASH = re.compile(r"[0-9a-f]+")
# La generación se acota (16 dígitos): `int()` de un texto de más de 4 300 dígitos lanza
# `ValueError` y daría un 500.
_REV = re.compile(r"([1-9][0-9]{0,15})-([0-9a-f]+)")

# Reglas de REST (`core/schemas.py`) en modo estricto: sin conversión de tipos (un número no
# pasa por texto). Lo que sí normalizan (espacios, minúsculas, repetidos) se compara aparte.
_FIELD_RULES = {
    "name": TypeAdapter(VaultName),
    "description": TypeAdapter(VaultDescription | None),
    "tags": TypeAdapter(VaultTags),
    "icon": TypeAdapter(VaultIcon | None),
    "attributes": TypeAdapter(VaultAttributes),
}


class Rejected(Exception):
    """Rechazo de una revisión; `reason` es el código que recibe el cliente (§2.3)."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def _history(doc: dict) -> list[str]:
    """Revisiones de la historia del documento, de la propia a la más antigua conocida."""
    revisions = doc["_revisions"]
    return [f"{revisions['start'] - i}-{rev_hash}" for i, rev_hash in enumerate(revisions["ids"])]


def _vault_use(leaf: dict) -> tuple[str, str]:
    """Clave de unicidad de una bóveda y el nombre con el que se reservó."""
    return name_key(leaf["name"]), leaf["name"]


def _note_use(leaf: dict) -> tuple[str, str]:
    """Clave de unicidad de una nota (su ruta dentro de la bóveda) y la ruta tal cual."""
    return path_key(leaf["path"]), leaf["path"]


def _check_timestamps(doc: dict, leaves: dict[str, dict]) -> None:
    """Formato de fechas y `created_at` inmutable (P2, R-8), comunes a todo tipo de documento.

    Ninguna regla compara con el reloj: una réplica offline escribe con su hora.
    """
    for field in ("created_at", "updated_at", "deleted_at"):
        value = doc[field]
        if field == "deleted_at" and value is None:
            continue
        if not (isinstance(value, str) and is_timestamp(value)):
            raise Rejected(f"validation-error:{field}")
    if any(leaf["created_at"] != doc["created_at"] for leaf in leaves.values()):
        raise Rejected("immutable-field:created_at")


def _check_vault_fields(doc: dict) -> None:
    """Paso 5 de una bóveda: reglas de REST sin normalizar (el contenido de una revisión no puede
    cambiar sin cambiar su `_rev`, P-3); el cliente normaliza antes de escribir."""
    for field, rule in _FIELD_RULES.items():
        if field not in doc:  # sólo `icon` puede faltar: el paso 4 exigió las demás
            continue
        try:
            normalized = rule.validate_python(doc[field], strict=True)
        except ValidationError:
            raise Rejected(f"validation-error:{field}") from None
        if normalized != doc[field]:
            raise Rejected(f"not-normalized:{field}")


def _check_note_fields(doc: dict) -> None:
    """Paso 5 de una nota (RF-005, RF-016): las reglas puras de `core/note_rules.py`.

    El servidor no normaliza (P-3 de 0005): una ruta con espacios sobrantes es `not-normalized`.
    """
    checks = [("path", check_path), ("content", check_content)]
    # Opcional (spec §3). `null` equivale a ausente: lo dejaron las escrituras REST de agentes anteriores al sellado
    # de fechas de H-029 y el cliente lo reenvía tal cual al mover o renombrar la nota.
    if doc.get("frontmatter") is not None:
        checks.append(("frontmatter", check_frontmatter))
    for field, check in checks:
        if (code := check(doc[field])) is not None:
            raise Rejected(code)


class _Kind(NamedTuple):
    """Lo que cambia entre tipos de documento en los pasos 4–7 y 9 (una fila de `_KINDS`)."""

    type: str                         # valor de `type`
    keys: tuple[str, ...]             # claves admitidas (paso 4)
    required: tuple[str, ...]         # claves obligatorias, en el orden en que se informan
    check_fields: Callable[[dict], None]                    # paso 5
    check_server: Callable[..., Awaitable[None]]            # paso 6a/6b (self, doc, hojas)
    check_parent: Callable[..., Awaitable[None]] | None     # paso 6c, también en lápidas (self, id)
    use: Callable[[dict], tuple[str, str]]                  # clave de unicidad y etiqueta de una hoja
    reserve: Callable[..., Awaitable[None]]                 # paso 7 (self, doc)
    release: Callable[..., Awaitable[None]]                 # paso 9 (self, id, etiqueta)


def _kind_of(doc_id: str) -> _Kind:
    """El tipo de un id ya validado por el paso 1 (`vault:` o `note:`)."""
    return _KINDS[doc_id.split(":", 1)[0] + ":"]


def _active_uses(leaves: dict[str, dict], kind: _Kind) -> dict[str, str]:
    """Claves de unicidad de las hojas activas (no en la papelera) y su nombre o ruta."""
    return dict(kind.use(leaf) for leaf in leaves.values() if not leaf.get("deleted_at"))


class SyncPushService:
    """Valida y escribe un lote del replicador en la base de un usuario (una instancia por petición)."""

    def __init__(self, vaults: VaultService, notes: NoteService, port: VaultPort,
                 replication: ReplicationPort, db: str, owner_id: str, actor: Actor | None = None,
                 changelog: ChangeLogService | None = None):
        self._vaults = vaults
        self._notes = notes
        self._port = port
        self._replication = replication
        self._db = db
        self._owner_id = owner_id
        # H-030: quién empuja (None = sesión humana) y el cumplimiento del registro de agentes (E6).
        self._actor = actor
        self._guard = AgentAccessGuard(port, db, owner_id, actor) if actor is not None else None
        self._mensajes = MensajesService(port, db)
        # H-030b: registro de cambios (BITACORA automática); se escribe antes que las notas del lote.
        self._changelog = changelog
        self._start_batch()

    def _start_batch(self) -> None:
        """Estado de un lote: cada `push` vuelve a leer las hojas del servidor."""
        # Por documento: hojas vivas proyectadas (rev → revisión) y las claves activas que
        # había en el servidor (clave → nombre o ruta).
        self._leaves: dict[str, dict[str, dict]] = {}
        self._uses_before: dict[str, dict[str, str]] = {}
        # Nombres o rutas reservados en este lote por documento (clave → etiqueta), para la liberación.
        self._reserved: dict[str, dict[str, str]] = {}
        # H-030: bóvedas nuevas del lote (reciben sus carpetas reservadas) y notas aceptadas por revisar.
        self._new_vaults: set[str] = set()
        # H-030b: (revisión aceptada, la que sustituye) de cada nota del lote, para el registro de cambios.
        self._log_items: list[tuple[dict, dict | None]] = []

    async def push(self, docs: list[dict]) -> list[dict]:
        """Rechazos del lote, en su orden; `[]` si se aceptó todo (como responde CouchDB).

        Lanza `StorageUnavailable` si falla el almacén: nada del lote se da por escrito y el
        cliente lo reenvía entero (los pasos 2 y 7 son idempotentes).
        """
        self._start_batch()
        # Dos pasadas (identidad; resto), con la posición de cada rechazo en el lote.
        rejections: dict[int, dict] = {}
        candidates: list[tuple[int, dict]] = []
        for position, doc in enumerate(docs):
            try:
                self._check_identity(doc)
            except Rejected as rejected:
                rejections[position] = _rejection(doc, rejected.reason)
                continue
            candidates.append((position, doc))

        # Bóvedas antes que notas (estable dentro de cada tipo): una nota cuya bóveda llega en
        # el mismo lote se valida contra ella aunque el feed las entregue al revés (P-7).
        candidates.sort(key=lambda candidate: not candidate[1]["_id"].startswith(VAULT_PREFIX))

        stored = await self._stored([doc for _, doc in candidates])
        accepted: list[dict] = []
        deferred: list[tuple[int, dict]] = []
        for position, doc in candidates:
            if doc["_rev"] in stored.get(doc["_id"], set()):
                continue  # paso 2: ya está, sin escribir ni reservar
            if _is_index_deletion(doc):
                deferred.append((position, doc))  # H-031: se evalúa cuando el resto del lote ya está escrito
                continue
            try:
                await self._accept(doc)
            except Rejected as rejected:
                rejections[position] = _rejection(doc, rejected.reason)
                continue
            stored.setdefault(doc["_id"], set()).add(doc["_rev"])  # repetida en el lote
            accepted.append(doc)

        if accepted:
            pendings = await to_thread.run_sync(self._log_begin)
            await self._write(accepted)
            await to_thread.run_sync(self._log_confirm, pendings)
            await self._release_unused()
            await to_thread.run_sync(self._after_write, accepted)
        if deferred:
            deleted_indexes = await self._push_index_deletions(deferred, rejections, stored)
            if deleted_indexes:
                await self._write(deleted_indexes)
                await self._release_unused()
        return [rejections[position] for position in sorted(rejections)]

    def _after_write(self, accepted: list[dict]) -> None:
        """Efectos de H-030 tras escribir el lote (mejor esfuerzo: la revisión ya está aceptada y escrita):
        carpetas reservadas de las bóvedas nuevas, caché del registro de agentes, `cerrada_el` de las cabeceras
        y reapertura de las conversaciones cerradas en las que se escribió."""
        from app.services.note_content_service import NoteContentService

        if self._changelog is not None:
            self._changelog.flush()
        try:
            for vault_id in self._new_vaults if settings.SEED_AG_FOLDERS else ():
                NoteContentService(self._port, self._db).ensure_ag_folders(vault_id)
            for doc in accepted:
                if not doc["_id"].startswith(NOTE_PREFIX) or doc.get("_deleted") is True:
                    continue
                zone = ag_rules.meta_folder_of(doc["path"])
                vault_id = doc["_id"].split(":")[1]
                if zone == ag_rules.AG_AGENTES:
                    invalidate_registry(self._db, vault_id)
                elif zone == ag_rules.AG_MENSAJES and doc.get("deleted_at") is None:
                    info = ag_rules.parse_mensaje_path(doc["path"])
                    if info is None:
                        continue
                    if info.kind == "cabecera":
                        self._mensajes.settle(doc["_id"])
                    elif info.kind == "mensaje" and doc["_revisions"]["start"] == 1:
                        self._mensajes.reopen_if_closed(vault_id, info.para, info.conversation)
        except Exception:  # noqa: BLE001
            logging.getLogger(__name__).warning("post-push effects failed", exc_info=True)

    def _log_begin(self) -> list:
        """Registra en `change_log`, antes de escribir el lote, el cambio de cada nota aceptada (idempotente por
        `_rev`: el reintento de un lote no duplica). Si no se puede registrar, el lote no se escribe (503)."""
        if self._changelog is None:
            return []
        out = []
        for doc, previous in self._log_items:
            pending = self._changelog.begin(doc["vault_id"], previous, doc, rev=doc["_rev"])
            if pending is not None:
                out.append((pending, doc["_rev"]))
        return out

    def _log_confirm(self, pendings: list) -> None:
        for pending, rev in pendings:
            self._changelog.confirm(pending, rev)

    async def _push_index_deletions(
            self, deferred: list[tuple[int, dict]], rejections: dict[int, dict],
            stored: dict[str, set[str]]) -> list[dict]:
        """H-031: borra un INDICE sólo si, con el lote ya escrito, no queda otra nota viva bajo su carpeta
        (nunca el de la raíz). De la carpeta más profunda a la menos: borrar `A/B` y `A` en un mismo lote
        funciona sin importar el orden en que lleguen. Devuelve las revisiones aceptadas."""
        accepted: list[dict] = []
        gone: set[str] = set()
        for position, doc in sorted(deferred, key=lambda item: -item[1]["path"].count("/")):
            try:
                vault_id = doc["_id"].split(":")[1]
                below = await self._live_below(vault_id, doc["path"], gone | {doc["_id"]})
                if (code := ag_rules.check_index_delete(doc["path"])) is not None:
                    raise Rejected(code)
                if (code := check_op("delete", doc["path"], other_live_below_after=below)) is not None:
                    raise Rejected(code)
                await self._accept(doc)
            except Rejected as rejected:
                rejections[position] = _rejection(doc, rejected.reason)
                continue
            stored.setdefault(doc["_id"], set()).add(doc["_rev"])
            gone.add(doc["_id"])
            accepted.append(doc)
        return accepted

    async def _live_below(self, vault_id: str, index_path: str, excluded: set[str]) -> int:
        """Notas vivas del servidor por debajo de la carpeta de `index_path` (en la raíz, todas), sin las
        de `excluded`."""
        folder = folder_of(index_path)
        prefix = path_key(folder) + "/" if folder else ""
        count, after = 0, None
        while True:
            page = await to_thread.run_sync(self._port.list_notes, self._db, vault_id, False, 100, after)
            count += sum(
                1 for note in page
                if note["_id"] not in excluded and not note.get("deleted_at") and path_key(note["path"]).startswith(prefix))
            if len(page) < 100:
                return count
            after = (page[-1]["created_at"], page[-1]["_id"])

    # --- Paso 1: id, `_rev`, `_revisions` ---

    @staticmethod
    def _check_identity(doc: dict) -> None:
        if not is_replicable_id(doc.get("_id")):
            raise Rejected("invalid-id")
        match = _REV.fullmatch(doc["_rev"]) if isinstance(doc.get("_rev"), str) else None
        if match is None:
            raise Rejected("validation-error:_rev")
        revisions = doc.get("_revisions")
        valid = (
            isinstance(revisions, dict)
            and revisions.keys() == {"start", "ids"}
            and type(revisions["start"]) is int
            and isinstance(revisions["ids"], list)
            and all(isinstance(h, str) and _REV_HASH.fullmatch(h) for h in revisions["ids"])
            # Coherente con `_rev` y sin generaciones por debajo de 1.
            and revisions["start"] == int(match[1])
            and revisions["ids"][:1] == [match[2]]
            and revisions["start"] >= len(revisions["ids"])
        )
        if not valid:
            raise Rejected("validation-error:_revisions")

    # --- Paso 2: ya almacenadas ---

    async def _stored(self, docs: list[dict]) -> dict[str, set[str]]:
        """Por id, las revisiones del lote que el servidor ya tiene (una sola consulta)."""
        if not docs:
            return {}
        asked: dict[str, list[str]] = {}
        for doc in docs:
            asked.setdefault(doc["_id"], []).append(doc["_rev"])
        diff = await self._replication.revs_diff(self._db, asked)
        return {
            doc_id: set(revs) - set(diff.get(doc_id, {}).get("missing", []))
            for doc_id, revs in asked.items()
        }

    # --- Pasos 3–7 ---

    async def _accept(self, doc: dict) -> None:
        """Valida una revisión nueva, reserva su nombre o ruta y la añade a la proyección."""
        kind = _kind_of(doc["_id"])
        leaves = await self._projected(doc["_id"])
        tombstone = doc.get("_deleted") is True
        if tombstone:
            self._check_tombstone(doc, leaves)
        else:
            self._check_shape(doc, kind)
            kind.check_fields(doc)
            await kind.check_server(self, doc, leaves)
            if doc["_id"].startswith(NOTE_PREFIX):
                self._check_index_rules(doc, leaves)
                self._check_ag_rules(doc, leaves)
                await self._check_meta_rules(doc, leaves)
                await self._check_skill_rules(doc, leaves)
                await self._check_agent_access(doc, leaves)
        if kind.check_parent is not None:
            await kind.check_parent(self, doc["_id"])
        if doc["_id"].startswith(VAULT_PREFIX) and not tombstone and doc["deleted_at"] is None and not leaves:
            self._new_vaults.add(doc["_id"].removeprefix(VAULT_PREFIX))
        if not tombstone and doc["deleted_at"] is None:
            await kind.reserve(self, doc)
            key, label = kind.use(doc)
            self._reserved.setdefault(doc["_id"], {})[key] = label
        if doc["_id"].startswith(NOTE_PREFIX) and not tombstone:
            history = _history(doc)
            self._log_items.append((doc, leaves.get(history[1]) if len(history) > 1 else None))
        self._project(doc, leaves)

    async def _projected(self, doc_id: str) -> dict[str, dict]:
        if doc_id not in self._leaves:
            leaves = await to_thread.run_sync(self._port.leaves, self._db, doc_id)
            self._leaves[doc_id] = {leaf["_rev"]: leaf for leaf in leaves}
            self._uses_before[doc_id] = _active_uses(self._leaves[doc_id], _kind_of(doc_id))
        return self._leaves[doc_id]

    @staticmethod
    def _check_tombstone(doc: dict, leaves: dict[str, dict]) -> None:
        """Paso 3 (P-5): sólo cierra una rama viva de un conflicto, nunca la última."""
        history = _history(doc)
        closes_a_branch = (
            doc.keys() == _TOMBSTONE_KEYS
            and len(history) > 1
            and history[1] in leaves
            and len(leaves) > 1
        )
        if not closes_a_branch:
            raise Rejected("delete-not-allowed")

    @staticmethod
    def _check_shape(doc: dict, kind: _Kind) -> None:
        """Paso 4 (RF-005): sólo las claves del tipo, las obligatorias presentes y su `type`."""
        for key in doc:
            if key not in kind.keys:
                raise Rejected(f"validation-error:{key}")
        for key in kind.required:
            if key not in doc:
                raise Rejected(f"validation-error:{key}")
        if doc["type"] != kind.type:
            raise Rejected("validation-error:type")

    @staticmethod
    def _project(doc: dict, leaves: dict[str, dict]) -> None:
        """La revisión sustituye a las hojas de su historia; si está viva, pasa a ser hoja."""
        for rev in _history(doc):
            leaves.pop(rev, None)
        if doc.get("_deleted") is not True:
            leaves[doc["_rev"]] = doc

    # --- Paso 6 y 7 por tipo (las filas de `_KINDS` los referencian) ---

    async def _check_vault_rules(self, doc: dict, leaves: dict[str, dict]) -> None:
        """Paso 6 de una bóveda: dueño del token, fechas y `created_at` inmutable."""
        if doc["owner_id"] != self._owner_id:
            raise Rejected("owner-mismatch")
        _check_timestamps(doc, leaves)

    async def _check_note_rules(self, doc: dict, leaves: dict[str, dict]) -> None:
        """Paso 6 de una nota: su `vault_id` es el del id (RF-005), fechas y `created_at` inmutable."""
        if doc["vault_id"] != doc["_id"].split(":")[1]:
            raise Rejected("validation-error:vault_id")
        _check_timestamps(doc, leaves)

    @staticmethod
    def _check_index_rules(doc: dict, leaves: dict[str, dict]) -> None:
        """H-031: un INDICE no se renombra, no lleva contenido y sólo admite cambiar su `descripcion`;
        ninguna otra nota toma su nombre. El borrado se decide aparte (`_push_index_deletions`)."""
        path = doc["path"]
        history = _history(doc)
        previous = leaves.get(history[1]) if len(history) > 1 else None
        if previous is not None and previous["path"] != path:
            # Un INDICE acompaña a su carpeta cuando ésta se mueve o se renombra: el cliente lo mueve junto con sus
            # notas. Sólo se admite de una ruta de INDICE a otra; la reserva de ruta evita pisar el de otra carpeta.
            moves_with_folder = is_index_path(previous["path"]) and is_index_path(path)
            if not moves_with_folder and (code := check_op("rename_or_move", previous["path"], to=path)) is not None:
                raise Rejected(code)
        if not is_index_path(path):
            return
        if doc["content"] != "":
            raise Rejected("index-readonly:content")
        changed = changed_keys(previous.get("frontmatter") if previous else None, doc.get("frontmatter"))
        if (code := check_op("edit", path, changed=changed)) is not None:
            raise Rejected(code)

    def _check_ag_rules(self, doc: dict, leaves: dict[str, dict]) -> None:
        """H-030: carpetas reservadas, formato de `AG - MENSAJES` y registro de `AG - AGENTES`."""
        path = doc["path"]
        history = _history(doc)
        previous = leaves.get(history[1]) if len(history) > 1 else None
        prev_path = previous["path"] if previous else None
        if prev_path != path and (code := ag_rules.check_create(path)) is not None:
            raise Rejected(code)
        # H-041 E2: una skill nueva o movida llega ya con el nombre canónico (el cliente lo estructuró).
        if prev_path != path and doc["deleted_at"] is None and (code := doc_names.is_canonical(path)) is not None:
            raise Rejected(code)
        if prev_path is not None and prev_path != path and is_index_path(prev_path):
            folder = folder_of(prev_path)
            if folder and ag_rules.is_meta_folder(folder):
                raise Rejected("meta-folder:rename")  # un INDICE reservado no se mueve con una carpeta renombrada
        deleted = doc["deleted_at"] is not None
        zone = ag_rules.meta_folder_of(path)
        prev_zone = ag_rules.meta_folder_of(prev_path) if prev_path else None
        agent = self._actor if self._actor is not None and self._actor.kind == "agent" else None
        if ag_rules.AG_MENSAJES in (zone, prev_zone) and not is_index_path(path):
            info = ag_rules.parse_mensaje_path(path)
            if not deleted:
                if info is None:
                    raise Rejected("ag-mensajes:path")
                frontmatter = doc.get("frontmatter")
                check = ag_rules.check_cabecera if info.kind == "cabecera" else ag_rules.check_mensaje_note
                if (code := check(info, frontmatter)) is not None:
                    raise Rejected(code)
                previous_frontmatter = (previous or {}).get("frontmatter") or {}
                if info.kind == "cabecera" and (frontmatter or {}).get("cerrada_el") != previous_frontmatter.get("cerrada_el"):
                    raise Rejected("immutable-field:cerrada_el")  # lo sella el servidor
            if agent is not None:
                old_info = ag_rules.parse_mensaje_path(prev_path) if prev_path else info
                target = old_info or info
                if target is not None:
                    op = "create" if previous is None else "delete" if deleted else \
                        "rename_or_move" if prev_path != path else "update"
                    code = ag_rules.check_agent_mensaje_op(
                        op, target, agent_id=agent.agent_id, is_admin=agent.is_admin,
                        old_frontmatter=(previous or {}).get("frontmatter"), new_frontmatter=doc.get("frontmatter"))
                    if code is not None:
                        raise Rejected(code)
        if zone == ag_rules.AG_AGENTES and not deleted and not is_index_path(path):
            if (code := check_registration_frontmatter(path, doc.get("frontmatter"))) is not None:
                raise Rejected(code)

    async def _check_meta_rules(self, doc: dict, leaves: dict[str, dict]) -> None:
        """H-030b: BITACORA de solo lectura, forma de las plantillas, skill de cajón solo para la sesión humana y
        plantilla en uso (no se borra, renombra ni saca de PLANTILLAS mientras algún documento la use).

        La existencia de la plantilla que cita un documento no se comprueba aquí (un cliente sin conexión puede
        crear la plantilla y el documento en lotes distintos); la protege el borrado de plantillas en uso."""
        history = _history(doc)
        previous = leaves.get(history[1]) if len(history) > 1 else None
        prev_path = previous["path"] if previous else None
        deleted = doc["deleted_at"] is not None
        kind = self._actor.kind if self._actor is not None else "human"
        if (code := meta_rules.check_note_write(
                path=doc["path"], prev_path=prev_path, deleted=deleted, frontmatter=doc.get("frontmatter"),
                actor_kind=kind)) is not None:
            raise Rejected(code)
        name = plantilla_rules.template_name(prev_path) if prev_path else None
        if name is not None and previous is not None and not previous.get("deleted_at") and (
                deleted or plantilla_rules.template_name(doc["path"]) != name):
            from app.services.note_content_service import NoteContentService

            vault_id = doc["_id"].split(":")[1]
            users = await to_thread.run_sync(
                NoteContentService(self._port, self._db)._count_template_users, vault_id, name, doc["_id"])
            if users > 0:
                raise Rejected("plantilla:in-use")

    async def _check_skill_rules(self, doc: dict, leaves: dict[str, dict]) -> None:
        """H-041 E3: propietario, invitados y estado de una skill de `AG - SKILLS`. A diferencia de la REST, aquí no se
        puede sellar el propietario (la revisión viaja tal cual): una clave de agente debe traerlo ya correcto. La sesión
        humana solo introduce gestores; las reglas por agente (propiedad, invitados) las gobierna el interruptor de H-030."""
        history = _history(doc)
        previous = leaves.get(history[1]) if len(history) > 1 else None
        prev_path = previous["path"] if previous else None
        deleted = doc["deleted_at"] is not None
        was = skill_rules.is_skill_path(prev_path)
        becomes = not deleted and skill_rules.is_skill_path(doc["path"])
        actor = self._actor
        if (not was and not becomes) or (actor is not None and actor.kind == "system"):
            return
        agentic = actor is not None and actor.kind in ("agent", "general")
        old_fm = (previous.get("frontmatter") or {}) if was and previous is not None else None
        fm = doc.get("frontmatter") or {}
        vault_id = doc["_id"].split(":")[1]
        if becomes:
            if (code := skill_rules.check_shape(fm)) is not None:
                raise Rejected(code)
            if agentic and not was:
                who = skill_rules.identity(actor, honor_declared=not (self._guard is not None and self._guard.enforcing))
                if who is None or skill_rules.owner_of(fm) != who:
                    raise Rejected(skill_rules.SKILL_OWNER)  # el propietario lo fija quien crea; aquí no se puede sellar
            if not agentic:
                registry = await to_thread.run_sync(read_registry, self._port, self._db, vault_id)
                if (code := skill_rules.check_people(fm, registry, old_fm)) is not None:
                    raise Rejected(code)
        if agentic and self._guard is not None and self._guard.active:
            op = "create" if not was else "delete" if not becomes else "move" if prev_path != doc["path"] else "update"
            allowed, _reason = await to_thread.run_sync(
                self._guard.evaluate_skill, vault_id, op, doc["path"] if becomes else prev_path, old_fm, fm if becomes else None)
            if not allowed and self._guard.enforcing:
                raise Rejected("agent-access-denied")

    async def _check_agent_access(self, doc: dict, leaves: dict[str, dict]) -> None:
        """H-030 E6: una clave de agente solo escribe donde su registro de `AG - AGENTES` lo permite. En modo
        sombra solo registra; con cumplimiento activo rechaza la revisión."""
        if self._guard is None or not self._guard.active:
            return
        history = _history(doc)
        previous = leaves.get(history[1]) if len(history) > 1 else None
        paths = [doc["path"]] + ([previous["path"]] if previous and previous["path"] != doc["path"] else [])
        allowed, _ = await to_thread.run_sync(
            self._guard.evaluate, doc["_id"].split(":")[1], "sync-write", paths)
        if not allowed and self._guard.enforcing:
            raise Rejected("agent-access-denied")

    async def _check_vault_is_active(self, note_id: str) -> None:
        """Paso 6c (RF-004, RF-014): la bóveda de la nota tiene alguna hoja viva y activa.

        Se mira la proyección (servidor + aceptadas del lote), no sólo el servidor: una bóveda
        creada, borrada o restaurada en el mismo lote cuenta ya. Como la base es la del token,
        "del propio usuario" está garantizado: la bóveda de otro usuario no existe aquí. Con
        la bóveda en conflicto basta una rama activa (P-9). Vale también para las lápidas de
        nota: una bóveda borrada congela sus notas (RF-014).
        """
        vault_leaves = await self._projected(f"{VAULT_PREFIX}{note_id.split(':')[1]}")
        if not any(not leaf.get("deleted_at") for leaf in vault_leaves.values()):
            raise Rejected("vault-not-found")

    async def _reserve_vault_name(self, doc: dict) -> None:
        """Paso 7 de una bóveda (RF-008, P-4): la misma reserva que REST, con su arrendamiento de 30 s."""
        try:
            await to_thread.run_sync(
                self._vaults.reserve, doc["name"], doc["_id"].removeprefix(VAULT_PREFIX))
        except VaultNameTaken:
            raise Rejected("vault-name-taken") from None

    async def _release_vault_name(self, doc_id: str, name: str) -> None:
        await to_thread.run_sync(self._vaults.release, name, doc_id.removeprefix(VAULT_PREFIX))

    async def _reserve_note_path(self, doc: dict) -> None:
        """Paso 7 de una nota (RF-013, RF-017): la reserva `note-path:{vault_id}:{sha256(clave)}`."""
        try:
            await to_thread.run_sync(self._notes.reserve_path, doc["_id"], doc["path"])
        except NotePathTaken:
            raise Rejected("note-path-taken") from None

    async def _release_note_path(self, doc_id: str, path: str) -> None:
        await to_thread.run_sync(self._notes.release_path, doc_id, path)

    # --- Pasos 8 y 9 ---

    async def _write(self, docs: list[dict]) -> None:
        """Paso 8: una sola escritura `new_edits:false`; cualquier error → 503 de todo el lote."""
        errors = await self._replication.bulk_docs_replicated(self._db, docs)
        if errors:
            raise StorageUnavailable(f"_bulk_docs rejected {len(errors)} revisions")

    async def _release_unused(self) -> None:
        """Paso 9: libera los nombres y rutas que usaban las hojas (o se reservaron en el lote) y
        que ya no usa ninguna hoja viva y activa. La liberación vuelve a comprobarlo en el servidor."""
        for doc_id, leaves in self._leaves.items():
            kind = _kind_of(doc_id)
            in_use = _active_uses(leaves, kind)
            candidates = self._uses_before[doc_id] | self._reserved.get(doc_id, {})
            for key, label in candidates.items():
                if key not in in_use:
                    await kind.release(self, doc_id, label)


# Una fila por tipo de documento; los métodos se enlazan sin instanciar (reciben `self`).
_KINDS = {
    VAULT_PREFIX: _Kind(
        "vault", _VAULT_KEYS, _VAULT_REQUIRED, _check_vault_fields,
        SyncPushService._check_vault_rules, None, _vault_use,
        SyncPushService._reserve_vault_name, SyncPushService._release_vault_name),
    NOTE_PREFIX: _Kind(
        "note", NOTE_KEYS, NOTE_REQUIRED, _check_note_fields,
        SyncPushService._check_note_rules, SyncPushService._check_vault_is_active,
        _note_use, SyncPushService._reserve_note_path, SyncPushService._release_note_path),
}


def _is_index_deletion(doc: dict) -> bool:
    """Revisión de nota con `deleted_at` cuya ruta es la de un INDICE (las lápidas `_deleted` no llevan ruta)."""
    return (
        doc["_id"].startswith(NOTE_PREFIX) and doc.get("_deleted") is not True
        and doc.get("deleted_at") is not None and isinstance(doc.get("path"), str) and is_index_path(doc["path"]))


def _rejection(doc: dict, reason: str) -> dict:
    return {"id": doc.get("_id"), "rev": doc.get("_rev"), "error": "forbidden", "reason": reason}
