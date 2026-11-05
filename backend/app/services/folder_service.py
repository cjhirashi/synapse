"""Mover o renombrar una carpeta de una bóveda por la API (H-039).

Fases (CouchDB no tiene transacciones entre documentos; ver `plan.md` §2 de H-039):
1. Planificar, solo lectura: qué notas se mueven, a dónde, y si algo choca. Si algo falla aquí no se ha escrito nada.
2. Mover nota por nota: reservar la ruta nueva, escribir sobre el `_rev` leído, liberar la vieja.
3. Reescribir los wikilinks de la bóveda (`WikilinkRewriteService`).

Reejecutar la misma operación es seguro: si `from` ya no tiene notas pero `to` sí, solo se completa la reescritura.
"""
from typing import NamedTuple

from app.core import ag_rules, doc_names, meta_rules, plantilla_rules
from app.core.agent_access import Actor, check_registration_frontmatter
from app.core.errors import (
    FolderMoveInvalid, FolderNotFound, NotePathTaken as NotePathTakenProblem, RevisionConflict, ValidationFailed,
    WikilinkRewriteConflict,
)
from app.core.index_rules import is_index_path
from app.core.note_dates import stamp_dates, today_cdmx
from app.core.note_rules import check_path, path_key
from app.core.ports.vault_port import VaultPort
from app.core.timestamps import utc_now
from app.core.wikilink_rewrite import Rename
from app.services.agent_access_guard import AgentAccessGuard, invalidate_registry
from app.services.change_log_service import ChangeLogService
from app.services.note_content_service import NoteContentService
from app.services.note_service import NotePathTaken, NoteService
from app.services.wikilink_rewrite_service import RewriteReport, WikilinkRewriteService

_PAGE = 100


class FolderMoveResult(NamedTuple):
    from_: str
    to: str
    moved_notes: int
    rewrite: RewriteReport


def _segments(path: str) -> list[str]:
    return path.split("/")


def _under(path: str, folder: str) -> str | None:
    """El resto de `path` por debajo de `folder` (comparando con `path_key` segmento a segmento), o `None`."""
    n = len(_segments(folder))
    parts = _segments(path)
    if len(parts) > n and path_key("/".join(parts[:n])) == path_key(folder):
        return "/".join(parts[n:])
    return None


class FolderService:
    def __init__(
        self, port: VaultPort, db: str, actor: Actor | None = None, guard: AgentAccessGuard | None = None,
        changelog: ChangeLogService | None = None,
    ):
        self._port = port
        self._db = db
        self._notes = NoteService(port, db)
        self._contents = NoteContentService(port, db)
        self._actor = actor
        self._guard = guard
        self._changelog = changelog  # H-030b: cada nota movida consta en la BITACORA

    def move(self, vault_id: str, from_: str, to: str) -> FolderMoveResult:
        self._contents.check_vault_active(vault_id)
        for field, value in (("from", from_), ("to", to)):
            if not value or check_path(f"{value}/INDICE.md") is not None:
                raise FolderMoveInvalid(errors=[{"pointer": f"#/{field}", "detail": "validation-error:path"}])
        if from_ == to:
            return FolderMoveResult(from_, to, 0, RewriteReport())
        if (code := ag_rules.check_folder_move(from_, to)) is not None:
            raise FolderMoveInvalid(errors=[{"pointer": "#/from", "detail": code}])
        if self._guard is not None:
            self._guard.check(vault_id, "folder-move", [f"{from_}/x.md", f"{to}/x.md"])
        self._check_ag_targets_unmovable(from_)
        if path_key(from_) != path_key(to) and _under(f"{to}/x", from_) is not None:
            raise FolderMoveInvalid(errors=[{"pointer": "#/to", "detail": "folder-inside-itself"}])

        live = self._live_notes(vault_id)
        movers = [d for d in live if _under(d["path"], from_) is not None]
        if not movers:
            return self._repair(vault_id, live, from_, to)

        mover_ids = {d["_id"] for d in movers}
        taken = {path_key(d["path"]): d for d in live if d["_id"] not in mover_ids}
        plan: list[tuple[dict, str | None]] = []  # (nota, ruta nueva; None = el INDICE sobrante se descarta)
        for doc in movers:
            new_path = f"{to}/{_under(doc['path'], from_)}"
            if (code := check_path(new_path)) is not None:
                raise ValidationFailed(errors=[{"pointer": "#/to", "detail": code}])
            if (code := ag_rules.check_mensaje_path(new_path)) is not None:
                raise ValidationFailed(errors=[{"pointer": "#/to", "detail": code}])
            if (code := ag_rules.check_create(new_path)) is not None:
                raise ValidationFailed(errors=[{"pointer": "#/to", "detail": code}])
            if (code := doc_names.is_canonical(new_path)) is not None:  # H-041 E2: una carpeta movida no renombra notas
                raise ValidationFailed(errors=[{"pointer": "#/to", "detail": code}])
            if (code := meta_rules.check_note_write(
                    path=new_path, prev_path=doc["path"], frontmatter=doc.get("frontmatter"),
                    actor_kind=self._actor.kind if self._actor else "human")) is not None:
                raise ValidationFailed(errors=[{"pointer": "#/to", "detail": code}])
            name = plantilla_rules.template_name(doc["path"])
            if (name is not None and plantilla_rules.template_name(new_path) != name
                    and self._contents.count_template_users(vault_id, name) > 0):
                raise ValidationFailed(errors=[{"pointer": "#/to", "detail": "plantilla:in-use"}])
            if (ag_rules.meta_folder_of(new_path) == ag_rules.AG_AGENTES and not is_index_path(new_path)
                    and (code := check_registration_frontmatter(new_path, doc.get("frontmatter"))) is not None):
                raise ValidationFailed(errors=[{"pointer": "#/to", "detail": code}])
            holder = taken.get(path_key(new_path))
            if holder is not None and is_index_path(new_path):
                plan.append((doc, None))  # ya hay un INDICE en el destino: manda el del destino
            elif holder is not None:
                raise NotePathTakenProblem(f"{new_path!r} is already used by another note")
            else:
                plan.append((doc, new_path))

        moved: dict[str, Rename] = {}
        try:
            for doc, new_path in plan:
                if new_path is None:
                    self._discard(doc)
                    continue
                self._move(doc, new_path)
                moved[doc["_id"]] = Rename(doc["path"], new_path)
        except NotePathTaken as error:
            raise NotePathTakenProblem(str(error)) from None
        except RevisionConflict as error:
            raise WikilinkRewriteConflict(f"a moved note changed during the operation: {error}") from None

        self._contents.ensure_indexes(vault_id, f"{to}/x.md")
        invalidate_registry(self._db, vault_id)
        if self._changelog is not None:
            self._changelog.flush()
        # Notas que una corrida anterior interrumpida ya movió: sus enlaces se completan ahora.
        moved_now = len(moved)
        moved.update(self._already_moved(live, set(moved), from_, to))
        report = WikilinkRewriteService(self._port, self._db).rewrite(vault_id, moved)
        return FolderMoveResult(from_, to, moved_now, report)

    def _check_ag_targets_unmovable(self, from_: str) -> None:
        """Los mensajes son inmutables para un agente: no mueve nada bajo `AG - MENSAJES`."""
        if (self._actor is not None and self._actor.kind == "agent"
                and ag_rules.meta_folder_of(f"{from_}/x.md") == ag_rules.AG_MENSAJES):
            raise FolderMoveInvalid(errors=[{"pointer": "#/from", "detail": "ag-mensajes:immutable"}])

    def _live_notes(self, vault_id: str) -> list[dict]:
        docs, after = [], None
        while True:
            page = self._port.list_notes(self._db, vault_id, False, _PAGE, after)
            docs += [d for d in page if not d.get("deleted_at")]
            if len(page) < _PAGE:
                return docs
            after = (page[-1]["created_at"], page[-1]["_id"])

    @staticmethod
    def _already_moved(live: list[dict], exclude: set[str], from_: str, to: str) -> dict[str, Rename]:
        """Notas que ya están bajo `to` (no las movidas ahora), tratadas como si vinieran de `from`: reescribir
        enlaces que ya apuntan a la ruta nueva no cambia nada, y los que seguían en la vieja se completan."""
        return {
            d["_id"]: Rename(f"{from_}/{rest}", d["path"])
            for d in live
            if d["_id"] not in exclude and not is_index_path(d["path"]) and (rest := _under(d["path"], to)) is not None
        }

    def _repair(self, vault_id: str, live: list[dict], from_: str, to: str) -> FolderMoveResult:
        """`from` ya no tiene notas vivas: si `to` sí, se completa la reescritura que pudo quedar pendiente."""
        moved = self._already_moved(live, set(), from_, to)
        if not moved:
            raise FolderNotFound(f"neither {from_!r} nor {to!r} has live notes")
        report = WikilinkRewriteService(self._port, self._db).rewrite(vault_id, moved)
        return FolderMoveResult(from_, to, 0, report)

    def _move(self, doc: dict, new_path: str) -> None:
        """Reserva la ruta nueva, escribe la nota sobre su `_rev` y libera la vieja."""
        self._notes.reserve_path(doc["_id"], new_path)
        try:
            updated = {
                **doc, "path": new_path, "updated_at": utc_now(),
                "frontmatter": stamp_dates(doc.get("frontmatter"), today_cdmx(), doc.get("created_at")),
            }
            pending = self._changelog.begin(doc["vault_id"], doc, updated) if self._changelog is not None else None
            try:
                rev = self._port.put(self._db, updated)
            except RevisionConflict:
                if self._changelog is not None:
                    self._changelog.fail(pending)
                raise
            if self._changelog is not None:
                self._changelog.confirm(pending, rev)
        except RevisionConflict:
            self._notes.release_path(doc["_id"], new_path)
            raise
        self._notes.release_path(doc["_id"], doc["path"])

    def _discard(self, doc: dict) -> None:
        """INDICE de origen cuyo destino ya tiene el suyo: va a la papelera."""
        self._port.put(self._db, {**doc, "deleted_at": utc_now()})
        self._notes.release_path(doc["_id"], doc["path"])
