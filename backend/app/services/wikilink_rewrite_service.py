"""Reescritura de wikilinks en una bóveda tras mover o renombrar notas (H-039).

CouchDB no tiene transacciones entre documentos: cada nota se escribe sobre el `_rev` leído; si otra
escritura entró entre medias (`RevisionConflict`) se relee, se reaplica la regla pura sobre el contenido
fresco y se reintenta (hasta `_ATTEMPTS`). Una nota ajena que no cede se cuenta en `pending` y las demás
siguen: nunca se pisa una edición concurrente.
"""
from collections.abc import Callable
from typing import NamedTuple

from app.core.errors import RevisionConflict
from app.core.index_rules import is_index_path
from app.core.note_dates import stamp_dates, today_cdmx
from app.core.note_rules import path_key
from app.core.ports.vault_port import VaultPort
from app.core.timestamps import utc_now
from app.core.wikilink_rewrite import Rename, plan_renames, rewrite_note

_ATTEMPTS = 3
_PAGE = 100


class RewriteReport(NamedTuple):
    notes: int = 0        # notas reescritas
    links: int = 0        # wikilinks reescritos
    ambiguous: int = 0    # nombres ambiguos que no se tocaron
    pending: int = 0      # notas que siguieron chocando por `_rev` y quedaron sin reescribir
    pending_ids: tuple[str, ...] = ()

    def header(self) -> str:
        return f"notes={self.notes}; links={self.links}; ambiguous={self.ambiguous}; pending={self.pending}"


def _name_key(path: str) -> str:
    return path_key(path.rsplit("/", 1)[-1])


class WikilinkRewriteService:
    """Reescribe, en todas las notas vivas de la bóveda, los wikilinks que apuntaban a rutas que cambiaron."""

    def __init__(self, port: VaultPort, db: str, today: Callable[[], str] = today_cdmx):
        self._port = port
        self._db = db
        self._today = today

    def rewrite(self, vault_id: str, moved: dict[str, Rename]) -> RewriteReport:
        """`moved`: `_id` de cada nota ya movida -> su renombre. Las notas movidas deben estar ya escritas con su
        ruta nueva; el censo de nombres se mide como era ANTES del movimiento (esas notas cuentan con su ruta vieja)."""
        renames = [r for r in moved.values() if path_key(r.old_path) != path_key(r.new_path)]
        if not renames:
            return RewriteReport()
        census: dict[str, int] = {}
        candidates: list[str] = []
        after = None
        while True:
            page = self._port.list_notes(self._db, vault_id, False, _PAGE, after)
            for doc in page:
                if doc.get("deleted_at"):
                    continue
                path = moved[doc["_id"]].old_path if doc["_id"] in moved else doc["path"]
                if is_index_path(path):
                    continue
                key = _name_key(path)
                census[key] = census.get(key, 0) + 1
                if "[[" in (doc.get("content") or ""):
                    candidates.append(doc["_id"])
            if len(page) < _PAGE:
                break
            after = (page[-1]["created_at"], page[-1]["_id"])
        plan = plan_renames(renames, census)

        notes = links = pending = 0
        ambiguous: set[str] = set()
        pending_ids: list[str] = []
        for doc_id in candidates:
            outcome = self._rewrite_one(doc_id, plan)
            if outcome is None:
                continue
            count, names, ok = outcome
            ambiguous.update(names)
            if not ok:
                pending += 1
                pending_ids.append(doc_id)
            elif count:
                notes += 1
                links += count
        return RewriteReport(notes, links, len(ambiguous), pending, tuple(pending_ids))

    def _rewrite_one(self, doc_id: str, plan) -> tuple[int, list[str], bool] | None:
        """`(enlaces, ambiguos, ok)`; `None` si la nota ya no existe o está en la papelera."""
        names: list[str] = []
        for _ in range(_ATTEMPTS):
            doc = self._port.get(self._db, doc_id)
            if doc is None or doc.get("type") != "note" or doc.get("deleted_at"):
                return None
            result = rewrite_note(doc.get("content") or "", plan)
            names = result.ambiguous
            if result.links == 0:
                return 0, names, True
            updated = {
                **doc, "content": result.content, "updated_at": utc_now(),
                "frontmatter": stamp_dates(doc.get("frontmatter"), self._today(), doc.get("created_at")),
            }
            try:
                self._port.put(self._db, updated)
                return result.links, names, True
            except RevisionConflict:
                continue
        return 0, names, False
