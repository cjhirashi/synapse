"""Mantenimiento de las conversaciones de `AG - MENSAJES` que hace el servidor (H-030 E4).

Reabrir una conversación cerrada cuando alguien escribe en ella (Q6), sellar `cerrada_el` en una cabecera
que llegó por la sincronización y encontrar la cabecera de una conversación. Sobre la base de un usuario, a
través de `VaultPort`.
"""
import logging

from app.core.ag_rules import CABECERA, conversation_folder, stamp_cabecera
from app.core.errors import RevisionConflict
from app.core.note_dates import stamp_dates, today_cdmx
from app.core.note_prefix import in_folder, view_key
from app.core.ports.vault_port import VaultPort
from app.core.timestamps import utc_now

logger = logging.getLogger(__name__)


class MensajesService:
    def __init__(self, port: VaultPort, db: str):
        self._port = port
        self._db = db

    def find_cabecera(self, vault_id: str, para: str, conversation: str) -> dict | None:
        """La nota `000-cabecera.md` viva de la conversación, o `None`."""
        folder = conversation_folder(para, conversation)
        after = None
        while True:
            docs = self._port.list_notes_by_prefix(self._db, vault_id, False, view_key(folder), 100, after)
            for doc in docs:
                if in_folder(doc["path"], folder) and doc["path"].rsplit("/", 1)[-1] == CABECERA:
                    return doc
            if len(docs) < 100:
                return None
            after = (view_key(docs[-1]["path"]), docs[-1]["_id"])

    def reopen_if_closed(self, vault_id: str, para: str, conversation: str) -> bool:
        """Escribir en una conversación cerrada la reabre (Q6): `estado` pasa a `abierta` y `cerrada_el` se quita."""
        for _ in range(2):  # un reintento si otra escritura cambió la cabecera entre la lectura y la escritura
            cabecera = self.find_cabecera(vault_id, para, conversation)
            if cabecera is None or (cabecera.get("frontmatter") or {}).get("estado") != "cerrada":
                return False
            if self._rewrite(cabecera, {**cabecera["frontmatter"], "estado": "abierta"}):
                return True
        return False

    def settle(self, doc_id: str) -> None:
        """Deja la cabecera `doc_id` con `cerrada_el` coherente con su `estado` (cerrada con hora; abierta sin
        ella). Para cabeceras que llegaron por la sincronización, donde el servidor no puede editar la revisión
        que acepta y escribe una posterior. Mejor esfuerzo: un fallo se registra y la purga lo ignora."""
        try:
            doc = self._port.get(self._db, doc_id)
            if doc is None or doc.get("deleted_at") or doc.get("type") != "note":
                return
            frontmatter = doc.get("frontmatter") or {}
            desired = stamp_cabecera(frontmatter, frontmatter, utc_now())
            if desired != frontmatter:
                self._rewrite(doc, frontmatter)
        except Exception:  # noqa: BLE001
            logger.warning("settle of %s failed", doc_id, exc_info=True)

    def _rewrite(self, doc: dict, new_frontmatter: dict) -> bool:
        stamped = stamp_cabecera(doc.get("frontmatter"), new_frontmatter, utc_now())
        updated = {
            **doc, "updated_at": utc_now(),
            "frontmatter": stamp_dates(stamped, today_cdmx(), doc.get("created_at")),
        }
        try:
            self._port.put(self._db, updated)
        except RevisionConflict:
            return False
        return True
