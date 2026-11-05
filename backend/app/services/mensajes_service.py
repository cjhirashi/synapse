"""Lo que el servidor hace por su cuenta en las conversaciones de `AG - MENSAJES` (H-030 E4, H-042).

Son efectos del sistema, no escrituras de un agente: crear la cabecera con el primer mensaje, reabrir una conversación
cerrada cuando un participante escribe en ella (Q6), sellar `cerrada_el` en una cabecera que llegó por la sincronización
y cerrar las conversaciones dirigidas a un gestor que sale. Sobre la base de un usuario, a través de `VaultPort`; con
`owner_id` la creación y el cierre constan en la BITACORA con autor `sistema`.
"""
import logging
import uuid

from app.core import conversation_rules
from app.core.ag_rules import AG_MENSAJES
from app.core.conversation_rules import CABECERA, MensajePath
from app.core.errors import RevisionConflict
from app.core.note_dates import stamp_dates, today_cdmx
from app.core.note_prefix import in_folder, view_key
from app.core.ports.vault_port import VaultPort
from app.core.timestamps import utc_now
from app.services.change_log_service import SYSTEM, ChangeLogService
from app.services.note_service import NotePathTaken, NoteService

logger = logging.getLogger(__name__)


class MensajesService:
    def __init__(self, port: VaultPort, db: str, owner_id: str | None = None):
        self._port = port
        self._db = db
        self._owner_id = owner_id
        self._notes = NoteService(port, db)

    # --- Lectura ---

    def docs_under(self, vault_id: str, folder: str) -> list[dict]:
        """Notas vivas bajo la carpeta `folder`."""
        found, after = [], None
        while True:
            docs = self._port.list_notes_by_prefix(self._db, vault_id, False, view_key(folder), 100, after)
            found += [d for d in docs if in_folder(d["path"], folder)]
            if len(docs) < 100:
                return found
            after = (view_key(docs[-1]["path"]), docs[-1]["_id"])

    def find_cabecera(self, vault_id: str, info: MensajePath) -> dict | None:
        """La nota `000-cabecera.md` viva de la conversación, o `None`."""
        for doc in self.docs_under(vault_id, info.folder):
            if doc["path"].rsplit("/", 1)[-1] == CABECERA:
                return doc
        return None

    def has_messages(self, vault_id: str, info: MensajePath) -> bool:
        """¿Ya hay algún mensaje en la conversación? El primero solo lo escribe quien la abre."""
        return any(
            (m := conversation_rules.parse_mensaje_path(d["path"])) is not None and m.kind == "mensaje"
            for d in self.docs_under(vault_id, info.folder))

    # --- Efectos del sistema ---

    def ensure_cabecera(self, vault_id: str, info: MensajePath) -> None:
        """Crea la cabecera de la conversación si falta (idempotente). La llama quien va a escribir el primer mensaje, o el
        efecto posterior a una escritura por `/sync`, donde la cabecera no pudo existir antes."""
        if self.find_cabecera(vault_id, info) is not None:
            return
        path = f"{info.folder}/{CABECERA}"
        doc_id = f"note:{vault_id}:{uuid.uuid4()}"
        try:
            self._notes.reserve_path(doc_id, path)
        except NotePathTaken:
            return  # otra petición la creó a la vez
        frontmatter, body = conversation_rules.new_cabecera(info)
        now = utc_now()
        doc = {
            "_id": doc_id, "type": "note", "vault_id": vault_id, "path": path, "content": body,
            "frontmatter": stamp_dates(frontmatter, today_cdmx(), now),
            "created_at": now, "updated_at": now, "deleted_at": None,
        }
        self._put(vault_id, None, doc)
        from app.services.note_content_service import NoteContentService  # ciclo: el servicio de notas usa este

        NoteContentService(self._port, self._db).ensure_indexes(vault_id, path)

    def reopen_if_closed(self, vault_id: str, info: MensajePath) -> bool:
        """Escribir en una conversación cerrada la reabre (Q6): `estado` pasa a `abierta` y `cerrada_el` se quita."""
        for _ in range(2):  # un reintento si otra escritura cambió la cabecera entre la lectura y la escritura
            cabecera = self.find_cabecera(vault_id, info)
            if cabecera is None or (cabecera.get("frontmatter") or {}).get("estado") != "cerrada":
                return False
            if self._rewrite(vault_id, cabecera, {**cabecera["frontmatter"], "estado": "abierta"}):
                return True
        return False

    def close_for_receptor(self, vault_id: str, agent_id: str) -> int:
        """Cierra las conversaciones abiertas dirigidas a `agent_id` (que dejó de ser gestor de la bóveda). Idempotente;
        devuelve cuántas cerró. No toca las que él inició."""
        closed = 0
        for doc in self.docs_under(vault_id, AG_MENSAJES):
            info = conversation_rules.parse_mensaje_path(doc["path"])
            frontmatter = doc.get("frontmatter") or {}
            if (info is None or info.kind != "cabecera" or info.para != agent_id or frontmatter.get("estado") != "abierta"):
                continue
            if self._rewrite(vault_id, doc, {**frontmatter, "estado": "cerrada"}):
                closed += 1
        return closed

    def settle(self, doc_id: str) -> None:
        """Deja la cabecera `doc_id` con `cerrada_el` coherente con su `estado` (cerrada con hora; abierta sin
        ella). Para cabeceras que llegaron por la sincronización, donde el servidor no puede editar la revisión
        que acepta y escribe una posterior. Mejor esfuerzo: un fallo se registra."""
        try:
            doc = self._port.get(self._db, doc_id)
            if doc is None or doc.get("deleted_at") or doc.get("type") != "note":
                return
            frontmatter = doc.get("frontmatter") or {}
            desired = conversation_rules.stamp_cabecera(frontmatter, frontmatter, utc_now())
            if desired != frontmatter:
                self._rewrite(doc["vault_id"], doc, frontmatter)
        except Exception:  # noqa: BLE001
            logger.warning("settle of %s failed", doc_id, exc_info=True)

    # --- Escritura ---

    def _rewrite(self, vault_id: str, doc: dict, new_frontmatter: dict) -> bool:
        stamped = conversation_rules.stamp_cabecera(doc.get("frontmatter"), new_frontmatter, utc_now())
        updated = {
            **doc, "updated_at": utc_now(),
            "frontmatter": stamp_dates(stamped, today_cdmx(), doc.get("created_at")),
        }
        try:
            self._put(vault_id, doc, updated)
        except RevisionConflict:
            return False
        return True

    def _put(self, vault_id: str, old: dict | None, new: dict) -> None:
        """Escribe `new` registrando antes el cambio en la BITACORA (autor `sistema`) cuando se conoce al dueño."""
        changelog = (ChangeLogService(self._port, self._db, self._owner_id, None, via="system", author=SYSTEM)
                     if self._owner_id is not None else None)
        pending = changelog.begin(vault_id, old, new) if changelog is not None else None
        try:
            rev = self._port.put(self._db, new)
        except RevisionConflict:
            if changelog is not None:
                changelog.fail(pending)
                changelog.flush()
            raise
        if changelog is not None:
            changelog.confirm(pending, rev)
            changelog.flush()
