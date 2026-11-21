"""H-064 F7b: lo que un invitado puede escribir por `/sync/shared/{vault_id}/db/_bulk_docs`.

Todo rechazo sale con `forbidden` y su motivo, igual que el push propio, y lo rechazado NO queda en la base del propietario.
"""
import uuid
from types import SimpleNamespace

import pytest

from app.core.limits import UserLimits
from app.core.models.change_log import ChangeLog
from app.core.models.user import User
from app.routers import sync as sync_router
from app.services import limit_guard
from app.services.vault_service import utc_now
from tests.test_h030_api import vault_of
from tests.test_h064_notes_access import join, put_note
from tests.test_h064_shared_sync import ALL_PATHS, PRIV_C, PUB_A, PUB_B, ROOT, doc_id, feed, owner_db_name, seen_paths, world  # noqa: F401
from tests.test_vaults_api import stored_docs

NEW = "Pub/nueva.md"


def note_doc(vault: str, path: str, content: str = "# Nota", note_id: str | None = None) -> dict:
    """Revisión 1 de una nota nueva, como la escribe el cliente."""
    rev_hash, now = uuid.uuid4().hex, utc_now()
    return {"_id": note_id or f"note:{vault}:{uuid.uuid4()}", "_rev": f"1-{rev_hash}", "_revisions": {"start": 1, "ids": [rev_hash]},
            "type": "note", "vault_id": vault, "path": path, "frontmatter": {}, "content": content,
            "created_at": now, "updated_at": now, "deleted_at": None}


def current(owner, vault: str, note: dict) -> dict:
    """La revisión actual de una nota existente con su historia, leída por el canal propio del propietario."""
    res = owner.post("/sync/db/_bulk_get", params={"revs": "true"}, json={"docs": [{"id": doc_id(vault, note)}]})
    return res.json()["results"][0]["docs"][0]["ok"]


def child(doc: dict, **changes) -> dict:
    """Revisión hija de `doc`."""
    rev_hash, start = uuid.uuid4().hex, doc["_revisions"]["start"] + 1
    return {**doc, "_rev": f"{start}-{rev_hash}", "updated_at": utc_now(), "_revisions": {"start": start, "ids": [rev_hash, *doc["_revisions"]["ids"]]}, **changes}


def push(client, vault, *docs, **kwargs):
    res = client.post(f"/sync/shared/{vault}/db/_bulk_docs", json={"docs": list(docs), "new_edits": False}, **kwargs)
    assert res.status_code == 201, res.text
    return res.json()


def reasons(result) -> list[str]:
    assert all(item["error"] == "forbidden" for item in result)
    return [item["reason"] for item in result]


def owner_content(owner, vault, path):
    """La nota viva de esa ruta tal como la ve el propietario por la API REST (con contenido), o `None`."""
    items = owner.get(f"/vaults/{vault}/notes", params={"limit": 200}).json()["items"]
    found = [n for n in items if n["path"] == path]
    return owner.get(f"/vaults/{vault}/notes/{found[0]['id']}").json() if found else None


@pytest.fixture
def team(world, db):  # noqa: F811
    w = world
    dan, _ = join(w.owner, db, w.vault, "dan@example.com", [{"folder": "*", "level": "escritura"}])
    wes, _ = join(w.owner, db, w.vault, "wes@example.com", [{"folder": "Pub", "level": "escritura"}])
    owner_id = db.query(User).filter(User.email == "cjhirashi@gmail.com").one().id
    return SimpleNamespace(**vars(w), dan=dan, wes=wes, owner_id=owner_id)


# --- Lo que sí puede ---

def test_a_writer_creates_and_edits_notes_inside_its_writable_folder(team):
    w = team
    fresh = note_doc(w.vault, NEW, "# del invitado")
    assert push(w.wes, w.vault, fresh) == []
    assert owner_content(w.owner, w.vault, NEW)["content"] == "# del invitado"
    assert NEW in seen_paths(w.wes, w.vault)

    existing = current(w.owner, w.vault, w.notes[PUB_A])
    assert push(w.wes, w.vault, child(existing, content="editada por wes")) == []
    assert owner_content(w.owner, w.vault, PUB_A)["content"] == "editada por wes"


def test_the_change_is_recorded_under_the_guest_not_the_owner(team):
    w = team
    assert push(w.wes, w.vault, note_doc(w.vault, NEW)) == []
    rows = w.db.query(ChangeLog).filter(ChangeLog.vault_id == w.vault, ChangeLog.path == NEW).all()
    assert rows and {(r.author_kind, r.author) for r in rows} == {("human", "wes@example.com")}


def test_a_star_writer_writes_anywhere_except_the_hidden_zones(team):
    w = team
    assert push(w.dan, w.vault, note_doc(w.vault, "Priv/dan.md"), note_doc(w.vault, "raiz-dan.md")) == []
    for path in ("BITACORA/x.md", "AG - AGENTES/z.md", "AG - MENSAJES/m.md", "AG - SKILLS/s.md", "PLANTILLAS/t.md"):
        doc = note_doc(w.vault, path)
        assert reasons(push(w.dan, w.vault, doc)) == ["share-forbidden:path"], path
        assert owner_content(w.owner, w.vault, path) is None


def test_a_soft_delete_inside_the_writable_folder_goes_through(team):
    w = team
    existing = current(w.owner, w.vault, w.notes[PUB_B])
    assert push(w.wes, w.vault, child(existing, deleted_at=utc_now())) == []
    assert owner_content(w.owner, w.vault, PUB_B) is None


def test_resending_a_stored_batch_is_harmless(team):
    w = team
    doc = note_doc(w.vault, NEW)
    assert push(w.wes, w.vault, doc) == []
    assert push(w.wes, w.vault, doc) == []
    assert len([n for n in w.owner.get(f"/vaults/{w.vault}/notes", params={"limit": 200}).json()["items"] if n["path"] == NEW]) == 1


# --- Lo que no puede ---

def test_a_reader_cannot_write_anything(team):
    w = team
    existing = current(w.owner, w.vault, w.notes[PUB_A])
    for client in (w.ana, w.cam):
        got = push(client, w.vault, note_doc(w.vault, NEW), child(existing, content="pisada"))
        assert reasons(got) == ["share-forbidden:path", "share-forbidden:path"]
    assert owner_content(w.owner, w.vault, NEW) is None
    assert owner_content(w.owner, w.vault, PUB_A)["content"] != "pisada"


def test_a_writer_cannot_create_or_edit_outside_its_writable_folder(team):
    w = team
    priv = current(w.owner, w.vault, w.notes[PRIV_C])
    root = current(w.owner, w.vault, w.notes[ROOT])
    got = push(w.wes, w.vault, note_doc(w.vault, "Priv/x.md"), child(priv, content="hackeado"), child(root, content="hackeado"), note_doc(w.vault, "otra.md"))
    assert reasons(got) == ["share-forbidden:path"] * 4
    assert owner_content(w.owner, w.vault, "Priv/x.md") is None and owner_content(w.owner, w.vault, PRIV_C)["content"] != "hackeado"
    assert owner_content(w.owner, w.vault, ROOT)["content"] != "hackeado" and owner_content(w.owner, w.vault, "otra.md") is None


def test_reading_a_folder_does_not_give_write_access_to_it(team):
    w = team
    priv = current(w.owner, w.vault, w.notes[PRIV_C])
    assert reasons(push(w.bea, w.vault, child(priv, content="bea no escribe en Priv"))) == ["share-forbidden:path"]
    assert push(w.bea, w.vault, note_doc(w.vault, "Pub/bea.md")) == []


def test_moving_or_renaming_is_only_for_the_owner(team):
    w = team
    existing = current(w.owner, w.vault, w.notes[PUB_A])
    renamed = child(existing, path="Pub/renombrada.md")
    to_other_writable = child(existing, path="Pub/sub/a-movida.md")
    out_of_area = child(existing, path="Priv/fuera.md")
    assert reasons(push(w.wes, w.vault, renamed, to_other_writable)) == ["share-forbidden:move", "share-forbidden:move"]
    assert reasons(push(w.wes, w.vault, out_of_area)) == ["share-forbidden:path"]
    assert owner_content(w.owner, w.vault, PUB_A) is not None and owner_content(w.owner, w.vault, "Pub/renombrada.md") is None


def test_a_note_that_lives_where_the_guest_cannot_write_cannot_be_taken_by_writing_it_into_a_writable_path(team):
    w = team
    priv = current(w.owner, w.vault, w.notes[PRIV_C])
    stolen = child(priv, path="Pub/robada.md")
    assert reasons(push(w.wes, w.vault, stolen)) == ["share-forbidden:path"]
    assert owner_content(w.owner, w.vault, "Pub/robada.md") is None


def test_a_forged_history_cannot_graft_a_revision_onto_a_note_outside_the_writable_area(team):
    w = team
    priv = current(w.owner, w.vault, w.notes[PRIV_C])
    forged = {**priv, **{k: v for k, v in note_doc(w.vault, "Pub/injerto.md", "inyectado").items() if k in ("_rev", "_revisions", "path", "content", "updated_at")}}
    assert reasons(push(w.wes, w.vault, forged)) == ["share-forbidden:path"]
    assert owner_content(w.owner, w.vault, PRIV_C)["content"] != "inyectado"


def test_the_vault_document_other_vaults_and_foreign_ids_are_never_writable(team):
    w = team
    vault_doc = next(r["doc"] for r in feed(w.dan, w.vault, include_docs="true")["results"] if r["id"] == f"vault:{w.vault}")
    renamed = child({**vault_doc, "_revisions": {"start": 1, "ids": [vault_doc["_rev"].split("-")[1]]}}, name="Secuestrada")
    foreign_note = note_doc(w.other, "Pub/x.md")
    bad = [{"_id": f"vault:{w.other}", "_rev": "1-" + "a" * 32, "_revisions": {"start": 1, "ids": ["a" * 32]}}, {"_id": "vault-name:x", "_rev": "1-" + "a" * 32, "_revisions": {"start": 1, "ids": ["a" * 32]}}]
    assert reasons(push(w.dan, w.vault, renamed, foreign_note)) == ["share-forbidden:vault"] * 2
    assert set(reasons(push(w.dan, w.vault, *bad))) <= {"share-forbidden:vault", "invalid-id"}
    assert w.owner.get(f"/vaults/{w.vault}").json()["name"] == "Compartida"
    assert owner_content(w.owner, w.other, "Pub/x.md") is None


def test_tombstones_follow_the_same_rule_and_answer_missing_and_forbidden_alike(team):
    w = team
    priv = current(w.owner, w.vault, w.notes[PRIV_C])
    ghost_id = f"note:{w.vault}:{uuid.uuid4()}"

    def tomb(note_id, history):
        rev_hash = uuid.uuid4().hex
        return {"_id": note_id, "_rev": f"{len(history) + 1}-{rev_hash}", "_deleted": True,
                "_revisions": {"start": len(history) + 1, "ids": [rev_hash, *history]}}

    got = reasons(push(w.wes, w.vault, tomb(priv["_id"], priv["_revisions"]["ids"]), tomb(ghost_id, ["a" * 32])))
    assert got == ["share-forbidden:path", "share-forbidden:path"]


def test_deleting_an_index_note_goes_through_the_same_guard(team):
    """Los borrados de INDICE se evalúan aparte del flujo normal; la guarda del invitado también debe cubrirlos."""
    w = team
    rows = w.owner.get("/sync/db/_changes", params={"include_docs": "true"}).json()["results"]
    index = next(r["doc"] for r in rows if r["doc"].get("path") == "Priv/INDICE.md")
    full = w.owner.post("/sync/db/_bulk_get", params={"revs": "true"}, json={"docs": [{"id": index["_id"]}]}).json()["results"][0]["docs"][0]["ok"]
    assert reasons(push(w.wes, w.vault, child(full, deleted_at=utc_now()))) == ["share-forbidden:path"]


def test_a_mixed_batch_keeps_the_allowed_and_rejects_only_the_forbidden(team):
    w = team
    good, bad = note_doc(w.vault, "Pub/buena.md"), note_doc(w.vault, "Priv/mala.md")
    result = push(w.wes, w.vault, good, bad)
    assert [item["id"] for item in result] == [bad["_id"]] and reasons(result) == ["share-forbidden:path"]
    assert owner_content(w.owner, w.vault, "Pub/buena.md") is not None and owner_content(w.owner, w.vault, "Priv/mala.md") is None


def test_what_a_guest_creates_counts_against_the_owner_limits(team, monkeypatch):
    """Los límites de la cuenta (H-060) no rigen para administradores: se sustituyen para que solo el PROPIETARIO tenga tope."""
    w = team
    capped = UserLimits(max_vaults=None, max_notes_per_vault=1, max_storage_bytes_per_vault=None)
    monkeypatch.setattr(limit_guard, "limits_of", lambda user: capped if user.id == w.owner_id else UserLimits(None, None, None))
    assert reasons(push(w.wes, w.vault, note_doc(w.vault, NEW))) == ["document-limit-reached"]
    assert owner_content(w.owner, w.vault, NEW) is None
    existing = current(w.owner, w.vault, w.notes[PUB_A])
    assert push(w.wes, w.vault, child(existing, content="editar no suma")) == []


def test_the_own_channel_answers_a_limit_rejection_with_its_reason_instead_of_failing(team, monkeypatch):
    """Antes de H-064 el patrón de motivos no incluía los de H-060: un límite alcanzado al sincronizar daba 500."""
    w = team
    capped = UserLimits(max_vaults=None, max_notes_per_vault=1, max_storage_bytes_per_vault=None)
    monkeypatch.setattr(limit_guard, "limits_of", lambda user: capped)
    res = w.owner.post("/sync/db/_bulk_docs", json={"docs": [note_doc(w.vault, "Propia.md")], "new_edits": False})
    assert res.status_code == 201, res.text
    assert reasons(res.json()) == ["document-limit-reached"]


def test_the_owner_rules_still_apply_to_what_a_guest_may_write(team):
    w = team
    other = note_doc(w.vault, PUB_A)  # otra nota con la ruta de una existente: la ruta ya está tomada
    assert reasons(push(w.wes, w.vault, other)) == ["note-path-taken"]
    assert reasons(push(w.wes, w.vault, {**note_doc(w.vault, NEW), "extra": 1})) == ["validation-error:extra"]


def test_a_large_batch_is_not_cut_at_the_default_body_limit(team):
    w = team
    big = "x" * (1_500_000)
    docs = [note_doc(w.vault, f"Pub/grande{i}.md", big) for i in range(3)]
    assert push(w.wes, w.vault, *docs) == []


def test_non_members_pending_revoked_and_the_owner_cannot_push(team, db):
    w = team
    from tests.test_h064_invitations_api import invite, person
    doc = note_doc(w.vault, NEW)
    stranger = person(w.owner, db, "extrano@example.com")
    pending = person(w.owner, db, "pend@example.com")
    invite(w.owner, w.vault, "pend@example.com", [{"folder": "Pub", "level": "escritura"}])
    for client in (stranger, pending, w.owner):
        res = client.post(f"/sync/shared/{w.vault}/db/_bulk_docs", json={"docs": [doc], "new_edits": False})
        assert res.status_code == 404
    assert owner_content(w.owner, w.vault, NEW) is None


def test_a_revoked_writer_loses_the_push_at_once(team):
    w = team
    assert push(w.wes, w.vault, note_doc(w.vault, "Pub/antes.md")) == []
    member = next(m for m in w.owner.get(f"/vaults/{w.vault}/members").json()["items"] if m["user"]["email"] == "wes@example.com")
    assert w.owner.delete(f"/vaults/{w.vault}/members/{member['id']}").status_code == 204
    assert w.wes.post(f"/sync/shared/{w.vault}/db/_bulk_docs", json={"docs": [note_doc(w.vault, "Pub/despues.md")], "new_edits": False}).status_code == 404
    assert owner_content(w.owner, w.vault, "Pub/despues.md") is None


def test_new_edits_true_is_refused(team):
    w = team
    res = w.wes.post(f"/sync/shared/{w.vault}/db/_bulk_docs", json={"docs": [note_doc(w.vault, NEW)], "new_edits": True})
    assert res.status_code == 422
    assert owner_content(w.owner, w.vault, NEW) is None


def test_the_body_limit_by_route_keeps_the_old_values_for_the_own_channel_and_extends_to_the_shared_one():
    limit = sync_router._body_limit
    assert limit("/sync/db/_bulk_docs") == sync_router.MAX_BULK_DOCS_BYTES
    assert limit("/sync/shared/{vault_id}/db/_bulk_docs") == sync_router.MAX_BULK_DOCS_BYTES
    assert limit("/sync/db/_local/{local_id}") == sync_router.MAX_LOCAL_BYTES
    assert limit("/sync/shared/{vault_id}/db/_local/{local_id}") == sync_router.MAX_LOCAL_BYTES
    assert limit("/sync/db/_revs_diff") == sync_router.MAX_BODY_BYTES
    assert limit("/sync/shared/{vault_id}/db/_changes") == sync_router.MAX_BODY_BYTES
