"""Push validado de la sincronización: `_bulk_docs` con `new_edits:false` (SPEC-0005 RF-005…RF-008,
RF-011; PLAN-0005 §2.3).

Cada revisión del lote se acepta o se rechaza con `{"id", "rev", "error": "forbidden",
"reason": "<código>"}`; PouchDB trata `forbidden` como *denied*: avisa, no reintenta y sigue
con el resto (RF-006). Las aceptadas se escriben juntas en una sola llamada.

Orden de las comprobaciones por documento (la primera que falla da el código):
1. id `vault:{uuid}` canónico → si no, `invalid-id` (RF-007);
   después, `_rev` y `_revisions` bien formados (los pasos 2 y 3 dependen de ellos);
2. ya almacenada → aceptada sin tocar nada (reenvío de un lote cortado);
3. lápida → sólo si cierra una rama y queda otra hoja viva (`delete-not-allowed`);
4. forma, 5. campos sin normalizar, 6. reglas del servidor;
7. reserva del nombre (`vault-name-taken`).
Luego 8. escritura y 9. liberación de los nombres que ya no usa ninguna hoja.

**Proyección de hojas:** por bóveda se parte de sus hojas vivas en el servidor y se aplica
cada revisión aceptada del lote (quita las hojas que están en su historia y se añade si está
viva). Así las reglas que miran "las hojas existentes" (lápidas, `created_at`, liberación)
ven el estado que dejará la escritura, también entre documentos del mismo lote.

**Invariante de reservas (P-4):** toda hoja viva con `deleted_at = null` tiene reservado su
nombre; por eso se reserva cada revisión viva y activa antes de escribirla.

El puerto de bóvedas y `VaultService` son síncronos: sus llamadas corren en un hilo
(`anyio.to_thread`) para no bloquear el bucle de eventos; el de replicación es async.
"""
import re

from anyio import to_thread
from pydantic import TypeAdapter, ValidationError

from app.core.errors import StorageUnavailable, VaultNameTaken
from app.core.ports.replication_port import ReplicationPort
from app.core.ports.vault_port import VaultPort
from app.core.schemas import VaultDescription, VaultName, VaultTags
from app.core.timestamps import is_timestamp
from app.services.sync_filter import is_replicable_id
from app.services.vault_service import VaultService, name_key

# Claves de una revisión de bóveda, en el orden en que se informa la que falta (§2.3 paso 4).
_VAULT_KEYS = (
    "_id", "_rev", "_revisions", "type", "name", "description", "tags",
    "owner_id", "created_at", "updated_at", "deleted_at",
)
# Una lápida no lleva nada más (P-5): el borrado de una bóveda es el soft delete de 0003.
_TOMBSTONE_KEYS = {"_id", "_rev", "_revisions", "_deleted"}

# `{generación}-{hash}`: generación ≥ 1; hash hexadecimal en minúscula, el que generan
# CouchDB, PouchDB y el cliente determinista (`conflicts.ts`). Otro hash CouchDB lo guardaría
# y fallaría más tarde con un error del almacén, no del cliente (enmienda 1, VC-5).
_REV_HASH = re.compile(r"[0-9a-f]+")
_REV = re.compile(r"([1-9][0-9]*)-([0-9a-f]+)")

# Reglas de REST (`core/schemas.py`) en modo estricto: sin conversión de tipos (un número no
# pasa por texto). Lo que sí normalizan (espacios, minúsculas, repetidos) se compara aparte.
_FIELD_RULES = {
    "name": TypeAdapter(VaultName),
    "description": TypeAdapter(VaultDescription | None),
    "tags": TypeAdapter(VaultTags),
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


def _active_names(leaves: dict[str, dict]) -> dict[str, str]:
    """Nombres de las hojas activas (no en la papelera), por su clave de unicidad."""
    return {
        name_key(leaf["name"]): leaf["name"]
        for leaf in leaves.values() if not leaf.get("deleted_at")
    }


class SyncPushService:
    """Valida y escribe un lote del replicador en la base de un usuario (una instancia por petición)."""

    def __init__(self, vaults: VaultService, port: VaultPort, replication: ReplicationPort,
                 db: str, owner_id: str):
        self._vaults = vaults
        self._port = port
        self._replication = replication
        self._db = db
        self._owner_id = owner_id
        self._start_batch()

    def _start_batch(self) -> None:
        """Estado de un lote: cada `push` vuelve a leer las hojas del servidor."""
        # Por bóveda: hojas vivas proyectadas (rev → revisión) y los nombres activos que
        # había en el servidor (clave → nombre).
        self._leaves: dict[str, dict[str, dict]] = {}
        self._names_before: dict[str, dict[str, str]] = {}
        # Nombres reservados en este lote por bóveda (clave → nombre), para la liberación.
        self._reserved: dict[str, dict[str, str]] = {}

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

        stored = await self._stored([doc for _, doc in candidates])
        accepted: list[dict] = []
        for position, doc in candidates:
            if doc["_rev"] in stored.get(doc["_id"], set()):
                continue  # paso 2: ya está, sin escribir ni reservar
            try:
                await self._accept(doc)
            except Rejected as rejected:
                rejections[position] = _rejection(doc, rejected.reason)
                continue
            stored.setdefault(doc["_id"], set()).add(doc["_rev"])  # repetida en el lote
            accepted.append(doc)

        if accepted:
            await self._write(accepted)
            await self._release_unused()
        return [rejections[position] for position in sorted(rejections)]

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
        """Valida una revisión nueva, reserva su nombre y la añade a la proyección."""
        leaves = await self._projected(doc["_id"])
        if doc.get("_deleted") is True:
            self._check_tombstone(doc, leaves)
        else:
            self._check_shape(doc)
            self._check_fields(doc)
            self._check_server_rules(doc, leaves)
            if doc["deleted_at"] is None:
                await self._reserve(doc)
        self._project(doc, leaves)

    async def _projected(self, doc_id: str) -> dict[str, dict]:
        if doc_id not in self._leaves:
            leaves = await to_thread.run_sync(self._port.leaves, self._db, doc_id)
            self._leaves[doc_id] = {leaf["_rev"]: leaf for leaf in leaves}
            self._names_before[doc_id] = _active_names(self._leaves[doc_id])
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
    def _check_shape(doc: dict) -> None:
        """Paso 4 (RF-005): sólo las claves de una bóveda, todas presentes, y `type == "vault"`."""
        for key in doc:
            if key not in _VAULT_KEYS:
                raise Rejected(f"validation-error:{key}")
        for key in _VAULT_KEYS:
            if key not in doc:
                raise Rejected(f"validation-error:{key}")
        if doc["type"] != "vault":
            raise Rejected("validation-error:type")

    @staticmethod
    def _check_fields(doc: dict) -> None:
        """Paso 5: reglas de REST sin normalizar (el contenido de una revisión no puede cambiar
        sin cambiar su `_rev`, P-3); el cliente normaliza antes de escribir."""
        for field, rule in _FIELD_RULES.items():
            try:
                normalized = rule.validate_python(doc[field], strict=True)
            except ValidationError:
                raise Rejected(f"validation-error:{field}") from None
            if normalized != doc[field]:
                raise Rejected(f"not-normalized:{field}")

    def _check_server_rules(self, doc: dict, leaves: dict[str, dict]) -> None:
        """Paso 6 (P2, R-8): dueño del token, formato de fechas y `created_at` inmutable.

        Ninguna regla compara con el reloj: una réplica offline escribe con su hora.
        """
        if doc["owner_id"] != self._owner_id:
            raise Rejected("owner-mismatch")
        for field in ("created_at", "updated_at", "deleted_at"):
            value = doc[field]
            if field == "deleted_at" and value is None:
                continue
            if not (isinstance(value, str) and is_timestamp(value)):
                raise Rejected(f"validation-error:{field}")
        if any(leaf["created_at"] != doc["created_at"] for leaf in leaves.values()):
            raise Rejected("immutable-field:created_at")

    async def _reserve(self, doc: dict) -> None:
        """Paso 7 (RF-008, P-4): la misma reserva que REST, con su arrendamiento de 30 s."""
        vault_id = doc["_id"].removeprefix("vault:")
        try:
            await to_thread.run_sync(self._vaults.reserve, doc["name"], vault_id)
        except VaultNameTaken:
            raise Rejected("vault-name-taken") from None
        self._reserved.setdefault(doc["_id"], {})[name_key(doc["name"])] = doc["name"]

    @staticmethod
    def _project(doc: dict, leaves: dict[str, dict]) -> None:
        """La revisión sustituye a las hojas de su historia; si está viva, pasa a ser hoja."""
        for rev in _history(doc):
            leaves.pop(rev, None)
        if doc.get("_deleted") is not True:
            leaves[doc["_rev"]] = doc

    # --- Pasos 8 y 9 ---

    async def _write(self, docs: list[dict]) -> None:
        """Paso 8: una sola escritura `new_edits:false`; cualquier error → 503 de todo el lote."""
        errors = await self._replication.bulk_docs_replicated(self._db, docs)
        if errors:
            raise StorageUnavailable(f"_bulk_docs rejected {len(errors)} revisions")

    async def _release_unused(self) -> None:
        """Paso 9: libera los nombres que usaban las hojas (o se reservaron en el lote) y que
        ya no usa ninguna hoja viva y activa. `release` vuelve a comprobarlo en el servidor."""
        for doc_id, leaves in self._leaves.items():
            in_use = _active_names(leaves)
            candidates = self._names_before[doc_id] | self._reserved.get(doc_id, {})
            vault_id = doc_id.removeprefix("vault:")
            for key, name in candidates.items():
                if key not in in_use:
                    await to_thread.run_sync(self._vaults.release, name, vault_id)


def _rejection(doc: dict, reason: str) -> dict:
    return {"id": doc.get("_id"), "rev": doc.get("_rev"), "error": "forbidden", "reason": reason}
